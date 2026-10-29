from decimal import Decimal

from django.db.models import Avg, Count, F, Max, Min, Q, Sum
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from employees.countries import COUNTRY_CURRENCIES

from .analytics import SALARY_BAND_LIMITS, current_salaries
from .analytics_serializers import (
    AnalyticsFilterSerializer,
    DepartmentAnalyticsSerializer,
    DistributionSerializer,
    OverviewSerializer,
)


COUNTRY_PARAMETER = OpenApiParameter(
    'country', str, required=True, enum=list(COUNTRY_CURRENCIES),
    description='Required country; reports include active employees with current salaries in its currency.',
)


class CountryAnalyticsView(generics.GenericAPIView):
    def get_country(self):
        if len(self.request.query_params.getlist('country')) > 1:
            raise ValidationError({'country': ['Provide exactly one country.']})
        selected = AnalyticsFilterSerializer(data=self.request.query_params.dict())
        selected.is_valid(raise_exception=True)
        return selected.validated_data['country']


class OverviewView(CountryAnalyticsView):
    serializer_class = OverviewSerializer

    @extend_schema(parameters=[COUNTRY_PARAMETER])
    def get(self, request, *args, **kwargs):
        country = self.get_country()
        summary = current_salaries(country).aggregate(
            employee_count=Count('pk'), average_annual_salary=Avg('annual_salary'),
            total_annual_salary=Sum('annual_salary', default=Decimal('0.00')),
            min_annual_salary=Min('annual_salary'), max_annual_salary=Max('annual_salary'),
        )
        summary['currency'] = COUNTRY_CURRENCIES[country]
        return Response(self.get_serializer(summary).data)


class DepartmentAnalyticsView(CountryAnalyticsView):
    serializer_class = DepartmentAnalyticsSerializer

    @extend_schema(parameters=[COUNTRY_PARAMETER])
    def get(self, request, *args, **kwargs):
        country = self.get_country()
        departments = current_salaries(country).values(
            department_id=F('employee__department_id'),
            department_name=F('employee__department__name'),
        ).annotate(
            employee_count=Count('pk'), average_annual_salary=Avg('annual_salary'),
            total_annual_salary=Sum('annual_salary'),
        ).order_by('department_name', 'department_id')
        return Response(self.get_serializer({
            'currency': COUNTRY_CURRENCIES[country], 'departments': departments,
        }).data)


class DistributionView(CountryAnalyticsView):
    serializer_class = DistributionSerializer

    @extend_schema(parameters=[COUNTRY_PARAMETER])
    def get(self, request, *args, **kwargs):
        country = self.get_country()
        limits = SALARY_BAND_LIMITS[country]
        bands = []
        counts = {}
        for index, (lower, upper) in enumerate(zip((0, *limits), (*limits, None))):
            selected = Q(annual_salary__gte=lower)
            if upper is not None:
                selected &= Q(annual_salary__lt=upper)
            counts[f'band_{index}'] = Count('pk', filter=selected)
            label = (f'<{upper:,}' if lower == 0 else
                     f'{lower:,}+' if upper is None else f'{lower:,} to <{upper:,}')
            bands.append({'label': label, 'min_annual_salary': lower, 'max_annual_salary': upper})
        totals = current_salaries(country).aggregate(**counts)
        for index, band in enumerate(bands):
            band['employee_count'] = totals[f'band_{index}']
        return Response(self.get_serializer({
            'currency': COUNTRY_CURRENCIES[country], 'bands': bands,
        }).data)
