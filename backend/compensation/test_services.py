from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal
from threading import Barrier, Event
from time import monotonic
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.db import close_old_connections, connection, transaction
from django.test import TestCase, TransactionTestCase

from employees.models import Department, Employee

from .models import SalaryRecord
from .services import revise_salary


class SalaryRevisionServiceTests(TestCase):
    def setUp(self):
        department = Department.objects.create(name='Engineering')
        self.employee = Employee.objects.create(
            employee_code='EMP-00001', full_name='Aditi Sharma', email='aditi@example.com',
            department=department, country='IN', job_title='Engineer')
        self.initial = SalaryRecord.objects.create(
            employee=self.employee, annual_salary='1200000.00', currency='INR',
            effective_from=date(2020, 1, 1))

    def revise(self, **changes):
        values = dict(employee_id=self.employee.pk, annual_salary=Decimal('1450000.00'),
                      effective_from=date(2020, 2, 1)) | changes
        return revise_salary(**values)

    def test_valid_revision_is_a_new_record(self):
        record = self.revise()
        self.assertNotEqual(record.pk, self.initial.pk)
        self.assertEqual(record.currency, 'INR')
        self.assertEqual(record.annual_salary, Decimal('1450000.00'))
        self.initial.refresh_from_db()
        self.assertEqual(self.initial.annual_salary, Decimal('1200000.00'))

    def test_service_validates_amount_independently_of_api(self):
        for amount in ['0', '-1', '1.001', 'NaN']:
            with self.subTest(amount=amount), self.assertRaises(ValidationError):
                self.revise(annual_salary=amount)
        self.assertEqual(self.employee.salary_records.count(), 1)

    @patch('compensation.models.timezone.localdate', return_value=date(2020, 2, 1))
    def test_service_validates_dates_independently_of_api(self, today):
        for effective in [date(2019, 1, 1), date(2020, 1, 1), date(2020, 2, 2)]:
            with self.subTest(effective=effective), self.assertRaises(ValidationError):
                self.revise(effective_from=effective)
        self.revise(effective_from=today())

    def test_failure_after_insert_rolls_back_new_history(self):
        save = SalaryRecord.save

        def fail_after_insert(record, *args, **kwargs):
            save(record, *args, **kwargs)
            raise RuntimeError('failure after salary insert')

        with patch.object(SalaryRecord, 'save', new=fail_after_insert):
            with self.assertRaisesMessage(RuntimeError, 'failure after salary insert'):
                self.revise()
        self.assertEqual(list(self.employee.salary_records.all()), [self.initial])
        # A subsequent write remains possible after rollback.
        self.revise()


class SalaryRevisionConcurrencyTests(TransactionTestCase):
    """Real PostgreSQL transactions on independent thread-local connections."""

    def setUp(self):
        department = Department.objects.create(name='Engineering')
        self.employee = Employee.objects.create(
            employee_code='EMP-00001', full_name='Aditi Sharma', email='aditi@example.com',
            department=department, country='IN', job_title='Engineer')
        self.initial = SalaryRecord.objects.create(
            employee=self.employee, annual_salary='1200000.00', currency='INR',
            effective_from=date(2020, 1, 1))

    def test_same_date_concurrent_revisions_create_exactly_one_record(self):
        start = Barrier(2)

        def worker():
            close_old_connections()
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SET lock_timeout = '5s'")
                start.wait(timeout=5)
                try:
                    revise_salary(employee_id=self.employee.pk, annual_salary=Decimal('1450000.00'),
                                  effective_from=date(2020, 2, 1))
                except ValidationError as error:
                    self.assertIn('effective_from', error.message_dict)
                    return 'rejected'
                return 'created'
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(worker) for _ in range(2)]
            outcomes = [future.result(timeout=10) for future in futures]
        self.assertCountEqual(outcomes, ['created', 'rejected'])
        self.assertEqual(self.employee.salary_records.count(), 2)

    def test_waiting_revision_revalidates_against_committed_latest_salary(self):
        first_saved = Event()
        release_first = Event()
        second_ready = Event()
        backend_pids = {}

        def first_worker():
            close_old_connections()
            try:
                with transaction.atomic():
                    with connection.cursor() as cursor:
                        cursor.execute('SELECT pg_backend_pid()')
                        backend_pids['first'] = cursor.fetchone()[0]
                    revise_salary(employee_id=self.employee.pk, annual_salary=Decimal('1600000.00'),
                                  effective_from=date(2020, 3, 1))
                    first_saved.set()
                    if not release_first.wait(timeout=10):
                        raise AssertionError('Timed out waiting to commit first revision')
            finally:
                connection.close()

        def second_worker():
            close_old_connections()
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SET lock_timeout = '5s'")
                    cursor.execute('SELECT pg_backend_pid()')
                    backend_pids['second'] = cursor.fetchone()[0]
                second_ready.set()
                try:
                    revise_salary(employee_id=self.employee.pk, annual_salary=Decimal('1450000.00'),
                                  effective_from=date(2020, 2, 1))
                except ValidationError as error:
                    self.assertIn('effective_from', error.message_dict)
                    return 'rejected'
                return 'created'
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(first_worker)
            try:
                self.assertTrue(first_saved.wait(timeout=5))
                second = executor.submit(second_worker)
                self.assertTrue(second_ready.wait(timeout=5))
                deadline = monotonic() + 4
                blocked = False
                while monotonic() < deadline:
                    with connection.cursor() as cursor:
                        cursor.execute('SELECT pg_blocking_pids(%s)', [backend_pids['second']])
                        blocked = backend_pids['first'] in cursor.fetchone()[0]
                    if blocked or second.done():
                        break
                    release_first.wait(timeout=0.01)
                self.assertTrue(blocked, 'Second revision must wait for the employee row lock')
            finally:
                release_first.set()
            first.result(timeout=10)
            self.assertEqual(second.result(timeout=10), 'rejected')

        self.assertEqual(list(self.employee.salary_records.values_list('effective_from', flat=True)),
                         [date(2020, 3, 1), date(2020, 1, 1)])
