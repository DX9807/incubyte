from collections.abc import Mapping
from decimal import Decimal

from django.http import QueryDict
from rest_framework import serializers

from .models import SalaryRecord


class SalaryRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = SalaryRecord
        fields = ['id', 'employee', 'annual_salary', 'currency', 'effective_from', 'created_at']
        read_only_fields = fields


class SalaryRevisionSerializer(serializers.Serializer):
    annual_salary = serializers.DecimalField(max_digits=14, decimal_places=2,
                                             min_value=Decimal('0.01'))
    effective_from = serializers.DateField()

    def to_internal_value(self, data):
        if isinstance(data, Mapping):
            unknown = set(data) - set(self.fields)
            if isinstance(data, QueryDict):
                unknown.discard('csrfmiddlewaretoken')
            if unknown:
                raise serializers.ValidationError({name: ['Unknown field.'] for name in unknown})
        return super().to_internal_value(data)
