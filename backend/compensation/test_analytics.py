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
class SalaryAnalyticsTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.hr = get_user_model().objects.create_user(username='analytics-hr', is_staff=True)
        cls.engineering = Department.objects.create(name='Engineering')
        cls.finance = Department.objects.create(name='Finance')
        Department.objects.create(name='Empty')
        cls.aditi = cls.employee('ADITI', 'IN', '600000.00', cls.engineering)
        # An older record must not increase headcount or compensation totals.
        SalaryRecord.objects.create(employee=cls.aditi, annual_salary='300000.00', currency='INR',
                                    effective_from=date(2019, 1, 1))
        cls.employee('BOB', 'IN', '1400000.00', cls.engineering)
        cls.cara = cls.employee('CARA', 'IN', '3000000.00', cls.finance)
        inactive = cls.employee('INACTIVE', 'IN', '9000000.00', cls.finance)
        inactive.is_active = False
        inactive.save()
        cls.employee('US', 'US', '100000.00', cls.engineering)

    @classmethod
    def employee(cls, code, country, salary, department):
        employee = Employee.objects.create(
            employee_code=code, full_name=code, email=f'{code.lower()}@example.com',
            department=department, country=country, job_title='Engineer')
        currency = {'IN': 'INR', 'US': 'USD', 'GB': 'GBP', 'DE': 'EUR', 'SG': 'SGD'}[country]
        SalaryRecord.objects.create(employee=employee, annual_salary=salary, currency=currency,
                                    effective_from=date(2020, 1, 1))
        return employee

    def setUp(self):
        self.client.force_authenticate(user=self.hr)
        clock = patch('compensation.analytics.timezone.localdate', return_value=date(2026, 2, 1))
        clock.start()
        self.addCleanup(clock.stop)

    def report(self, report, country='IN'):
        response = self.client.get(reverse(f'analytics-{report}'), {'country': country})
        self.assertEqual(response.status_code, 200, response.data)
        return response.data

    def test_overview_uses_current_active_salaries_only(self):
        self.assertEqual(self.report('overview'), {
            'employee_count': 3, 'currency': 'INR', 'average_annual_salary': '1666666.67',
            'total_annual_salary': '5000000.00', 'min_annual_salary': '600000.00',
            'max_annual_salary': '3000000.00',
        })

    def test_department_grouping_is_alphabetical_and_omits_empty_departments(self):
        self.assertEqual(self.report('departments'), {'currency': 'INR', 'departments': [
            {'department_id': self.engineering.pk, 'department_name': 'Engineering',
             'employee_count': 2, 'average_annual_salary': '1000000.00',
             'total_annual_salary': '2000000.00'},
            {'department_id': self.finance.pk, 'department_name': 'Finance',
             'employee_count': 1, 'average_annual_salary': '3000000.00',
             'total_annual_salary': '3000000.00'},
        ]})

    def test_distribution_uses_each_employee_once(self):
        result = self.report('distribution')
        self.assertEqual(result['currency'], 'INR')
        self.assertEqual([band['employee_count'] for band in result['bands']], [0, 1, 1, 1, 0])
        self.assertEqual(result['bands'][0], {
            'label': '<500,000', 'min_annual_salary': '0.00',
            'max_annual_salary': '500000.00', 'employee_count': 0,
        })
        self.assertEqual(result['bands'][-1], {
            'label': '4,000,000+', 'min_annual_salary': '4000000.00',
            'max_annual_salary': None, 'employee_count': 0,
        })

    def test_revision_effective_today_updates_all_reports(self):
        response = self.client.post(reverse('employee-salaries', args=[self.aditi.pk]), {
            'annual_salary': '2500000.00', 'effective_from': '2026-02-01',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        overview = self.report('overview')
        self.assertEqual(overview['total_annual_salary'], '6900000.00')
        self.assertEqual(overview['average_annual_salary'], '2300000.00')
        self.assertEqual(overview['employee_count'], 3)
        self.assertEqual(overview['min_annual_salary'], '1400000.00')
        department = self.report('departments')['departments'][0]
        self.assertEqual(department['average_annual_salary'], '1950000.00')
        self.assertEqual(department['total_annual_salary'], '3900000.00')
        self.assertEqual([b['employee_count'] for b in self.report('distribution')['bands']], [0, 0, 1, 2, 0])

    def test_future_records_do_not_hide_current_effective_salary(self):
        SalaryRecord.objects.create(employee=self.aditi, annual_salary='50000000.00',
                                    currency='INR', effective_from=date(2026, 2, 2))
        self.assertEqual(self.report('overview')['total_annual_salary'], '5000000.00')
        self.assertEqual(self.report('departments')['departments'][0]['total_annual_salary'], '2000000.00')
        self.assertEqual([b['employee_count'] for b in self.report('distribution')['bands']], [0, 1, 1, 1, 0])

    def test_deactivation_removes_employee_from_all_reports(self):
        response = self.client.patch(reverse('employee-detail', args=[self.cara.pk]),
                                     {'is_active': False}, format='json')
        self.assertEqual(response.status_code, 200)
        overview = self.report('overview')
        self.assertEqual(overview['employee_count'], 2)
        self.assertEqual(overview['total_annual_salary'], '2000000.00')
        self.assertEqual(overview['average_annual_salary'], '1000000.00')
        self.assertEqual(overview['max_annual_salary'], '1400000.00')
        self.assertEqual(len(self.report('departments')['departments']), 1)
        self.assertEqual([b['employee_count'] for b in self.report('distribution')['bands']], [0, 1, 1, 0, 0])

    def test_country_isolation_includes_shared_departments(self):
        self.assertEqual(self.report('overview', 'US'), {
            'employee_count': 1, 'currency': 'USD', 'average_annual_salary': '100000.00',
            'total_annual_salary': '100000.00', 'min_annual_salary': '100000.00',
            'max_annual_salary': '100000.00',
        })
        department = self.report('departments', 'US')['departments'][0]
        self.assertEqual(department['department_id'], self.engineering.pk)
        self.assertEqual(department['employee_count'], 1)
        self.assertEqual(department['total_annual_salary'], '100000.00')
        self.assertEqual([b['employee_count'] for b in self.report('distribution', 'US')['bands']], [0, 0, 1, 0, 0])

    def test_remaining_countries_use_their_own_currency(self):
        for country, currency, amount in [('GB', 'GBP', '60000.00'), ('DE', 'EUR', '70000.00'),
                                           ('SG', 'SGD', '100000.00')]:
            with self.subTest(country=country):
                self.employee(country, country, amount, self.finance)
                overview = self.report('overview', country)
                self.assertEqual(overview['currency'], currency)
                self.assertEqual(overview['employee_count'], 1)
                self.assertEqual(overview['total_annual_salary'], amount)
                self.assertEqual(self.report('departments', country)['currency'], currency)
                result = self.report('distribution', country)
                self.assertEqual(result['currency'], currency)
                self.assertEqual(sum(b['employee_count'] for b in result['bands']), 1)

    def test_empty_country_has_zero_total_null_statistics_and_zero_bands(self):
        self.assertEqual(self.report('overview', 'DE'), {
            'employee_count': 0, 'currency': 'EUR', 'average_annual_salary': None,
            'total_annual_salary': '0.00', 'min_annual_salary': None, 'max_annual_salary': None,
        })
        self.assertEqual(self.report('departments', 'DE'), {'currency': 'EUR', 'departments': []})
        result = self.report('distribution', 'DE')
        self.assertEqual(result['currency'], 'EUR')
        self.assertEqual([b['employee_count'] for b in result['bands']], [0, 0, 0, 0, 0])

    def test_all_inactive_country_is_empty(self):
        Employee.objects.filter(country='IN').update(is_active=False)
        self.assertEqual(self.report('overview')['employee_count'], 0)
        self.assertEqual(self.report('overview')['total_annual_salary'], '0.00')
        self.assertEqual(self.report('departments')['departments'], [])
        self.assertEqual([b['employee_count'] for b in self.report('distribution')['bands']], [0] * 5)

    def test_employees_without_effective_salary_are_excluded(self):
        staged = self.employee('STAGED', 'IN', '100.00', self.finance)
        staged.salary_records.all().delete()
        future_only = self.employee('FUTURE', 'IN', '100.00', self.finance)
        future_only.salary_records.update(effective_from=date(2026, 2, 2))
        self.assertEqual(self.report('overview')['employee_count'], 3)
        self.assertEqual(self.report('overview')['total_annual_salary'], '5000000.00')
        self.assertEqual(sum(d['employee_count'] for d in self.report('departments')['departments']), 3)
        self.assertEqual(sum(b['employee_count'] for b in self.report('distribution')['bands']), 3)

    def test_mismatched_currency_never_falls_back_to_older_salary(self):
        # Trusted ORM writes can bypass model validation; analytics must stay currency-safe.
        SalaryRecord.objects.create(employee=self.aditi, annual_salary='90000.00',
                                    currency='USD', effective_from=date(2026, 2, 1))
        overview = self.report('overview')
        self.assertEqual(overview['employee_count'], 2)
        self.assertEqual(overview['total_annual_salary'], '4400000.00')
        self.assertEqual(self.report('departments')['departments'][0]['total_annual_salary'], '1400000.00')
        self.assertEqual([b['employee_count'] for b in self.report('distribution')['bands']], [0, 0, 1, 1, 0])

    def test_all_country_band_boundaries_are_lower_inclusive_upper_exclusive(self):
        Employee.objects.update(is_active=False)
        cases = {'IN': (500000, 1000000, 2000000, 4000000),
                 'US': (50000, 100000, 150000, 200000),
                 'GB': (30000, 60000, 90000, 120000),
                 'DE': (40000, 70000, 100000, 130000),
                 'SG': (50000, 100000, 150000, 200000)}
        for country, boundaries in cases.items():
            with self.subTest(country=country):
                amounts = [Decimal('0.01'), Decimal(boundaries[0]) - Decimal('0.01'),
                           Decimal(boundaries[0]), Decimal(boundaries[1]) - Decimal('0.01'),
                           Decimal(boundaries[1]), Decimal(boundaries[2]) - Decimal('0.01'),
                           Decimal(boundaries[2]), Decimal(boundaries[3]) - Decimal('0.01'),
                           Decimal(boundaries[3]), Decimal('999999999999.99')]
                for index, amount in enumerate(amounts):
                    self.employee(f'{country}-{index}', country, amount, self.engineering)
                bands = self.report('distribution', country)['bands']
                self.assertEqual([b['employee_count'] for b in bands], [2, 2, 2, 2, 2])
                self.assertEqual([b['max_annual_salary'] for b in bands],
                                 [f'{value:.2f}' for value in boundaries] + [None])

    def test_averages_use_decimal_half_up_rounding(self):
        self.employee('SMALL1', 'SG', '0.02', self.finance)
        self.employee('SMALL2', 'SG', '0.03', self.finance)
        overview = self.report('overview', 'SG')
        self.assertEqual(overview['average_annual_salary'], '0.03')
        self.assertEqual(overview['total_annual_salary'], '0.05')
        self.assertEqual(self.report('departments', 'SG')['departments'][0]['average_annual_salary'], '0.03')

    def test_aggregate_totals_can_exceed_individual_salary_precision(self):
        for code in ['LARGE1', 'LARGE2']:
            self.employee(code, 'GB', '999999999999.99', self.finance)
        self.assertEqual(self.report('overview', 'GB')['total_annual_salary'], '1999999999999.98')
        self.assertEqual(self.report('departments', 'GB')['departments'][0]['total_annual_salary'],
                         '1999999999999.98')

    def test_reports_use_one_database_aggregation_query(self):
        for report in ['overview', 'departments', 'distribution']:
            with self.subTest(report=report), CaptureQueriesContext(connection) as queries:
                self.report(report)
            self.assertEqual(len(queries), 1)
            self.assertIn('COUNT(', queries[0]['sql'].upper())

    def test_missing_empty_and_unsupported_country_are_rejected_before_querying(self):
        for report in ['overview', 'departments', 'distribution']:
            for params in [{}, {'country': ''}, {'country': 'XX'}, {'country': 'in'},
                           {'country': 'IN,US'}, {'country': ['IN', 'US']}]:
                with self.subTest(report=report, params=params), CaptureQueriesContext(connection) as queries:
                    response = self.client.get(reverse(f'analytics-{report}'), params)
                self.assertEqual(response.status_code, 400)
                self.assertIn('country', response.data)
                self.assertEqual(len(queries), 0)

    def test_analytics_are_read_only(self):
        for report in ['overview', 'departments', 'distribution']:
            for method in ['post', 'put', 'patch', 'delete']:
                response = getattr(self.client, method)(reverse(f'analytics-{report}'),
                                                        {'country': 'IN'}, format='json')
                self.assertEqual(response.status_code, 405)

    def test_anonymous_and_nonstaff_cannot_read_analytics(self):
        nonstaff = get_user_model().objects.create_user(username='analytics-nonstaff')
        for user in [None, nonstaff]:
            self.client.force_authenticate(user=user)
            for report in ['overview', 'departments', 'distribution']:
                response = self.client.get(reverse(f'analytics-{report}'), {'country': 'IN'})
                self.assertEqual(response.status_code, 403)

    def test_staff_session_can_read_and_inactive_session_is_denied(self):
        client = APIClient()
        client.force_login(self.hr)
        for report in ['overview', 'departments', 'distribution']:
            self.assertEqual(client.get(reverse(f'analytics-{report}'), {'country': 'IN'}).status_code, 200)
        self.hr.is_active = False
        self.hr.save()
        for report in ['overview', 'departments', 'distribution']:
            self.assertEqual(client.get(reverse(f'analytics-{report}'), {'country': 'IN'}).status_code, 403)
