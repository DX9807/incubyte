"""Current compensation query and fixed MVP salary bands."""

from django.db.models import OuterRef, Subquery
from django.utils import timezone

from employees.countries import COUNTRY_CURRENCIES

from .models import SalaryRecord


SALARY_BAND_LIMITS = {
    'IN': (500000, 1000000, 2000000, 4000000),
    'US': (50000, 100000, 150000, 200000),
    'GB': (30000, 60000, 90000, 120000),
    'DE': (40000, 70000, 100000, 130000),
    'SG': (50000, 100000, 150000, 200000),
}


def current_salaries(country):
    latest = SalaryRecord.objects.filter(
        employee_id=OuterRef('employee_id'), effective_from__lte=timezone.localdate()
    ).order_by('-effective_from', '-id').values('pk')[:1]
    return SalaryRecord.objects.filter(
        employee__country=country, employee__is_active=True,
        currency=COUNTRY_CURRENCIES[country], pk=Subquery(latest),
    ).order_by()
