from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.test import TestCase

from employees.countries import COUNTRY_CURRENCIES
from employees.models import Department, Employee

from .models import SalaryRecord


class SalaryModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        department = Department.objects.create(name='Engineering')
        cls.employee = Employee.objects.create(
            employee_code='EMP-00001', full_name='Aditi Sharma', email='aditi@example.com',
            department=department, country='IN', job_title='Engineer')

    def salary(self, **changes):
        values = dict(employee=self.employee, annual_salary=Decimal('1200000.00'),
                      effective_from=date(2020, 1, 1), currency='INR')
        return SalaryRecord(**(values | changes))

    def test_valid_salary_preserves_decimal_and_timestamp(self):
        record = self.salary()
        record.full_clean()
        record.save()
        record.refresh_from_db()
        self.assertEqual(record.annual_salary, Decimal('1200000.00'))
        self.assertIsNotNone(record.created_at)
        self.assertIn('INR', str(record))

    def test_currency_is_derived_for_each_supported_country(self):
        for country, currency in COUNTRY_CURRENCIES.items():
            with self.subTest(country=country):
                employee = Employee(employee_code=country, full_name='Example',
                                    email=f'{country}@example.com', country=country,
                                    department=self.employee.department, job_title='Engineer')
                record = self.salary(employee=employee, currency='')
                record.full_clean(exclude=['employee'])
                self.assertEqual(record.currency, currency)

    def test_nonpositive_salary_fails_validation_and_database_constraint(self):
        for value in ['0', '-1']:
            with self.subTest(value=value):
                record = self.salary(annual_salary=Decimal(value))
                with self.assertRaises(ValidationError):
                    record.full_clean()
                with self.assertRaises(IntegrityError), transaction.atomic():
                    record.save()

    def test_too_many_decimal_places_are_rejected(self):
        with self.assertRaises(ValidationError):
            self.salary(annual_salary=Decimal('123.456')).full_clean()

    def test_mismatched_currency_is_rejected(self):
        with self.assertRaisesMessage(ValidationError, 'Currency must match'):
            self.salary(currency='USD').full_clean()

    def test_database_rejects_unsupported_currency(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.salary(currency='XXX').save()

    def test_database_rejects_duplicate_employee_effective_date(self):
        self.salary().save()
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.salary(annual_salary=Decimal('1300000.00')).save()

    @patch('compensation.models.timezone.localdate', return_value=date(2020, 2, 1))
    def test_future_and_nonchronological_dates_are_rejected(self, today):
        self.salary().save()
        for effective in [date(2019, 12, 31), date(2020, 1, 1), today() + timedelta(days=1)]:
            with self.subTest(effective=effective), self.assertRaises(ValidationError):
                self.salary(effective_from=effective).full_clean()
        self.salary(effective_from=today()).full_clean()

    def test_history_is_newest_first_and_retained_on_deactivation(self):
        first = self.salary()
        first.save()
        second = self.salary(effective_from=date(2020, 2, 1))
        second.save()
        self.employee.is_active = False
        self.employee.save()
        self.assertEqual(list(self.employee.salary_records.all()), [second, first])
        with self.assertRaises(ProtectedError):
            self.employee.delete()

    def test_invalid_employee_returns_validation_error(self):
        with self.assertRaises(ValidationError):
            self.salary(employee_id=999999).full_clean()
