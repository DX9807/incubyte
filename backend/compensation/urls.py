from django.urls import path

from .views import EmployeeSalaryView


urlpatterns = [
    path('employees/<int:employee_id>/salaries/', EmployeeSalaryView.as_view(),
         name='employee-salaries'),
]
