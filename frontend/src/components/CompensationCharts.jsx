import { Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { formatSalary } from '../api/employees';

const compact = value => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const bandLabel = band => band.max_annual_salary == null ? `${compact(band.min_annual_salary)}+`
  : Number(band.min_annual_salary) === 0 ? `<${compact(band.max_annual_salary)}`
  : `${compact(band.min_annual_salary)}–<${compact(band.max_annual_salary)}`;

export default function CompensationCharts({ departments, bands, currency }) {
  // Numeric copies are for chart coordinates only; exact decimal strings remain
  // the source for displayed money and tooltips. Django calculates every report.
  const comparison = departments.map(row => ({ ...row, amount: Number(row.average_annual_salary) }));
  const distribution = bands.map(row => ({ ...row, tick: bandLabel(row) }));
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
    <Paper component="section" aria-label="Department comparison" variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, minWidth: 0 }}>
      <Typography component="h2" variant="h5" sx={{ mb: 1 }}>Department comparison</Typography>
      <Typography color="text.secondary" sx={{ fontSize: 13, mb: 2 }}>Average annual base salary · {currency}</Typography>
      <BarChart responsive style={{ width: '100%', height: Math.max(280, departments.length * 44) }} data={comparison} layout="vertical" margin={{ top: 10, right: 20, left: 0, bottom: 5 }} aria-label={`Average annual salary by department in ${currency}`}>
        <CartesianGrid horizontal={false} stroke="#e5e9e3" />
        <XAxis type="number" tickFormatter={compact} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="department_name" width={112} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: '#eaf1e9' }} formatter={(_value, _name, item) => [formatSalary(item.payload.average_annual_salary, currency), 'Average salary']} />
        <Bar dataKey="amount" name="Average salary" fill="#286549" radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive={false} />
      </BarChart>
      <Box component="details" sx={{ mt: 2 }}><Typography component="summary" sx={{ cursor: 'pointer', fontSize: 13, color: 'primary.main' }}>View department values</Typography>
        <TableContainer><Table size="small" aria-label="Department salary values">
          <TableHead><TableRow><TableCell>Department</TableCell><TableCell>Employees</TableCell><TableCell>Average annual salary</TableCell></TableRow></TableHead>
          <TableBody>{departments.map(row => <TableRow key={row.department_id}><TableCell>{row.department_name}</TableCell><TableCell>{row.employee_count.toLocaleString()}</TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{formatSalary(row.average_annual_salary, currency)}</TableCell></TableRow>)}</TableBody>
        </Table></TableContainer>
      </Box>
    </Paper>
    <Paper component="section" aria-label="Salary distribution" variant="outlined" sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, minWidth: 0 }}>
      <Typography component="h2" variant="h5" sx={{ mb: 1 }}>Salary distribution</Typography>
      <Typography color="text.secondary" sx={{ fontSize: 13, mb: 2 }}>Employees by annual salary band · {currency}</Typography>
      <BarChart responsive style={{ width: '100%', height: 280 }} data={distribution} barCategoryGap="15%" margin={{ top: 10, right: 10, left: -15, bottom: 15 }} aria-label={`Employee count by annual salary band in ${currency}`}>
        <CartesianGrid vertical={false} stroke="#e5e9e3" />
        <XAxis dataKey="tick" interval={0} angle={-30} textAnchor="end" height={60} tickMargin={8} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tickFormatter={compact} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: '#f1f3e9' }} labelFormatter={(_label, items) => items[0]?.payload.label || ''} formatter={value => [Number(value).toLocaleString(), 'Employees']} />
        <Bar dataKey="employee_count" name="Employees" fill="#91a36d" radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
      <Box component="details" sx={{ mt: 2 }}><Typography component="summary" sx={{ cursor: 'pointer', fontSize: 13, color: 'primary.main' }}>View salary band values</Typography>
        <TableContainer><Table size="small" aria-label="Salary band values">
          <TableHead><TableRow><TableCell>Annual salary band ({currency})</TableCell><TableCell>Employees</TableCell></TableRow></TableHead>
          <TableBody>{bands.map(row => <TableRow key={row.label}><TableCell>{row.label}</TableCell><TableCell>{row.employee_count.toLocaleString()}</TableCell></TableRow>)}</TableBody>
        </Table></TableContainer>
      </Box>
    </Paper>
  </Box>;
}
