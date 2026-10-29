from django.db.models import OuterRef, Subquery
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import filters, generics, mixins, serializers
from rest_framework.pagination import PageNumberPagination
from rest_framework.viewsets import GenericViewSet

from compensation.models import SalaryRecord

from .countries import COUNTRY_CHOICES
from .models import Department, Employee
from .serializers import DepartmentSerializer, EmployeeProfileSerializer, EmployeeSerializer


class EmployeePagination(PageNumberPagination):
    page_size = 50


class EmployeeFilters(serializers.Serializer):
    department = serializers.IntegerField(min_value=1, required=False)
    country = serializers.ChoiceField(choices=COUNTRY_CHOICES, required=False)
    is_active = serializers.ChoiceField(choices=['true', 'false'], required=False)


class DepartmentListView(generics.ListAPIView):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer


class EmployeeViewSet(mixins.CreateModelMixin, mixins.ListModelMixin,
                      mixins.RetrieveModelMixin, mixins.UpdateModelMixin, GenericViewSet):
    serializer_class = EmployeeSerializer
    pagination_class = EmployeePagination
    filter_backends = [filters.SearchFilter]
    search_fields = ['full_name', 'email', 'employee_code']
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def get_serializer_class(self):
        if self.action == 'partial_update':
            return EmployeeProfileSerializer
        return EmployeeSerializer

    def get_queryset(self):
        current_salary = SalaryRecord.objects.filter(
            employee_id=OuterRef('pk'), effective_from__lte=timezone.localdate()
        ).order_by('-effective_from', '-id')
        queryset = Employee.objects.select_related('department').annotate(
            annual_salary=Subquery(current_salary.values('annual_salary')[:1]),
            currency=Subquery(current_salary.values('currency')[:1]),
        )
        if self.action == 'list':
            selected = EmployeeFilters(data=self.request.query_params.dict())
            selected.is_valid(raise_exception=True)
            for name, value in selected.validated_data.items():
                if name == 'is_active':
                    value = value == 'true'
                queryset = queryset.filter(**{name: value})
        return queryset

    @extend_schema(parameters=[
        OpenApiParameter('department', int, description='Department ID (positive integer).'),
        OpenApiParameter('country', str, enum=[code for code, _ in COUNTRY_CHOICES]),
        OpenApiParameter('is_active', str, enum=['true', 'false']),
    ])
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)
