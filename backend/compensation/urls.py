from django.urls import path

from .analytics_views import DepartmentAnalyticsView, DistributionView, OverviewView
from .views import EmployeeSalaryView


urlpatterns = [
    path('analytics/overview/', OverviewView.as_view(), name='analytics-overview'),
    path('analytics/departments/', DepartmentAnalyticsView.as_view(), name='analytics-departments'),
    path('analytics/distribution/', DistributionView.as_view(), name='analytics-distribution'),
    path('employees/<int:employee_id>/salaries/', EmployeeSalaryView.as_view(),
         name='employee-salaries'),
]
