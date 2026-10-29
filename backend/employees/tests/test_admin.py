from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.test import TestCase, override_settings
from django.urls import reverse

from compensation.models import SalaryRecord
from employees.models import Department, Employee


@override_settings(SECURE_SSL_REDIRECT=False)
class BusinessAdminTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_superuser(
            username='hr', email='hr@example.com', password='test-only-password')
        cls.department = Department.objects.create(name='Engineering')

    def setUp(self):
        self.client.force_login(self.admin)

    def employee_data(self, **changes):
        return dict(employee_code='EMP-00001', full_name='Aditi Sharma',
                    email='aditi@example.com', department=self.department.pk,
                    country='IN', job_title='Engineer', is_active='on',
                    **{'salary_records-TOTAL_FORMS': '1',
                       'salary_records-INITIAL_FORMS': '0',
                       'salary_records-MIN_NUM_FORMS': '1',
                       'salary_records-MAX_NUM_FORMS': '1',
                       'salary_records-0-annual_salary': '1200000.00',
                       'salary_records-0-effective_from': '2020-01-01'}) | changes

    def create_employee(self):
        response = self.client.post(reverse('admin:employees_employee_add'), self.employee_data())
        self.assertEqual(response.status_code, 302)
        return Employee.objects.get(employee_code='EMP-00001')

    def test_add_employee_requires_initial_salary_and_derives_currency(self):
        employee = self.create_employee()
        record = employee.salary_records.get()
        self.assertEqual(record.currency, 'INR')
        self.assertEqual(record.annual_salary, Decimal('1200000.00'))
        self.assertEqual(record.effective_from, date(2020, 1, 1))

    def test_missing_or_invalid_initial_salary_does_not_create_employee(self):
        cases = [
            {'salary_records-TOTAL_FORMS': '0'},
            {'salary_records-0-annual_salary': '0'},
            {'salary_records-0-annual_salary': '-10'},
            {'salary_records-0-effective_from': '2999-01-01'},
            {'country': 'XX'},
        ]
        for changes in cases:
            with self.subTest(changes=changes):
                response = self.client.post(reverse('admin:employees_employee_add'),
                                            self.employee_data(**changes))
                self.assertEqual(response.status_code, 200)
                self.assertFalse(Employee.objects.exists())
                self.assertFalse(SalaryRecord.objects.exists())

    def test_initial_salary_failure_rolls_back_employee(self):
        with patch.object(SalaryRecord, 'save', side_effect=RuntimeError('write failed')):
            with self.assertRaisesMessage(RuntimeError, 'write failed'):
                self.client.post(reverse('admin:employees_employee_add'), self.employee_data())
        self.assertFalse(Employee.objects.exists())

    def test_multiple_initial_salary_rows_are_rejected(self):
        response = self.client.post(reverse('admin:employees_employee_add'), self.employee_data(**{
            'salary_records-TOTAL_FORMS': '2',
            'salary_records-1-annual_salary': '1500000.00',
            'salary_records-1-effective_from': '2020-02-01',
        }))
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Employee.objects.exists())

    def test_add_form_renders_required_initial_salary(self):
        response = self.client.get(reverse('admin:employees_employee_add'))
        self.assertContains(response, 'salary_records-0-annual_salary')

    def test_employee_country_and_salary_history_cannot_be_edited(self):
        employee = self.create_employee()
        salary = employee.salary_records.get()
        response = self.client.post(
            reverse('admin:employees_employee_change', args=[employee.pk]),
            self.employee_data(**{'country': 'US', 'is_active': '',
                                 'salary_records-INITIAL_FORMS': '1',
                                 'salary_records-0-id': salary.pk,
                                 'salary_records-0-annual_salary': '1.00',
                                 'salary_records-0-effective_from': '2020-02-01',
                                 'salary_records-0-DELETE': 'on'}))
        self.assertEqual(response.status_code, 302)
        employee.refresh_from_db()
        salary.refresh_from_db()
        self.assertEqual(employee.country, 'IN')
        self.assertFalse(employee.is_active)
        self.assertEqual(salary.annual_salary, Decimal('1200000.00'))
        self.assertEqual(salary.effective_from, date(2020, 1, 1))

    def test_salary_admin_is_view_only_even_for_superuser(self):
        employee = self.create_employee()
        salary = employee.salary_records.get()
        detail = reverse('admin:compensation_salaryrecord_change', args=[salary.pk])
        self.assertEqual(self.client.get(detail).status_code, 200)
        self.assertEqual(self.client.post(detail, {'annual_salary': '1.00'}).status_code, 403)
        self.assertEqual(self.client.get(reverse('admin:compensation_salaryrecord_add')).status_code, 403)
        delete = reverse('admin:compensation_salaryrecord_delete', args=[salary.pk])
        self.assertEqual(self.client.post(delete, {'post': 'yes'}).status_code, 403)
        self.assertTrue(SalaryRecord.objects.filter(pk=salary.pk).exists())

    def test_employee_deletion_is_disabled(self):
        employee = self.create_employee()
        url = reverse('admin:employees_employee_delete', args=[employee.pk])
        self.assertEqual(self.client.post(url, {'post': 'yes'}).status_code, 403)

    def test_admin_lists_render_business_records(self):
        self.create_employee()
        for model, text in [('employees_department', 'Engineering'),
                            ('employees_employee', 'Aditi Sharma'),
                            ('compensation_salaryrecord', '1200000.00')]:
            with self.subTest(model=model):
                response = self.client.get(reverse(f'admin:{model}_changelist'))
                self.assertContains(response, text)

    def test_anonymous_and_staff_without_permissions_cannot_read_salary(self):
        url = reverse('admin:compensation_salaryrecord_changelist')
        self.client.logout()
        self.assertEqual(self.client.get(url).status_code, 302)
        staff = get_user_model().objects.create_user(username='unprivileged', is_staff=True)
        self.client.force_login(staff)
        self.assertEqual(self.client.get(url).status_code, 403)

    def test_employee_add_requires_permission_to_create_initial_salary(self):
        staff = get_user_model().objects.create_user(username='employee-only', is_staff=True)
        staff.user_permissions.add(Permission.objects.get(
            content_type__app_label='employees', codename='add_employee'))
        self.client.force_login(staff)
        response = self.client.post(reverse('admin:employees_employee_add'), self.employee_data())
        self.assertEqual(response.status_code, 403)
        self.assertFalse(Employee.objects.exists())
