from datetime import date, timedelta
from decimal import Decimal
from random import Random

from django.core.management.base import BaseCommand, CommandError
from django.db import IntegrityError, transaction
from faker import Faker

from compensation.models import SalaryRecord
from employees.countries import COUNTRY_CURRENCIES
from employees.models import Department, Employee


DEPARTMENT_ROLES = {
    'Engineering': ('Software Engineer', 'QA Engineer', 'Engineering Manager'),
    'Finance': ('Financial Analyst', 'Accountant', 'Finance Manager'),
    'Human Resources': ('HR Specialist', 'Recruiter', 'HR Manager'),
    'Sales': ('Sales Representative', 'Account Manager', 'Sales Manager'),
    'Operations': ('Operations Analyst', 'Coordinator', 'Operations Manager'),
    'Customer Support': ('Support Specialist', 'Customer Success Manager', 'Support Lead'),
}

# One 20-employee cycle: IN 40%, US 25%, GB 15%, DE 10%, SG 10%.
# A fixed cycle keeps each employee's country stable when --count changes.
COUNTRY_CYCLE = (
    'IN', 'US', 'GB', 'IN', 'DE', 'US', 'IN', 'SG', 'GB', 'IN',
    'US', 'IN', 'DE', 'US', 'IN', 'GB', 'SG', 'IN', 'US', 'IN',
)
COUNTRY_PROFILES = {
    'IN': ('en_IN', 300000, 5000000, 1000),
    'US': ('en_US', 40000, 250000, 100),
    'GB': ('en_GB', 25000, 150000, 100),
    'DE': ('de_DE', 35000, 160000, 100),
    'SG': ('en_GB', 35000, 250000, 100),
}
BATCH_SIZE = 500


class Command(BaseCommand):
    help = 'Create reproducible fictional employees and salaries; existing seed rows are preserved.'

    def add_arguments(self, parser):
        parser.add_argument('--count', type=int, default=10000,
                            help='Target number of employee indexes for this seed (default: 10000).')
        parser.add_argument('--seed', type=int, default=42,
                            help='Random seed from 0 to 4294967295 (default: 42).')

    def handle(self, *args, **options):
        count, seed = options['count'], options['seed']
        if count < 1:
            raise CommandError('--count must be a positive integer.')
        if not 0 <= seed <= 4294967295:
            raise CommandError('--seed must be between 0 and 4294967295.')

        fakers = {country: Faker(profile[0]) for country, profile in COUNTRY_PROFILES.items()}
        created_employees = created_salaries = skipped = 0
        try:
            with transaction.atomic():
                departments = {name: Department.objects.get_or_create(name=name)[0]
                               for name in DEPARTMENT_ROLES}
                for start in range(1, count + 1, BATCH_SIZE):
                    indexes = range(start, min(start + BATCH_SIZE, count + 1))
                    codes = [f'SEED-{seed}-{index:05d}' for index in indexes]
                    existing = dict(Employee.objects.filter(employee_code__in=codes)
                                    .values_list('employee_code', 'email'))
                    employees, salaries = [], []
                    for index, code in zip(indexes, codes):
                        email = f'seed-{seed}-{index:05d}@example.com'
                        if code in existing:
                            if existing[code] != email:
                                raise CommandError(f'Employee code {code} has a conflicting email; no changes saved.')
                            skipped += 1
                            continue

                        country = COUNTRY_CYCLE[(index - 1) % len(COUNTRY_CYCLE)]
                        rng = Random(f'{seed}:{index}')
                        fake = fakers[country]
                        fake.seed_instance(f'{seed}:{index}')
                        department = rng.choice(list(DEPARTMENT_ROLES))
                        employee = Employee(
                            employee_code=code, full_name=fake.name(), email=email,
                            department=departments[department], country=country,
                            job_title=rng.choice(DEPARTMENT_ROLES[department]), is_active=True,
                        )
                        employees.append(employee)
                        _, minimum, maximum, step = COUNTRY_PROFILES[country]
                        amount = Decimal(rng.randrange(minimum, maximum + step, step)).quantize(Decimal('0.01'))
                        effective = date(2020, 1, 1) + timedelta(days=rng.randint(0, 730))
                        currency = COUNTRY_CURRENCIES[country]
                        salaries.append(SalaryRecord(employee=employee, annual_salary=amount,
                                                      currency=currency, effective_from=effective))
                        if index % 4 == 0:
                            revised = (amount * Decimal(100 + rng.randint(3, 15)) / 100).quantize(Decimal('0.01'))
                            salaries.append(SalaryRecord(employee=employee, annual_salary=revised,
                                                          currency=currency, effective_from=effective + timedelta(days=365)))

                    Employee.objects.bulk_create(employees, batch_size=BATCH_SIZE)
                    # PostgreSQL returns inserted employee PKs for the child records.
                    for salary in salaries:
                        salary.employee_id = salary.employee.pk
                    SalaryRecord.objects.bulk_create(salaries, batch_size=BATCH_SIZE)
                    created_employees += len(employees)
                    created_salaries += len(salaries)
        except IntegrityError as error:
            raise CommandError('Seed data conflicts with a database constraint; no changes saved.') from error

        self.stdout.write(self.style.SUCCESS(
            f'Created {created_employees} employees and {created_salaries} salary records; '
            f'skipped {skipped} existing employees (seed={seed}, count={count}).'
        ))
