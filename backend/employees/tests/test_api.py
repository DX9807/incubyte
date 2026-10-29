from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework.test import APIClient, APITestCase

from compensation.models import SalaryRecord
from employees.countries import COUNTRY_CURRENCIES
from employees.models import Department, Employee


@override_settings(SECURE_SSL_REDIRECT=False)
class EmployeeAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.hr = get_user_model().objects.create_user(username='hr-api', is_staff=True)
        cls.department = Department.objects.create(name='Engineering')
        cls.other_department = Department.objects.create(name='Finance')
        cls.employee = Employee.objects.create(
            employee_code='EMP-00001', full_name='Aditi Sharma', email='aditi@example.com',
            department=cls.department, country='IN', job_title='Engineer')
        cls.salary = SalaryRecord.objects.create(
            employee=cls.employee, annual_salary='1200000.00', currency='INR',
            effective_from=date(2020, 1, 1))
        cls.other = Employee.objects.create(
            employee_code='EMP-00002', full_name='Alex Jones', email='alex@example.com',
            department=cls.other_department, country='US', job_title='Analyst', is_active=False)
        SalaryRecord.objects.create(employee=cls.other, annual_salary='90000.00',
                                    currency='USD', effective_from=date(2020, 1, 1))

    def setUp(self):
        self.client.force_authenticate(user=self.hr)
        self.list_url = reverse('employee-list')
        self.detail_url = reverse('employee-detail', args=[self.employee.pk])

    def payload(self, **changes):
        return dict(employee_code='EMP-00003', full_name='New Employee', email='new@example.com',
                    department=self.department.pk, country='IN', job_title='Engineer',
                    annual_salary='1500000.00') | changes

    def test_create_employee_and_initial_salary(self):
        with patch('employees.serializers.timezone.localdate', return_value=date(2026, 1, 15)):
            response = self.client.post(self.list_url, self.payload(), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        employee = Employee.objects.get(pk=response.data['id'])
        record = employee.salary_records.get()
        self.assertEqual(record.effective_from, date(2026, 1, 15))
        self.assertEqual(record.annual_salary, Decimal('1500000.00'))
        self.assertEqual(record.currency, 'INR')
        self.assertEqual(response.data['annual_salary'], '1500000.00')
        self.assertEqual(response.data['currency'], 'INR')
        self.assertEqual(response.data['department_name'], 'Engineering')
        self.assertTrue(response.data['is_active'])

    def test_country_determines_currency(self):
        for country, currency in COUNTRY_CURRENCIES.items():
            with self.subTest(country=country):
                response = self.client.post(self.list_url, self.payload(
                    employee_code=f'NEW-{country}', email=f'{country}@example.com', country=country),
                    format='json')
                self.assertEqual(response.status_code, 201, response.data)
                self.assertEqual(response.data['currency'], currency)

    def test_invalid_creation_returns_field_errors_without_writes(self):
        invalid = [('annual_salary', '0'), ('annual_salary', '-1'),
                   ('annual_salary', '1.001'), ('annual_salary', 'NaN'),
                   ('annual_salary', None), ('annual_salary', '1000000000000.00'),
                   ('email', 'invalid'), ('country', 'XX'), ('department', 999999),
                   ('department', None), ('full_name', ''), ('job_title', ''),
                   ('employee_code', ''), ('currency', 'USD'), ('effective_from', '2020-01-01')]
        for field, value in invalid:
            with self.subTest(field=field, value=value):
                response = self.client.post(self.list_url, self.payload(**{field: value}), format='json')
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn(field, response.data)
                self.assertEqual(Employee.objects.count(), 2)
                self.assertEqual(SalaryRecord.objects.count(), 2)

    def test_missing_required_creation_fields(self):
        for field in ['annual_salary', 'country', 'department', 'employee_code', 'full_name', 'email', 'job_title']:
            with self.subTest(field=field):
                payload = self.payload()
                del payload[field]
                response = self.client.post(self.list_url, payload, format='json')
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)

    def test_invalid_json_shape_returns_validation_error(self):
        response = self.client.post(self.list_url, ['invalid'], format='json')
        self.assertEqual(response.status_code, 400)

    def test_duplicate_identifiers_are_rejected(self):
        for field in ['employee_code', 'email']:
            with self.subTest(field=field):
                response = self.client.post(self.list_url, self.payload(
                    **{field: getattr(self.employee, field)}), format='json')
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)
                self.assertEqual(Employee.objects.count(), 2)

    def test_salary_write_failure_rolls_back_employee(self):
        with patch.object(SalaryRecord, 'save', side_effect=RuntimeError('salary insert failed')):
            with self.assertRaisesMessage(RuntimeError, 'salary insert failed'):
                self.client.post(self.list_url, self.payload(), format='json')
        self.assertFalse(Employee.objects.filter(employee_code='EMP-00003').exists())
        self.assertEqual(SalaryRecord.objects.count(), 2)

    def test_salary_validation_failure_rolls_back_employee(self):
        from django.core.exceptions import ValidationError
        with patch.object(SalaryRecord, 'full_clean', side_effect=ValidationError({'annual_salary': 'Invalid salary.'})):
            response = self.client.post(self.list_url, self.payload(), format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('annual_salary', response.data)
        self.assertEqual(Employee.objects.count(), 2)

    def test_list_and_detail_include_current_salary(self):
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 2)
        self.assertEqual([item['employee_code'] for item in response.data['results']],
                         ['EMP-00001', 'EMP-00002'])
        detail = self.client.get(self.detail_url)
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data['annual_salary'], '1200000.00')
        self.assertEqual(detail.data['currency'], 'INR')

    @patch('employees.views.timezone.localdate', return_value=date(2026, 1, 15))
    def test_current_salary_uses_latest_effective_record_and_ignores_future(self, today):
        SalaryRecord.objects.create(employee=self.employee, annual_salary='1600000.00',
                                    currency='INR', effective_from=today())
        SalaryRecord.objects.create(employee=self.employee, annual_salary='1800000.00',
                                    currency='INR', effective_from=today() + timedelta(days=1))
        for url in [self.list_url, self.detail_url]:
            response = self.client.get(url)
            data = response.data['results'][0] if url == self.list_url else response.data
            self.assertEqual(data['annual_salary'], '1600000.00')

    def test_employee_without_salary_returns_null(self):
        SalaryRecord.objects.filter(employee=self.employee).delete()
        response = self.client.get(self.detail_url)
        self.assertIsNone(response.data['annual_salary'])
        self.assertIsNone(response.data['currency'])

    def test_search_by_name_email_and_employee_code(self):
        for term in ['aditi', 'ADITI@EXAMPLE.COM', 'EMP-00001']:
            with self.subTest(term=term):
                response = self.client.get(self.list_url, {'search': term})
                self.assertEqual(response.data['count'], 1)
                self.assertEqual(response.data['results'][0]['id'], self.employee.pk)

    def test_filters_and_combined_search(self):
        for selected, expected in [({'department': self.department.pk}, self.employee.pk),
                                   ({'country': 'US'}, self.other.pk),
                                   ({'is_active': 'false'}, self.other.pk),
                                   ({'is_active': 'true'}, self.employee.pk),
                                   ({'country': 'IN', 'department': self.department.pk,
                                     'is_active': 'true', 'search': 'Aditi'}, self.employee.pk)]:
            with self.subTest(selected=selected):
                response = self.client.get(self.list_url, selected)
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.data['count'], 1)
                self.assertEqual(response.data['results'][0]['id'], expected)

    def test_invalid_filters_return_field_errors(self):
        for field, value in [('department', 'abc'), ('department', '0'), ('country', 'XX'),
                             ('country', ''), ('is_active', 'yes'), ('is_active', '')]:
            with self.subTest(field=field, value=value):
                response = self.client.get(self.list_url, {field: value})
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)

    def test_no_matches_returns_empty_page(self):
        response = self.client.get(self.list_url, {'search': 'no-match'})
        self.assertEqual(response.data, {'count': 0, 'next': None, 'previous': None, 'results': []})

    def test_server_side_pagination_and_bounded_query_count(self):
        employees = [Employee(employee_code=f'EMP-{i:05}', full_name='Example',
                              email=f'example{i}@example.com', department=self.department,
                              country='IN', job_title='Engineer') for i in range(3, 54)]
        Employee.objects.bulk_create(employees)
        SalaryRecord.objects.bulk_create([
            SalaryRecord(employee=employee, annual_salary='1000000.00', currency='INR',
                         effective_from=date(2020, 1, 1)) for employee in employees])
        with CaptureQueriesContext(connection) as captured:
            first = self.client.get(self.list_url)
        self.assertEqual(len(captured), 2)  # Count plus one joined/annotated page query.
        self.assertEqual(first.data['count'], 53)
        self.assertEqual(len(first.data['results']), 50)
        self.assertIsNotNone(first.data['next'])
        second = self.client.get(self.list_url, {'page': 2})
        self.assertEqual(len(second.data['results']), 3)
        self.assertIsNone(second.data['next'])
        self.assertEqual(self.client.get(self.list_url, {'page': 99}).status_code, 404)

    def test_profile_update_preserves_salary(self):
        response = self.client.patch(self.detail_url, {
            'full_name': 'Aditi Rao', 'job_title': 'Senior Engineer',
            'email': 'aditi.rao@example.com', 'department': self.other_department.pk,
            'employee_code': 'EMP-UPDATED'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.full_name, 'Aditi Rao')
        self.assertEqual(self.employee.department, self.other_department)
        self.assertEqual(response.data['department_name'], 'Finance')
        self.assertEqual(response.data['annual_salary'], '1200000.00')
        self.assertEqual(self.employee.salary_records.count(), 1)

    def test_patch_rejects_protected_fields_without_partial_changes(self):
        for field, value in [('country', 'US'), ('annual_salary', '2000000.00'),
                             ('currency', 'USD'), ('effective_from', '2020-02-01')]:
            with self.subTest(field=field):
                response = self.client.patch(self.detail_url, {'full_name': 'Changed', field: value}, format='json')
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)
                self.employee.refresh_from_db()
                self.assertEqual(self.employee.full_name, 'Aditi Sharma')

    def test_patch_rejects_duplicate_and_invalid_profile_fields(self):
        for field, value in [('email', self.other.email), ('employee_code', self.other.employee_code),
                             ('email', 'invalid'), ('department', 999999), ('full_name', '')]:
            with self.subTest(field=field):
                response = self.client.patch(self.detail_url, {field: value}, format='json')
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)

    def test_deactivation_retains_history_and_can_be_reactivated(self):
        for active in [False, True]:
            response = self.client.patch(self.detail_url, {'is_active': active}, format='json')
            self.assertEqual(response.status_code, 200)
            self.employee.refresh_from_db()
            self.assertEqual(self.employee.is_active, active)
            self.assertEqual(self.employee.salary_records.get().pk, self.salary.pk)

    def test_department_list_is_read_only_and_alphabetical(self):
        url = reverse('department-list')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [{'id': self.department.pk, 'name': 'Engineering'},
                                         {'id': self.other_department.pk, 'name': 'Finance'}])
        self.assertEqual(self.client.post(url, {'name': 'New'}, format='json').status_code, 405)

    def test_missing_employee_and_unsupported_methods(self):
        missing = reverse('employee-detail', args=[999999])
        self.assertEqual(self.client.get(missing).status_code, 404)
        self.assertEqual(self.client.patch(missing, {}, format='json').status_code, 404)
        self.assertEqual(self.client.delete(self.detail_url).status_code, 405)
        self.assertEqual(self.client.put(self.detail_url, self.payload(), format='json').status_code, 405)

    def test_anonymous_and_nonstaff_are_denied(self):
        nonstaff = get_user_model().objects.create_user(username='nonstaff')
        for user in [None, nonstaff]:
            self.client.force_authenticate(user=user)
            for method, url, data in [('get', self.list_url, None), ('get', self.detail_url, None),
                                      ('get', reverse('department-list'), None),
                                      ('post', self.list_url, self.payload()),
                                      ('patch', self.detail_url, {'is_active': False})]:
                with self.subTest(user=user, method=method, url=url):
                    response = getattr(self.client, method)(url, data, format='json')
                    self.assertEqual(response.status_code, 403)

    def test_inactive_staff_session_is_denied(self):
        inactive = get_user_model().objects.create_user(username='inactive', is_staff=True, is_active=False)
        client = APIClient()
        client.force_login(inactive)
        self.assertEqual(client.get(self.list_url).status_code, 403)

    def test_session_authentication_requires_csrf_for_writes(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.hr)
        self.assertEqual(client.get(self.list_url).status_code, 200)
        self.assertEqual(client.post(self.list_url, self.payload(), format='json').status_code, 403)
        self.assertEqual(client.patch(self.detail_url, {'is_active': False}, format='json').status_code, 403)
        client.get(reverse('admin:index'))
        token = client.cookies['csrftoken'].value
        response = client.post(self.list_url, self.payload(), format='json', HTTP_X_CSRFTOKEN=token)
        self.assertEqual(response.status_code, 201, response.data)

    def test_openapi_documentation_remains_public(self):
        self.client.force_authenticate(user=None)
        for name in ['schema', 'swagger-ui', 'redoc']:
            response = self.client.get(reverse(name))
            self.assertEqual(response.status_code, 200)

    def test_browsable_api_form_accepts_hidden_csrf_token(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.hr)
        response = client.get(self.list_url, HTTP_ACCEPT='text/html')
        self.assertContains(response, 'csrfmiddlewaretoken')
        token = client.cookies['csrftoken'].value
        response = client.post(self.list_url, self.payload(
            csrfmiddlewaretoken=token, is_active='true'), format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
