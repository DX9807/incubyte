import { useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import { salariesApi, utcToday, validateRevision } from '../api/salaries';
import { useAuth } from '../auth/AuthContext';

export default function SalaryRevisionDialog({ employee, latestDate, onClose, onSaved }) {
  const { checkSession } = useAuth();
  const [values, setValues] = useState({ annual_salary: '', effective_from: utcToday() });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const fieldError = name => Array.isArray(errors[name]) ? errors[name].join(' ') : errors[name] || '';
  function change(name, value) {
    setValues(current => ({ ...current, [name]: value }));
    setErrors(current => ({ ...current, [name]: undefined }));
  }
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    setError('');
    const invalid = validateRevision(values, latestDate);
    setErrors(invalid);
    if (Object.keys(invalid).length) return;
    pending.current = true;
    setSaving(true);
    try {
      // Preserve decimal precision and let the server derive currency/employee.
      await salariesApi.revise(employee.id, values);
      onSaved();
    } catch (failure) {
      if (failure.status === 400 && failure.details) {
        setErrors(failure.details);
        setError(failure.details.non_field_errors?.join(' ') || 'Please check the highlighted fields.');
      } else {
        setError(failure.message);
        if (failure.status === 403) checkSession();
      }
    } finally { pending.current = false; setSaving(false); }
  }

  return <Dialog open onClose={() => { if (!pending.current) onClose(); }} disableEscapeKeyDown={saving} fullWidth maxWidth="sm" aria-labelledby="salary-revision-title">
    <Box component="form" noValidate onSubmit={submit}>
      <DialogTitle id="salary-revision-title">Revise salary</DialogTitle>
      <DialogContent>
        <Typography color="text.secondary" sx={{ fontSize: 14, mb: 3 }}>Add a new annual base salary for {employee.full_name}. Previous salary records will be retained.</Typography>
        {error && <Alert severity="error" role="alert" sx={{ mb: 3 }}>{error}</Alert>}
        <Box sx={{ display: 'grid', gap: 2.5, pt: 1 }}>
          <TextField label="Currency" value={employee.currency} slotProps={{ input: { readOnly: true } }} helperText="Determined by the employee's country." />
          <TextField label="Annual salary" value={values.annual_salary} onChange={event => change('annual_salary', event.target.value)} required disabled={saving}
            error={Boolean(errors.annual_salary)} helperText={fieldError('annual_salary') || 'Enter the annual amount; salary increases and decreases are allowed.'} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
          <TextField label="Effective from" type="date" value={values.effective_from} onChange={event => change('effective_from', event.target.value)} required disabled={saving}
            error={Boolean(errors.effective_from)} helperText={fieldError('effective_from') || `After ${latestDate} and no later than today (UTC).`}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: utcToday() } }} />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3 }}>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={saving} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>{saving ? 'Saving…' : 'Save revision'}</Button>
      </DialogActions>
    </Box>
  </Dialog>;
}
