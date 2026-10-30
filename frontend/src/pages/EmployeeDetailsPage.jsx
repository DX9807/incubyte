import { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Snackbar, Typography } from '@mui/material';
import { Link, useLocation, useParams } from 'react-router-dom';
import { countryName, employeesApi, formatSalary } from '../api/employees';
import { useAuth } from '../auth/AuthContext';
import AppIcon from '../components/AppIcon';
import EmployeeFormDialog from '../components/EmployeeFormDialog';
import SalaryHistory from '../components/SalaryHistory';
import useDepartments from '../hooks/useDepartments';

export default function EmployeeDetailsPage() {
  const { id } = useParams();
  const { state } = useLocation();
  const { checkSession } = useAuth();
  const lookup = useDepartments();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
  const backTo = typeof state?.backTo === 'string' && (state.backTo === '/employees' || state.backTo.startsWith('/employees?')) ? state.backTo : '/employees';
  useEffect(() => {
    const controller = new AbortController();
    setEmployee(null);
    setLoading(true);
    setError('');
    setMissing(false);
    employeesApi.detail(id, controller.signal).then(result => { if (!controller.signal.aborted) setEmployee(result); }).catch(failure => {
      if (failure.name === 'AbortError') return;
      if (failure.status === 403) checkSession();
      else { setMissing(failure.status === 404); setError(failure.message); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, version, checkSession]);

  async function changeStatus() {
    if (saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const updated = await employeesApi.update(employee.id, { is_active: !employee.is_active });
      setConfirm(false);
      setVersion(value => value + 1);
      setNotice(`${updated.full_name} ${updated.is_active ? 'reactivated' : 'deactivated'}.`);
    } catch (failure) { setSaveError(failure.message); }
    finally { setSaving(false); }
  }

  return <>
    <Button component={Link} to={backTo} startIcon={<AppIcon name="back" />} sx={{ px: 0, mb: 3 }}>Back to employees</Button>
    {loading && !employee ? <Box sx={{ py: 10, textAlign: 'center' }}><CircularProgress size={28} aria-label="Loading employee" /></Box>
      : error ? <Paper variant="outlined" sx={{ p: 4, borderRadius: 3 }}><Typography component="h1" variant="h5" sx={{ mb: 2 }}>{missing ? 'Employee not found' : 'Unable to load employee'}</Typography>
        <Typography color="text.secondary">{missing ? 'This employee could not be found. Return to the employee list to continue.' : error}</Typography>
        {!missing && <Button onClick={() => setVersion(value => value + 1)} sx={{ mt: 2 }}>Retry</Button>}
      </Paper>
      : employee && <>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, gap: 2, mb: 1 }}>
          <Box><Typography className="eyebrow" color="text.secondary" sx={{ mb: 1.5 }}>{employee.employee_code}</Typography><Typography component="h1" variant="h3">{employee.full_name}</Typography></Box>
          <Button variant="contained" startIcon={<AppIcon name="edit" />} onClick={() => setEditing(true)} disabled={lookup.loading || Boolean(lookup.error) || !lookup.departments.length}>Edit profile</Button>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}><Typography color="text.secondary">{employee.job_title}</Typography><Chip label={employee.is_active ? 'Active' : 'Inactive'} size="small" sx={{ bgcolor: employee.is_active ? 'primary.light' : '#eceee9', color: employee.is_active ? 'primary.main' : 'text.secondary' }} /></Box>
        {lookup.error && <Alert severity="error" action={<Button onClick={lookup.retry}>Retry departments</Button>} sx={{ mb: 3 }}>Department options could not be loaded. {lookup.error}</Alert>}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.4fr 1fr' }, gap: 3 }}>
          <Paper variant="outlined" sx={{ p: 3.5, borderRadius: 3 }}>
            <Typography component="h2" variant="h5" sx={{ mb: 3 }}>Employee profile</Typography>
            <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 3 }}>
              {[
                ['Employee code', employee.employee_code], ['Email', employee.email],
                ['Department', employee.department_name], ['Country', countryName(employee.country)],
                ['Job title', employee.job_title], ['Added on', new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(employee.created_at))],
              ].map(([label, value]) => <Box key={label} sx={{ minWidth: 0 }}><Typography component="dt" sx={{ fontSize: 12, color: 'text.secondary', mb: 0.8 }}>{label}</Typography><Typography component="dd" sx={{ m: 0, fontSize: 14, fontWeight: 550, overflowWrap: 'anywhere' }}>{value}</Typography></Box>)}
            </Box>
          </Paper>
          <Paper component="section" aria-label="Current salary" variant="outlined" sx={{ p: 3.5, borderRadius: 3 }}>
            <Typography component="h2" variant="h5" sx={{ mb: 3 }}>Current salary</Typography>
            <Typography color="text.secondary" sx={{ fontSize: 13, mb: 1.5 }}>Annual base salary</Typography>
            <Typography sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 650, color: 'primary.dark', fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{formatSalary(employee.annual_salary, employee.currency)}</Typography>
            <Typography color="text.secondary" sx={{ fontSize: 12, mt: 2 }}>Current compensation in the employee&apos;s country currency.</Typography>
          </Paper>
        </Box>
        <SalaryHistory employee={employee} onRevised={() => { setVersion(value => value + 1); setNotice('Salary revision saved.'); }} />
        <Paper variant="outlined" sx={{ p: 3, mt: 3, borderRadius: 3, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, justifyContent: 'space-between', gap: 2 }}>
          <Box><Typography sx={{ fontWeight: 600, mb: 0.5 }}>Employee status</Typography><Typography color="text.secondary" sx={{ fontSize: 13 }}>Deactivation retains the employee profile and salary records.</Typography></Box>
          <Button variant="outlined" color={employee.is_active ? 'error' : 'primary'} onClick={() => { setSaveError(''); setConfirm(true); }}>{employee.is_active ? 'Deactivate employee' : 'Reactivate employee'}</Button>
        </Paper>
        {editing && <EmployeeFormDialog employee={employee} departments={lookup.departments} onClose={() => setEditing(false)} onSaved={updated => {
          setEditing(false); setVersion(value => value + 1); setNotice(`${updated.full_name} updated.`);
        }} />}
        <Dialog open={confirm} onClose={() => { if (!saving) setConfirm(false); }} disableEscapeKeyDown={saving} maxWidth="xs" fullWidth aria-labelledby="employee-status-title">
          <DialogTitle id="employee-status-title">{employee.is_active ? 'Deactivate employee?' : 'Reactivate employee?'}</DialogTitle>
          <DialogContent>{saveError && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{saveError}</Alert>}<Typography color="text.secondary">{employee.is_active ? 'This employee will no longer appear in active employee results. Their profile and salary records will be retained.' : 'This employee will appear in active employee results again.'}</Typography></DialogContent>
          <DialogActions sx={{ px: 3, pb: 3 }}><Button onClick={() => setConfirm(false)} disabled={saving}>Cancel</Button><Button variant="contained" color={employee.is_active ? 'error' : 'primary'} disabled={saving} onClick={changeStatus}>{saving ? 'Saving…' : employee.is_active ? 'Deactivate' : 'Reactivate'}</Button></DialogActions>
        </Dialog>
      </>}
    <Snackbar open={Boolean(notice)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} autoHideDuration={4500} onClose={() => setNotice('')} message={notice} />
  </>;
}
