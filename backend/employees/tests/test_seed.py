from collections import Counter
from datetime import date
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection
from django.db.models import Count
from django.test import TestCase, override_settings
from django.test.utils import CaptureQueriesContext
from django.urls import reverse
from rest_framework.test import APIClient

from compensation.models import SalaryRecord
from employees.countries import COUNTRY_CURRENCIES
from employees.models import Department, Employee


class SeedEmployeesTests(TestCase):
    def seed(self, count=40, seed=42):
        output = StringIO()
        call_command('seed_employees', count=count, seed=seed, stdout=output)
        return output.getvalue()

    def snapshot(self):
        employees = list(Employee.objects.order_by('employee_code').values_list(
            'employee_code', 'full_name', 'email', 'department__name', 'country', 'job_title', 'is_active'))
        salaries = list(SalaryRecord.objects.order_by('employee__employee_code', 'effective_from').values_list(
            'employee__employee_code', 'annual_salary', 'currency', 'effective_from'))
        return employees, salaries

    def test_default_command_creates_exactly_10000_with_expected_distribution_and_history(self):
        with CaptureQueriesContext(connection) as queries:
            call_command('seed_employees', stdout=StringIO())
        self.assertEqual(Employee.objects.count(), 10000)
        self.assertEqual(SalaryRecord.objects.count(), 12500)
        self.assertEqual(Department.objects.count(), 6)
        self.assertEqual(dict(Employee.objects.values_list('country').annotate(count=Count('pk')).order_by()),
                         {'IN': 4000, 'US': 2500, 'GB': 1500, 'DE': 1000, 'SG': 1000})
        counts = Counter(SalaryRecord.objects.order_by().values('employee_id')
                         .annotate(total=Count('pk')).values_list('total', flat=True))
        self.assertEqual(counts, {1: 7500, 2: 2500})
        self.assertFalse(Employee.objects.filter(salary_records__isnull=True).exists())
        self.assertFalse(SalaryRecord.objects.filter(annual_salary__lte=0).exists())
        self.assertEqual(Employee.objects.values('email').distinct().count(), 10000)
        self.assertFalse(Employee.objects.exclude(email__endswith='@example.com').exists())
        for country, currency in COUNTRY_CURRENCIES.items():
            self.assertFalse(SalaryRecord.objects.filter(employee__country=country).exclude(currency=currency).exists())
        # The full 10,000-row command must not perform per-record ORM lookups/inserts.
        self.assertLess(len(queries), 150)

    def test_same_seed_rebuilds_identical_business_data(self):
        self.seed()
        before = self.snapshot()
        SalaryRecord.objects.all().delete()
        Employee.objects.all().delete()
        self.seed()
        self.assertEqual(self.snapshot(), before)

    def test_repeated_execution_preserves_ids_timestamps_and_all_rows(self):
        self.seed()
        before = self.snapshot()
        identities = list(Employee.objects.values_list('pk', 'created_at'))
        salary_ids = list(SalaryRecord.objects.values_list('pk', 'created_at'))
        output = self.seed()
        self.assertIn('Created 0 employees and 0 salary records; skipped 40', output)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(list(Employee.objects.values_list('pk', 'created_at')), identities)
        self.assertEqual(list(SalaryRecord.objects.values_list('pk', 'created_at')), salary_ids)

    def test_increasing_count_matches_one_shot_generation_and_decreasing_does_not_delete(self):
        self.seed(count=13)
        first = self.snapshot()
        self.seed(count=40)
        expanded = self.snapshot()
        self.assertEqual(expanded[0][:13], first[0])
        self.seed(count=5)
        self.assertEqual(self.snapshot(), expanded)
        SalaryRecord.objects.all().delete()
        Employee.objects.all().delete()
        self.seed(count=40)
        self.assertEqual(self.snapshot(), expanded)

    def test_different_seeds_create_separate_reproducible_datasets(self):
        self.seed(count=20, seed=42)
        first_names = list(Employee.objects.values_list('full_name', flat=True))
        self.seed(count=20, seed=43)
        self.assertEqual(Employee.objects.count(), 40)
        names = list(Employee.objects.filter(employee_code__startswith='SEED-43-')
                     .values_list('full_name', flat=True))
        self.assertNotEqual(names, first_names)
        self.seed(count=20, seed=43)
        self.assertEqual(Employee.objects.count(), 40)

    def test_small_count_and_seed_zero_are_supported(self):
        self.seed(count=1, seed=0)
        employee = Employee.objects.get()
        self.assertEqual(employee.employee_code, 'SEED-0-00001')
        self.assertEqual(employee.email, 'seed-0-00001@example.com')
        self.assertEqual(employee.salary_records.count(), 1)

    def test_invalid_arguments_write_nothing(self):
        for values in [{'count': 0}, {'count': -1}, {'seed': -1}, {'seed': 4294967296}]:
            with self.subTest(values=values), self.assertRaises(CommandError):
                self.seed(**values)
        self.assertFalse(Employee.objects.exists())
        self.assertFalse(Department.objects.exists())

    def test_seed_profiles_and_history_satisfy_business_rules(self):
        self.seed(count=100)
        roles = {
            'Engineering': {'Software Engineer', 'QA Engineer', 'Engineering Manager'},
            'Finance': {'Financial Analyst', 'Accountant', 'Finance Manager'},
            'Human Resources': {'HR Specialist', 'Recruiter', 'HR Manager'},
            'Sales': {'Sales Representative', 'Account Manager', 'Sales Manager'},
            'Operations': {'Operations Analyst', 'Coordinator', 'Operations Manager'},
            'Customer Support': {'Support Specialist', 'Customer Success Manager', 'Support Lead'},
        }
        ranges = {'IN': (300000, 5000000), 'US': (40000, 250000), 'GB': (25000, 150000),
                  'DE': (35000, 160000), 'SG': (35000, 250000)}
        for employee in Employee.objects.select_related('department').prefetch_related('salary_records'):
            employee.full_clean()
            self.assertIn(employee.job_title, roles[employee.department.name])
            self.assertTrue(employee.is_active)
            self.assertTrue(employee.full_name.strip())
            history = sorted(employee.salary_records.all(), key=lambda row: row.effective_from)
            initial = history[0]
            minimum, maximum = ranges[employee.country]
            self.assertGreaterEqual(initial.annual_salary, minimum)
            self.assertLessEqual(initial.annual_salary, maximum)
            self.assertEqual(initial.currency, COUNTRY_CURRENCIES[employee.country])
            self.assertGreaterEqual(initial.effective_from, date(2020, 1, 1))
            self.assertLessEqual(history[-1].effective_from, date(2022, 12, 31))
            if len(history) == 2:
                self.assertGreater(history[1].annual_salary, initial.annual_salary)
                self.assertGreater(history[1].effective_from, initial.effective_from)

    def test_rerun_preserves_profile_edits_and_new_salary_revisions(self):
        self.seed(count=4)
        employee = Employee.objects.get(employee_code='SEED-42-00004')
        employee.full_name = 'Edited Employee'
        employee.is_active = False
        employee.save()
        SalaryRecord.objects.create(employee=employee, annual_salary=Decimal('6000000.00'),
                                    currency=COUNTRY_CURRENCIES[employee.country],
                                    effective_from=date(2025, 1, 1))
        before = self.snapshot()
        self.seed(count=4)
        self.assertEqual(self.snapshot(), before)

    def manual_employee(self, code, email):
        department = Department.objects.create(name='Existing Department')
        return Employee.objects.create(employee_code=code, full_name='Existing Employee', email=email,
                                       department=department, country='IN', job_title='Engineer')

    def test_reserved_email_collision_preserves_existing_employee(self):
        employee = self.manual_employee('MANUAL', 'seed-42-00001@example.com')
        with self.assertRaisesMessage(CommandError, 'no changes saved'):
            self.seed(count=1)
        self.assertEqual(list(Employee.objects.all()), [employee])
        self.assertEqual(Department.objects.count(), 1)
        self.assertFalse(SalaryRecord.objects.exists())

    def test_late_code_collision_rolls_back_earlier_batches(self):
        employee = self.manual_employee('SEED-42-00011', 'existing@example.com')
        with patch('employees.management.commands.seed_employees.BATCH_SIZE', 5):
            with self.assertRaisesMessage(CommandError, 'conflicting email'):
                self.seed(count=12)
        self.assertEqual(list(Employee.objects.all()), [employee])
        self.assertEqual(Department.objects.count(), 1)
        self.assertFalse(SalaryRecord.objects.exists())

    def test_salary_insert_failure_rolls_back_employees_and_departments(self):
        with patch.object(SalaryRecord.objects, 'bulk_create', side_effect=RuntimeError('salary write failed')):
            with self.assertRaisesMessage(RuntimeError, 'salary write failed'):
                self.seed()
        self.assertFalse(Employee.objects.exists())
        self.assertFalse(SalaryRecord.objects.exists())
        self.assertFalse(Department.objects.exists())

    @override_settings(SECURE_SSL_REDIRECT=False)
    def test_seeded_data_works_with_employee_and_analytics_apis(self):
        self.seed(count=100)
        client = APIClient()
        from django.contrib.auth import get_user_model
        user = get_user_model().objects.create_user(username='seed-hr', is_staff=True)
        client.force_authenticate(user=user)
        response = client.get(reverse('employee-list'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 100)
        self.assertEqual(len(response.data['results']), 50)
        for country, expected in [('IN', 40), ('US', 25), ('GB', 15), ('DE', 10), ('SG', 10)]:
            overview = client.get(reverse('analytics-overview'), {'country': country})
            departments = client.get(reverse('analytics-departments'), {'country': country})
            distribution = client.get(reverse('analytics-distribution'), {'country': country})
            self.assertEqual(overview.status_code, 200)
            self.assertEqual(overview.data['employee_count'], expected)
            self.assertEqual(overview.data['currency'], COUNTRY_CURRENCIES[country])
            self.assertGreater(Decimal(overview.data['total_annual_salary']), 0)
            self.assertEqual(sum(row['employee_count'] for row in departments.data['departments']), expected)
            self.assertEqual(sum(row['employee_count'] for row in distribution.data['bands']), expected)
