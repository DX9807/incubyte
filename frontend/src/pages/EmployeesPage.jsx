import { useEffect, useState } from 'react';
import { Alert, Avatar, Box, Button, Chip, CircularProgress, InputAdornment, MenuItem, Paper, Snackbar, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Typography } from '@mui/material';
import { Link, useSearchParams } from 'react-router-dom';
import { COUNTRIES, PAGE_SIZE, countryName, employeesApi, formatSalary } from '../api/employees';
import { useAuth } from '../auth/AuthContext';
import AppIcon from '../components/AppIcon';
import EmployeeFormDialog from '../components/EmployeeFormDialog';
import useDepartments from '../hooks/useDepartments';

export default function EmployeesPage() {
  const [params, setParams] = useSearchParams();
  const { checkSession } = useAuth();
  const lookup = useDepartments();
  const [draft, setDraft] = useState(params.get('search') || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [notice, setNotice] = useState('');
  const search = params.get('search') || '';
  const department = params.get('department') || '';
  const country = params.get('country') || '';
  const active = params.get('is_active') ?? '';
  const page = /^[1-9]\d*$/.test(params.get('page') || '') ? Number(params.get('page')) : 1;
  const backTo = `/employees${params.size ? `?${params}` : ''}`;
  useEffect(() => setDraft(search), [search]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    employeesApi.list({ search, department, country, is_active: active, page }, controller.signal)
      .then(result => { if (!controller.signal.aborted) setData(result); }).catch(failure => {
        if (failure.name === 'AbortError') return;
        if (failure.status === 403) checkSession();
        else if (failure.status === 404 && page > 1) {
          // An edit/filter may remove the final page; start at a valid page.
          setParams(current => { const next = new URLSearchParams(current); next.delete('page'); return next; }, { replace: true });
        } else setError(failure.message);
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [search, department, country, active, page, version, checkSession, setParams]);

  function filter(name, value) {
    setParams(current => {
      const next = new URLSearchParams(current);
      if (value === '') next.delete(name); else next.set(name, value);
      next.delete('page');
      return next;
    });
  }
  const canEdit = !lookup.loading && !lookup.error && lookup.departments.length > 0;
  return <>
    <Typography className="eyebrow" color="text.secondary" sx={{ mb: 1.5 }}>YOUR PEOPLE</Typography>
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, justifyContent: 'space-between', gap: 2, mb: 1 }}>
      <Typography component="h1" variant="h3">Employees</Typography>
      <Button variant="contained" startIcon={<AppIcon name="plus" />} onClick={() => setDialog({})} disabled={!canEdit}>Add employee</Button>
    </Box>
    <Typography color="text.secondary" sx={{ mb: 4 }}>Manage employee profiles and current annual salaries.</Typography>
    {lookup.error && <Alert severity="error" sx={{ mb: 2 }} action={<Button onClick={lookup.retry}>Retry departments</Button>}>Department options could not be loaded. {lookup.error}</Alert>}
    {!lookup.loading && !lookup.error && !lookup.departments.length && <Alert severity="info" sx={{ mb: 2 }}>Ask your administrator to add a department before creating employees.</Alert>}
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
      <Box sx={{ p: 3, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Box component="form" onSubmit={event => { event.preventDefault(); filter('search', draft.trim()); }} sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
          <TextField label="Search employees" placeholder="Name, email, or employee code" value={draft} onChange={event => setDraft(event.target.value)} size="small" fullWidth
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><AppIcon name="search" sx={{ fontSize: 20 }} /></InputAdornment> } }} />
          <Button type="submit" variant="outlined">Search</Button>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr)) auto' }, gap: 2, alignItems: 'center' }}>
          <TextField select label="Department" value={department} onChange={event => filter('department', event.target.value)} size="small" disabled={lookup.loading || Boolean(lookup.error)}>
            <MenuItem value="">All departments</MenuItem>{lookup.departments.map(item => <MenuItem key={item.id} value={String(item.id)}>{item.name}</MenuItem>)}
          </TextField>
          <TextField select label="Country" value={country} onChange={event => filter('country', event.target.value)} size="small">
            <MenuItem value="">All countries</MenuItem>{COUNTRIES.map(item => <MenuItem key={item.code} value={item.code}>{item.name}</MenuItem>)}
          </TextField>
          <TextField select label="Status" value={active} onChange={event => filter('is_active', event.target.value)} size="small">
            <MenuItem value="">All statuses</MenuItem><MenuItem value="true">Active</MenuItem><MenuItem value="false">Inactive</MenuItem>
          </TextField>
          <Button onClick={() => { setParams({}); setDraft(''); }} disabled={!params.size}>Clear filters</Button>
        </Box>
      </Box>
      <Box sx={{ px: 3, py: 2 }}><Typography sx={{ fontSize: 13, color: 'text.secondary' }}>{loading ? 'Loading employees…' : error ? 'Employee list unavailable' : `${(data?.count || 0).toLocaleString()} employees`}</Typography></Box>
      {error ? <Alert severity="error" role="alert" sx={{ mx: 3, mb: 3 }} action={<Button onClick={() => setVersion(value => value + 1)}>Retry</Button>}>{error}</Alert>
        : <TableContainer sx={{ maxHeight: 560 }}><Table stickyHeader aria-label="Employees" sx={{ minWidth: 940, '& .MuiTableCell-root': { px: 1.5, py: 1.5 } }}>
          <TableHead><TableRow sx={{ bgcolor: '#f8faf6' }}>{['Employee code', 'Employee name', 'Department', 'Country', 'Annual salary', 'Status', 'Action'].map(label => <TableCell key={label} sx={{ fontSize: 12, fontWeight: 650, py: 1.5, whiteSpace: 'nowrap' }}>{label}</TableCell>)}</TableRow></TableHead>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={7} align="center" sx={{ py: 8 }}><CircularProgress size={25} aria-label="Loading employees" /></TableCell></TableRow>
              : !data?.results.length ? <TableRow><TableCell colSpan={7} align="center" sx={{ py: 8 }}><Typography sx={{ fontWeight: 600, mb: 1 }}>No employees found</Typography><Typography color="text.secondary" sx={{ fontSize: 14 }}>Try a different search or clear the filters.</Typography></TableCell></TableRow>
              : data.results.map(employee => <TableRow key={employee.id} hover>
                <TableCell><Typography noWrap title={employee.employee_code} sx={{ fontSize: 12, maxWidth: 115 }}>{employee.employee_code}</Typography></TableCell>
                <TableCell><Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                  <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.light', color: 'primary.main', fontSize: 11 }}>{employee.full_name.split(' ').map(part => part[0]).slice(0, 2).join('')}</Avatar>
                  <Box sx={{ maxWidth: 160 }}><Typography component={Link} to={`/employees/${employee.id}`} state={{ backTo }} noWrap title={employee.full_name} sx={{ color: 'text.primary', fontSize: 13, fontWeight: 600, display: 'block', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>{employee.full_name}</Typography><Typography noWrap title={employee.email} color="text.secondary" sx={{ fontSize: 11 }}>{employee.email}</Typography></Box>
                </Box></TableCell>
                <TableCell sx={{ fontSize: 12 }}>{employee.department_name}</TableCell>
                <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>{countryName(employee.country)}</TableCell>
                <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{formatSalary(employee.annual_salary, employee.currency)}</TableCell>
                <TableCell><Chip label={employee.is_active ? 'Active' : 'Inactive'} size="small" sx={{ fontSize: 11, bgcolor: employee.is_active ? 'primary.light' : '#f0f1ee', color: employee.is_active ? 'primary.main' : 'text.secondary' }} /></TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}><Button size="small" sx={{ minWidth: 0, px: 1, py: 0.75 }} component={Link} to={`/employees/${employee.id}`} state={{ backTo }} aria-label={`View ${employee.full_name}`}>View</Button><Button size="small" sx={{ minWidth: 0, px: 1, py: 0.75 }} onClick={() => setDialog({ employee })} disabled={!canEdit} aria-label={`Edit ${employee.full_name}`}>Edit</Button></TableCell>
              </TableRow>)}
          </TableBody>
        </Table></TableContainer>}
      {!error && <TablePagination component="div" count={data?.count ?? -1} page={page - 1} rowsPerPage={PAGE_SIZE} rowsPerPageOptions={[PAGE_SIZE]}
        onPageChange={(_, next) => setParams(current => { const updated = new URLSearchParams(current); if (next) updated.set('page', String(next + 1)); else updated.delete('page'); return updated; })}
        slotProps={{ actions: { previousButton: { disabled: loading || page <= 1 }, nextButton: { disabled: loading || !data?.next } } }}
        sx={{ '& .MuiTablePagination-toolbar': { flexWrap: 'wrap', px: 2 } }} />}
    </Paper>
    {dialog && <EmployeeFormDialog employee={dialog.employee} departments={lookup.departments} onClose={() => setDialog(null)} onSaved={employee => {
      setDialog(null); setVersion(value => value + 1); setNotice(`${employee.full_name} ${dialog.employee ? 'updated' : 'created'}.`);
    }} />}
    <Snackbar open={Boolean(notice)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} autoHideDuration={4500} onClose={() => setNotice('')} message={notice} />
  </>;
}
