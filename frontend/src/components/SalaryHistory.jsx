import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { formatSalary } from '../api/employees';
import { salariesApi, utcToday } from '../api/salaries';
import { useAuth } from '../auth/AuthContext';
import SalaryRevisionDialog from './SalaryRevisionDialog';

const dateLabel = value => new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value));

export default function SalaryHistory({ employee, onRevised }) {
  const { checkSession } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [revising, setRevising] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    salariesApi.history(employee.id, controller.signal).then(result => {
      if (!controller.signal.aborted) setRecords(result);
    }).catch(failure => {
      if (failure.name === 'AbortError') return;
      setError(failure.message);
      if (failure.status === 403) checkSession();
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [employee.id, version, checkSession]);
  const latestDate = records[0]?.effective_from;
  const canRevise = !loading && !error && Boolean(latestDate) && latestDate < utcToday();
  return <Paper component="section" aria-label="Salary history" variant="outlined" sx={{ mt: 3, borderRadius: 3, overflow: 'hidden' }}>
    <Box sx={{ p: 3.5, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 2 }}>
      <Box><Typography component="h2" variant="h5" sx={{ mb: 1 }}>Salary history</Typography><Typography color="text.secondary" sx={{ fontSize: 13 }}>Newest effective date first. Previous records are retained.</Typography></Box>
      <Button variant="outlined" disabled={!canRevise} onClick={() => setRevising(true)}>Revise salary</Button>
    </Box>
    {loading ? <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={25} aria-label="Loading salary history" /></Box>
      : error ? <Alert severity="error" role="alert" sx={{ mx: 3.5, mb: 3 }} action={<Button onClick={() => setVersion(value => value + 1)}>Retry history</Button>}>{error}</Alert>
      : !records.length ? <Typography color="text.secondary" sx={{ px: 3.5, pb: 3 }}>No salary history available. An initial salary is required before adding a revision.</Typography>
      : <>
        {!canRevise && <Alert severity="info" sx={{ mx: 3.5, mb: 2 }}>A revision must take effect after {latestDate} and no later than today (UTC).</Alert>}
        <TableContainer sx={{ maxHeight: 400 }}><Table stickyHeader aria-label="Salary history" sx={{ minWidth: 530 }}>
          <TableHead><TableRow>{['Effective from', 'Annual salary', 'Recorded on'].map(label => <TableCell key={label} sx={{ fontSize: 12, fontWeight: 650 }}>{label}</TableCell>)}</TableRow></TableHead>
          <TableBody>{records.map(record => <TableRow key={record.id}>
            <TableCell>{dateLabel(`${record.effective_from}T00:00:00Z`)}</TableCell>
            <TableCell sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatSalary(record.annual_salary, record.currency)}</TableCell>
            <TableCell>{dateLabel(record.created_at)}</TableCell>
          </TableRow>)}</TableBody>
        </Table></TableContainer>
      </>}
    {revising && <SalaryRevisionDialog employee={employee} latestDate={latestDate} onClose={() => setRevising(false)} onSaved={() => { setRevising(false); onRevised(); }} />}
  </Paper>;
}
