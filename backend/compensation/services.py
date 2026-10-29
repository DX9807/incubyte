from django.core.exceptions import ValidationError
from django.db import transaction

from employees.countries import COUNTRY_CURRENCIES
from employees.models import Employee

from .models import SalaryRecord


@transaction.atomic
def revise_salary(*, employee_id, annual_salary, effective_from):
    employee = Employee.objects.select_for_update().get(pk=employee_id)
    if not employee.salary_records.exists():
        raise ValidationError({'non_field_errors': 'An initial salary is required before revision.'})

    record = SalaryRecord(employee=employee, annual_salary=annual_salary,
                          currency=COUNTRY_CURRENCIES[employee.country],
                          effective_from=effective_from)
    # Model validation reads the latest salary while the employee lock is held.
    record.full_clean()
    record.save()
    return record
