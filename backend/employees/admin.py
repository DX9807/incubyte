from django.contrib import admin

from compensation.models import SalaryRecord

from .models import Department, Employee


class SalaryRecordInline(admin.TabularInline):
    model = SalaryRecord
    fields = ['annual_salary', 'currency', 'effective_from', 'created_at']
    readonly_fields = ['currency', 'created_at']
    can_delete = False

    def get_min_num(self, request, obj=None, **kwargs):
        return 0 if obj else 1

    def get_max_num(self, request, obj=None, **kwargs):
        return 0 if obj else 1

    def get_extra(self, request, obj=None, **kwargs):
        return 0

    def get_formset(self, request, obj=None, **kwargs):
        kwargs['validate_min'] = obj is None
        kwargs['validate_max'] = obj is None
        return super().get_formset(request, obj, **kwargs)

    def get_readonly_fields(self, request, obj=None):
        return self.fields if obj else self.readonly_fields

    def has_add_permission(self, request, obj=None):
        return obj is None and super().has_add_permission(request, obj)

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ['name']
    search_fields = ['name']


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ['employee_code', 'full_name', 'department', 'country', 'job_title', 'is_active']
    list_filter = ['department', 'country', 'is_active']
    search_fields = ['employee_code', 'full_name', 'email']
    list_select_related = ['department']
    inlines = [SalaryRecordInline]

    def has_add_permission(self, request):
        # Creating an employee also creates a salary, even for narrowly scoped staff.
        return (super().has_add_permission(request)
                and request.user.has_perm('compensation.add_salaryrecord'))

    def get_readonly_fields(self, request, obj=None):
        return ['country', 'created_at'] if obj else ['created_at']

    def has_delete_permission(self, request, obj=None):
        return False
