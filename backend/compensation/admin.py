from django.contrib import admin

from .models import SalaryRecord


@admin.register(SalaryRecord)
class SalaryRecordAdmin(admin.ModelAdmin):
    list_display = ['employee', 'annual_salary', 'currency', 'effective_from', 'created_at']
    list_filter = ['currency', 'employee__country']
    search_fields = ['employee__employee_code', 'employee__full_name']
    list_select_related = ['employee']
    readonly_fields = ['employee', 'annual_salary', 'currency', 'effective_from', 'created_at']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
