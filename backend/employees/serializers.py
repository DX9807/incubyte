from collections.abc import Mapping
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.http import QueryDict
from django.utils import timezone
from rest_framework import serializers

from compensation.models import SalaryRecord

from .countries import COUNTRY_CURRENCIES
from .models import Department, Employee


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ['id', 'name']


class EmployeeSerializer(serializers.ModelSerializer):
    annual_salary = serializers.DecimalField(max_digits=14, decimal_places=2,
                                             min_value=Decimal('0.01'))
    currency = serializers.CharField(read_only=True, allow_null=True)
    department_name = serializers.CharField(source='department.name', read_only=True)

    class Meta:
        model = Employee
        fields = ['id', 'employee_code', 'full_name', 'email', 'department',
                  'department_name', 'country', 'job_title', 'is_active',
                  'created_at', 'annual_salary', 'currency']
        read_only_fields = ['id', 'created_at']

    def to_internal_value(self, data):
        if not isinstance(data, Mapping):
            return super().to_internal_value(data)
        errors = {}
        for name in data:
            if isinstance(data, QueryDict) and name == 'csrfmiddlewaretoken':
                continue
            if name not in self.fields:
                errors[name] = ['Unknown field.']
            elif self.fields[name].read_only:
                errors[name] = ['This field is read-only.']
        if self.instance is not None and 'annual_salary' in data:
            errors['annual_salary'] = ['Salary cannot be changed through employee profile updates.']
        if errors:
            raise serializers.ValidationError(errors)
        return super().to_internal_value(data)

    def validate_country(self, value):
        if self.instance is not None and value != self.instance.country:
            raise serializers.ValidationError('Country cannot change after creation.')
        return value

    @transaction.atomic
    def create(self, validated_data):
        amount = validated_data.pop('annual_salary')
        employee = Employee.objects.create(**validated_data)
        salary = SalaryRecord(employee=employee, annual_salary=amount,
                              currency=COUNTRY_CURRENCIES[employee.country],
                              effective_from=timezone.localdate())
        try:
            salary.full_clean()
        except DjangoValidationError as error:
            raise serializers.ValidationError(error.message_dict) from error
        salary.save()
        # Match the current-salary annotations used by list/detail queries.
        employee.annual_salary = salary.annual_salary
        employee.currency = salary.currency
        return employee


class EmployeeProfileSerializer(EmployeeSerializer):
    annual_salary = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)

    class Meta(EmployeeSerializer.Meta):
        read_only_fields = EmployeeSerializer.Meta.read_only_fields + ['country']
