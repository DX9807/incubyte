import { useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Switch, TextField, Typography } from '@mui/material';
import { COUNTRIES, employeesApi, formatSalary } from '../api/employees';

export default function EmployeeFormDialog({ employee, departments, onClose, onSaved }) {
  const editing = Boolean(employee);
  const [values, setValues] = useState({
    employee_code: employee?.employee_code || '', full_name: employee?.full_name || '',
    email: employee?.email || '', department: employee?.department || '',
    country: employee?.country || 'IN', job_title: employee?.job_title || '',
    annual_salary: '', is_active: employee?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const currency = COUNTRIES.find(country => country.code === values.country)?.currency || '';
  const fieldError = name => Array.isArray(errors[name]) ? errors[name].join(' ') : errors[name] || '';
  function change(name, value) {
    setValues(current => ({ ...current, [name]: value }));
    setErrors(current => ({ ...current, [name]: undefined }));
  }
  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setError('');
    setErrors({});
    // Keep money as a decimal string; the server enforces amount/precision rules.
    const payload = {
      employee_code: values.employee_code.trim(), full_name: values.full_name.trim(),
      email: values.email.trim(), department: Number(values.department),
      job_title: values.job_title.trim(), is_active: values.is_active,
    };
    if (!editing) Object.assign(payload, { country: values.country, annual_salary: values.annual_salary });
    const invalid = {};
    for (const name of ['employee_code', 'full_name', 'email', 'job_title']) {
      if (!payload[name]) invalid[name] = 'This field is required.';
    }
    if (!values.department) invalid.department = 'Select a department.';
    if (!editing && !/^\d{1,12}(?:\.\d{1,2})?$/.test(values.annual_salary)) {
      invalid.annual_salary = 'Enter a positive amount with up to two decimal places.';
    } else if (!editing && !/[1-9]/.test(values.annual_salary)) {
      invalid.annual_salary = 'Salary must be greater than zero.';
    }
    if (Object.keys(invalid).length) { setErrors(invalid); return; }
    setSaving(true);
    try {
      const saved = editing ? await employeesApi.update(employee.id, payload) : await employeesApi.create(payload);
      onSaved(saved);
    } catch (failure) {
      if (failure.status === 400 && failure.details) {
        setErrors(failure.details);
        setError(failure.details.non_field_errors?.join(' ') || 'Please check the highlighted fields.');
      } else setError(failure.message);
    } finally { setSaving(false); }
  }

  return <Dialog open onClose={() => { if (!saving) onClose(); }} disableEscapeKeyDown={saving} fullWidth maxWidth="sm" aria-labelledby="employee-dialog-title">
    <Box component="form" onSubmit={submit}>
      <DialogTitle id="employee-dialog-title" sx={{ pb: 1 }}>{editing ? 'Edit employee' : 'Add employee'}</DialogTitle>
      <DialogContent>
        <Typography color="text.secondary" sx={{ fontSize: 14, mb: 3 }}>{editing ? 'Update their profile and active status.' : 'Create a profile with an initial annual base salary.'}</Typography>
        {error && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5, pt: 1 }}>
          <TextField label="Employee code" value={values.employee_code} onChange={event => change('employee_code', event.target.value)} required disabled={saving}
            error={Boolean(errors.employee_code)} helperText={fieldError('employee_code')} slotProps={{ htmlInput: { maxLength: 30 } }} />
          <TextField label="Full name" value={values.full_name} onChange={event => change('full_name', event.target.value)} required disabled={saving}
            error={Boolean(errors.full_name)} helperText={fieldError('full_name')} slotProps={{ htmlInput: { maxLength: 200 } }} />
          <TextField label="Email" type="email" value={values.email} onChange={event => change('email', event.target.value)} required disabled={saving}
            error={Boolean(errors.email)} helperText={fieldError('email')} sx={{ gridColumn: '1 / -1' }} slotProps={{ htmlInput: { maxLength: 254 } }} />
          <TextField select label="Department" value={values.department} onChange={event => change('department', event.target.value)} required disabled={saving}
            error={Boolean(errors.department)} helperText={fieldError('department')}>
            {departments.map(department => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}
          </TextField>
          <TextField label="Job title" value={values.job_title} onChange={event => change('job_title', event.target.value)} required disabled={saving}
            error={Boolean(errors.job_title)} helperText={fieldError('job_title')} slotProps={{ htmlInput: { maxLength: 150 } }} />
          {editing ? <TextField label="Country" value={COUNTRIES.find(country => country.code === values.country)?.name || values.country}
            slotProps={{ input: { readOnly: true } }} helperText="Country cannot be changed." />
            : <TextField select label="Country" value={values.country} onChange={event => change('country', event.target.value)} required disabled={saving}
              error={Boolean(errors.country)} helperText={fieldError('country')}>
              {COUNTRIES.map(country => <MenuItem key={country.code} value={country.code}>{country.name}</MenuItem>)}
            </TextField>}
          {editing ? <TextField label="Current annual salary" value={formatSalary(employee.annual_salary, employee.currency)}
            slotProps={{ input: { readOnly: true } }} helperText="Salary is separate from profile changes." />
            : <TextField label={`Annual salary (${currency})`} value={values.annual_salary} onChange={event => change('annual_salary', event.target.value)} required disabled={saving}
              error={Boolean(errors.annual_salary)} helperText={fieldError('annual_salary') || 'Annual base salary in the country currency.'} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />}
        </Box>
        <FormControlLabel sx={{ mt: 2 }} control={<Switch checked={values.is_active} onChange={event => change('is_active', event.target.checked)} disabled={saving} />} label="Active employee" />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={saving} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Create employee'}
        </Button>
      </DialogActions>
    </Box>
  </Dialog>;
}
