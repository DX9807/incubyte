from django.core.exceptions import ValidationError
from django.db import models

from .countries import COUNTRY_CHOICES, COUNTRY_CURRENCIES


class Department(models.Model):
    name = models.CharField(max_length=100, unique=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Employee(models.Model):
    employee_code = models.CharField(max_length=30, unique=True)
    full_name = models.CharField(max_length=200)
    email = models.EmailField(unique=True)
    department = models.ForeignKey(Department, on_delete=models.PROTECT,
                                   related_name='employees')
    country = models.CharField(max_length=2, choices=COUNTRY_CHOICES)
    job_title = models.CharField(max_length=150)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['employee_code']
        constraints = [
            models.CheckConstraint(condition=models.Q(country__in=list(COUNTRY_CURRENCIES)),
                                   name='employee_supported_country'),
        ]

    def clean(self):
        super().clean()
        if not self._state.adding:
            original_country = type(self).objects.get(pk=self.pk).country
            if self.country != original_country:
                raise ValidationError({'country': 'Country cannot change after creation.'})

    def __str__(self):
        return f'{self.employee_code} — {self.full_name}'
