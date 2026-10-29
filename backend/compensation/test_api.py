from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import connection
from django.test import override_settings
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework.test import APIClient, APITestCase

from employees.models import Department, Employee

from .models import SalaryRecord


@override_settings(SECURE_SSL_REDIRECT=False)
class SalaryAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.hr = get_user_model().objects.create_user(username='salary-hr', is_staff=True)
        department = Department.objects.create(name='Engineering')
        cls.employee = Employee.objects.create(
            employee_code='EMP-00001', full_name='Aditi Sharma', email='aditi@example.com',
            department=department, country='IN', job_title='Engineer')
        cls.initial = SalaryRecord.objects.create(
            employee=cls.employee, annual_salary='1200000.00', currency='INR',
            effective_from=date(2020, 1, 1))
        cls.other = Employee.objects.create(
            employee_code='EMP-00002', full_name='Alex Jones', email='alex@example.com',
            department=department, country='US', job_title='Engineer')
        SalaryRecord.objects.create(employee=cls.other, annual_salary='90000.00',
                                    currency='USD', effective_from=date(2020, 1, 1))

    def setUp(self):
        self.client.force_authenticate(user=self.hr)
        self.url = reverse('employee-salaries', args=[self.employee.pk])
        clock = patch('compensation.models.timezone.localdate', return_value=date(2026, 2, 1))
        clock.start()
        self.addCleanup(clock.stop)

    def payload(self, **changes):
        return dict(annual_salary='1450000.00', effective_from='2026-01-15') | changes

    def test_valid_revision_preserves_history_and_updates_current_salary(self):
        response = self.client.post(self.url, self.payload(), format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['annual_salary'], '1450000.00')
        self.assertEqual(response.data['currency'], 'INR')
        self.assertEqual(response.data['employee'], self.employee.pk)
        self.assertEqual(response.data['effective_from'], '2026-01-15')
        self.assertIn('created_at', response.data)
        self.initial.refresh_from_db()
        self.assertEqual(self.initial.annual_salary, Decimal('1200000.00'))
        self.assertEqual(self.initial.effective_from, date(2020, 1, 1))
        self.assertEqual(self.employee.salary_records.count(), 2)
        detail = self.client.get(reverse('employee-detail', args=[self.employee.pk]))
        self.assertEqual(detail.data['annual_salary'], '1450000.00')
        listing = self.client.get(reverse('employee-list'), {'search': self.employee.employee_code})
        self.assertEqual(listing.data['results'][0]['annual_salary'], '1450000.00')

    def test_history_is_newest_first_and_isolated_by_employee(self):
        for effective in ['2026-01-15', '2026-02-01']:
            response = self.client.post(self.url, self.payload(effective_from=effective), format='json')
            self.assertEqual(response.status_code, 201)
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(queries), 2)
        self.assertEqual([item['effective_from'] for item in response.data],
                         ['2026-02-01', '2026-01-15', '2020-01-01'])
        self.assertTrue(all(item['employee'] == self.employee.pk for item in response.data))

    def test_invalid_amounts_and_dates_return_field_errors_without_changes(self):
        for field, value in [('annual_salary', '0'), ('annual_salary', '-1'),
                             ('annual_salary', '1.001'), ('annual_salary', 'NaN'),
                             ('annual_salary', None), ('annual_salary', '1000000000000.00'),
                             ('effective_from', 'invalid'), ('effective_from', None),
                             ('effective_from', '2019-12-31'), ('effective_from', '2020-01-01'),
                             ('effective_from', '2026-02-02')]:
            with self.subTest(field=field, value=value):
                response = self.client.post(self.url, self.payload(**{field: value}), format='json')
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn(field, response.data)
                self.assertEqual(self.employee.salary_records.count(), 1)

    def test_duplicate_and_earlier_revision_dates_are_rejected(self):
        self.assertEqual(self.client.post(self.url, self.payload(), format='json').status_code, 201)
        for effective in ['2026-01-15', '2026-01-14']:
            response = self.client.post(self.url, self.payload(effective_from=effective), format='json')
            self.assertEqual(response.status_code, 400)
            self.assertIn('effective_from', response.data)
        self.assertEqual(self.employee.salary_records.count(), 2)

    def test_missing_fields_and_unknown_inputs_are_rejected(self):
        for field in ['annual_salary', 'effective_from']:
            with self.subTest(missing=field):
                values = self.payload()
                del values[field]
                response = self.client.post(self.url, values, format='json')
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)
        for field, value in [('employee', self.other.pk), ('currency', 'USD'),
                             ('id', self.initial.pk), ('created_at', '2020-01-01T00:00:00Z')]:
            with self.subTest(field=field):
                response = self.client.post(self.url, self.payload(**{field: value}), format='json')
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)
        self.assertEqual(self.client.post(self.url, ['invalid'], format='json').status_code, 400)

    def test_currency_comes_from_employee_country(self):
        response = self.client.post(reverse('employee-salaries', args=[self.other.pk]),
                                    self.payload(annual_salary='100000.00'), format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['currency'], 'USD')

    def test_inactive_employee_keeps_history_and_can_receive_revision(self):
        self.employee.is_active = False
        self.employee.save()
        response = self.client.post(self.url, self.payload(), format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(self.client.get(self.url).data), 2)
        self.employee.refresh_from_db()
        self.assertFalse(self.employee.is_active)

    def test_missing_employee_returns_404(self):
        url = reverse('employee-salaries', args=[999999])
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.post(url, self.payload(), format='json').status_code, 404)

    def test_staged_employee_without_initial_salary_cannot_be_revised(self):
        SalaryRecord.objects.filter(employee=self.employee).delete()
        self.assertEqual(self.client.get(self.url).data, [])
        response = self.client.post(self.url, self.payload(), format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('non_field_errors', response.data)
        self.assertFalse(self.employee.salary_records.exists())

    def test_history_cannot_be_edited_or_deleted(self):
        for method in ['put', 'patch', 'delete']:
            self.assertEqual(getattr(self.client, method)(self.url, {}, format='json').status_code, 405)
            self.assertEqual(getattr(self.client, method)(
                f'{self.url}{self.initial.pk}/', {}, format='json').status_code, 404)
        self.assertEqual(self.employee.salary_records.count(), 1)

    def test_anonymous_and_nonstaff_cannot_read_or_revise(self):
        nonstaff = get_user_model().objects.create_user(username='salary-nonstaff')
        for user in [None, nonstaff]:
            self.client.force_authenticate(user=user)
            self.assertEqual(self.client.get(self.url).status_code, 403)
            self.assertEqual(self.client.post(self.url, self.payload(), format='json').status_code, 403)

    def test_session_writes_require_csrf_and_browsable_form_works(self):
        client = APIClient(enforce_csrf_checks=True)
        client.force_login(self.hr)
        self.assertEqual(client.post(self.url, self.payload(), format='json').status_code, 403)
        response = client.get(self.url, HTTP_ACCEPT='text/html')
        self.assertContains(response, 'csrfmiddlewaretoken')
        token = client.cookies['csrftoken'].value
        response = client.post(self.url, self.payload(csrfmiddlewaretoken=token), format='multipart')
        self.assertEqual(response.status_code, 201, response.data)
