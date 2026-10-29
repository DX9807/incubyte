from django.urls import path

from .views import DepartmentListView, EmployeeViewSet


urlpatterns = [
    path('departments/', DepartmentListView.as_view(), name='department-list'),
    path('employees/', EmployeeViewSet.as_view({'get': 'list', 'post': 'create'}),
         name='employee-list'),
    path('employees/<int:pk>/', EmployeeViewSet.as_view({'get': 'retrieve', 'patch': 'partial_update'}),
         name='employee-detail'),
]
