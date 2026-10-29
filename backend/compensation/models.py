from datetime import date
from decimal import Decimal

from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

from employees.countries import COUNTRY_CURRENCIES


class SalaryRecord(models.Model):
    employee = models.ForeignKey('employees.Employee', on_delete=models.PROTECT,
                                 related_name='salary_records')
    annual_salary = models.DecimalField(max_digits=14, decimal_places=2,
                                       validators=[MinValueValidator(Decimal('0.01'))])
    currency = models.CharField(max_length=3, blank=True)
    effective_from = models.DateField(default=timezone.localdate)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-effective_from', '-id']
        constraints = [
            models.CheckConstraint(condition=models.Q(annual_salary__gt=0),
                                   name='salary_positive_amount'),
            models.UniqueConstraint(fields=['employee', 'effective_from'],
                                    name='salary_unique_employee_date'),
            models.CheckConstraint(
                condition=models.Q(currency__in=list(COUNTRY_CURRENCIES.values())),
                name='salary_supported_currency'),
        ]

    def clean(self):
        super().clean()
        errors = {}
        # Inline creation has an unsaved employee cached before it has a PK.
        if self.employee_id or 'employee' in self._state.fields_cache:
            try:
                expected_currency = COUNTRY_CURRENCIES.get(self.employee.country)
            except ObjectDoesNotExist:
                raise ValidationError({'employee': 'Select a valid employee.'})
            if not expected_currency:
                # Currency is derived/read-only in Admin; use a form-wide error.
                errors['__all__'] = 'Employee country is not supported.'
            elif not self.currency:
                self.currency = expected_currency
            elif self.currency != expected_currency:
                errors['currency'] = 'Currency must match the employee country.'
        if isinstance(self.effective_from, date):
            if self.effective_from > timezone.localdate():
                errors['effective_from'] = 'Effective date cannot be in the future.'
            elif self._state.adding and self.employee_id:
                latest = type(self).objects.filter(employee_id=self.employee_id).first()
                if latest and self.effective_from <= latest.effective_from:
                    errors['effective_from'] = 'Effective date must be later than the latest salary.'
        if errors:
            raise ValidationError(errors)

    def __str__(self):
        return f'{self.employee} — {self.annual_salary} {self.currency} ({self.effective_from})'
