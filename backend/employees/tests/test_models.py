from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.test import TestCase

from employees.models import Department, Employee


class EmployeeModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.department = Department.objects.create(name='Engineering')
        cls.employee = Employee.objects.create(
            employee_code='EMP-00001', full_name='Aditi Sharma',
            email='aditi@example.com', department=cls.department,
            country='IN', job_title='Engineer')

    def test_valid_profile_and_readable_names(self):
        self.employee.full_clean()
        self.assertTrue(self.employee.is_active)
        self.assertIsNotNone(self.employee.created_at)
        self.assertEqual(str(self.department), 'Engineering')
        self.assertIn('EMP-00001', str(self.employee))

    def test_database_rejects_duplicate_identifiers(self):
        for field in ['employee_code', 'email']:
            with self.subTest(field=field):
                values = dict(employee_code='EMP-00002', full_name='New Employee',
                              email='new@example.com', department=self.department,
                              country='US', job_title='Engineer')
                values[field] = getattr(self.employee, field)
                with self.assertRaises(IntegrityError), transaction.atomic():
                    Employee.objects.create(**values)

    def test_database_rejects_duplicate_department(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            Department.objects.create(name='Engineering')

    def test_unsupported_country_fails_model_and_database_validation(self):
        self.employee.country = 'XX'
        with self.assertRaises(ValidationError):
            self.employee.full_clean()
        with self.assertRaises(IntegrityError), transaction.atomic():
            Employee.objects.filter(pk=self.employee.pk).update(country='XX')

    def test_country_transfer_is_rejected(self):
        self.employee.country = 'US'
        with self.assertRaisesMessage(ValidationError, 'Country cannot change'):
            self.employee.full_clean()

    def test_invalid_email_is_rejected(self):
        self.employee.email = 'invalid'
        with self.assertRaises(ValidationError):
            self.employee.full_clean()

    def test_department_with_employees_is_protected(self):
        with self.assertRaises(ProtectedError):
            self.department.delete()
