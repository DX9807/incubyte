import { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, MenuItem, Paper, TextField, Typography } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { analyticsApi } from '../api/analytics';
import { COUNTRIES, formatSalary } from '../api/employees';
import { useAuth } from '../auth/AuthContext';
import CompensationCharts from '../components/CompensationCharts';

export default function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const country = COUNTRIES.find(item => item.code === params.get('country')) || COUNTRIES[0];
  const { checkSession } = useAuth();
  const [state, setState] = useState({ country: '', loading: true, data: null, error: '' });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ country: country.code, loading: true, data: null, error: '' });
    analyticsApi.load(country.code, controller.signal).then(data => {
      if (!controller.signal.aborted) setState({ country: country.code, loading: false, data, error: '' });
    }).catch(failure => {
      if (controller.signal.aborted || failure.name === 'AbortError') return;
      setState({ country: country.code, loading: false, data: null, error: failure.message });
      if (failure.status === 403) checkSession();
    });
    return () => controller.abort();
  }, [country.code, version, checkSession]);
  const loading = state.loading || state.country !== country.code;
  const data = !loading ? state.data : null;
  const overview = data?.overview;
  const metrics = overview ? [
    ['Total annual base salary', formatSalary(overview.total_annual_salary, data.currency)],
    ['Active employees', overview.employee_count.toLocaleString()],
    ['Average annual base salary', formatSalary(overview.average_annual_salary, data.currency)],
    ['Minimum annual base salary', formatSalary(overview.min_annual_salary, data.currency)],
    ['Maximum annual base salary', formatSalary(overview.max_annual_salary, data.currency)],
  ] : [];
  return <>
    <Typography className="eyebrow" color="text.secondary" sx={{ mb: 1.5 }}>COMPENSATION OVERVIEW</Typography>
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { sm: 'center' }, gap: 3, mb: 2 }}>
      <Typography component="h1" variant="h3">Dashboard</Typography>
      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <TextField select size="small" label="Country" value={country.code} onChange={event => setParams({ country: event.target.value })} sx={{ minWidth: { xs: 0, sm: 180 }, flex: 1 }}>
          {COUNTRIES.map(item => <MenuItem key={item.code} value={item.code}>{item.name}</MenuItem>)}
        </TextField>
        <Button variant="outlined" onClick={() => setVersion(value => value + 1)} disabled={loading}>Refresh</Button>
      </Box>
    </Box>
    <Typography color="text.secondary" sx={{ fontSize: 14, mb: 4 }}>Active employees with a current salary in {country.name}. All amounts are annual and shown in {country.currency}.</Typography>
    {loading ? <Box sx={{ py: 10, textAlign: 'center' }}><CircularProgress size={28} aria-label="Loading compensation analytics" /></Box>
      : state.error ? <Alert severity="error" role="alert" action={<Button onClick={() => setVersion(value => value + 1)}>Retry analytics</Button>}>{state.error}</Alert>
      : data && <>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 2.5, mb: 3 }}>
          {metrics.map(([label, value], index) => <Paper component="section" aria-label={label} key={label} variant="outlined" sx={{ p: 3, borderRadius: 3, minWidth: 0, gridColumn: index === 0 ? { lg: 'span 2' } : undefined, bgcolor: index === 0 ? 'primary.dark' : 'background.paper', color: index === 0 ? 'primary.contrastText' : 'text.primary' }}>
            <Typography component="h2" sx={{ fontSize: 13, mb: 2, opacity: 0.8 }}>{label}</Typography>
            <Typography sx={{ fontSize: index === 0 ? 30 : 23, fontWeight: 650, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{value}</Typography>
          </Paper>)}
        </Box>
        {overview.employee_count === 0 ? <Paper variant="outlined" sx={{ p: 5, textAlign: 'center', borderRadius: 3 }}>
          <Typography component="h2" variant="h5" sx={{ mb: 1 }}>No compensation data for {country.name}</Typography>
          <Typography color="text.secondary">There are no active employees with a current salary in this country.</Typography>
        </Paper> : <CompensationCharts departments={data.departments} bands={data.bands} currency={data.currency} />}
      </>}
  </>;
}
