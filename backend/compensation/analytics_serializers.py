from decimal import ROUND_HALF_UP

from rest_framework import serializers

from employees.countries import COUNTRY_CHOICES


class AnalyticsFilterSerializer(serializers.Serializer):
    country = serializers.ChoiceField(choices=COUNTRY_CHOICES)


class OverviewSerializer(serializers.Serializer):
    employee_count = serializers.IntegerField(read_only=True)
    currency = serializers.CharField(read_only=True)
    average_annual_salary = serializers.DecimalField(
        max_digits=24, decimal_places=2, rounding=ROUND_HALF_UP, read_only=True, allow_null=True)
    total_annual_salary = serializers.DecimalField(
        max_digits=24, decimal_places=2, rounding=ROUND_HALF_UP, read_only=True)
    min_annual_salary = serializers.DecimalField(
        max_digits=24, decimal_places=2, rounding=ROUND_HALF_UP, read_only=True, allow_null=True)
    max_annual_salary = serializers.DecimalField(
        max_digits=24, decimal_places=2, rounding=ROUND_HALF_UP, read_only=True, allow_null=True)


class DepartmentCompensationSerializer(serializers.Serializer):
    department_id = serializers.IntegerField(read_only=True)
    department_name = serializers.CharField(read_only=True)
    employee_count = serializers.IntegerField(read_only=True)
    average_annual_salary = serializers.DecimalField(
        max_digits=24, decimal_places=2, rounding=ROUND_HALF_UP, read_only=True)
    total_annual_salary = serializers.DecimalField(
        max_digits=24, decimal_places=2, rounding=ROUND_HALF_UP, read_only=True)


class DepartmentAnalyticsSerializer(serializers.Serializer):
    currency = serializers.CharField(read_only=True)
    departments = DepartmentCompensationSerializer(many=True, read_only=True)


class SalaryBandSerializer(serializers.Serializer):
    label = serializers.CharField(read_only=True)
    min_annual_salary = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    max_annual_salary = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True, allow_null=True)
    employee_count = serializers.IntegerField(read_only=True)


class DistributionSerializer(serializers.Serializer):
    currency = serializers.CharField(read_only=True)
    bands = SalaryBandSerializer(many=True, read_only=True)
