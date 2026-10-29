from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, extend_schema_view
from rest_framework import generics, serializers, status
from rest_framework.response import Response

from employees.models import Employee

from .models import SalaryRecord
from .serializers import SalaryRecordSerializer, SalaryRevisionSerializer
from .services import revise_salary


@extend_schema_view(post=extend_schema(
    request=SalaryRevisionSerializer, responses={201: SalaryRecordSerializer},
    description='Append a salary revision after the latest effective date and no later than today.',
))
class EmployeeSalaryView(generics.ListCreateAPIView):
    serializer_class = SalaryRecordSerializer

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return SalaryRevisionSerializer
        return SalaryRecordSerializer

    def get_queryset(self):
        employee = get_object_or_404(Employee, pk=self.kwargs['employee_id'])
        return SalaryRecord.objects.filter(employee=employee)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            record = revise_salary(employee_id=self.kwargs['employee_id'], **serializer.validated_data)
        except Employee.DoesNotExist as error:
            raise Http404('Employee not found.') from error
        except DjangoValidationError as error:
            errors = error.message_dict
            if '__all__' in errors:
                errors['non_field_errors'] = errors.pop('__all__')
            raise serializers.ValidationError(errors) from error
        return Response(SalaryRecordSerializer(record).data, status=status.HTTP_201_CREATED)
