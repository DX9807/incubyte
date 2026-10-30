import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import AppLayout from './components/AppLayout';
import Brand from './components/Brand';
import LoginPage from './pages/LoginPage';
import WorkspacePlaceholder from './pages/WorkspacePlaceholder';
import EmployeesPage from './pages/EmployeesPage';
import EmployeeDetailsPage from './pages/EmployeeDetailsPage';

function ProtectedRoute() {
  const { user } = useAuth();
  const location = useLocation();
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
}

export default function App() {
  const { checking, sessionError, checkSession } = useAuth();
  if (checking || sessionError) return <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', p: 3 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', flexDirection: 'column', gap: 3, maxWidth: 400 }}>
      <Brand />
      {checking ? <><CircularProgress size={26} /><Typography color="text.secondary">Opening your workspace…</Typography></>
        : <><Alert severity="error" role="alert">{sessionError}</Alert><Button variant="contained" onClick={() => checkSession()}>Try again</Button></>}
    </Box>
  </Box>;
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<ProtectedRoute />}>
      <Route element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<WorkspacePlaceholder section="Dashboard" icon="dashboard" description="An overview of compensation across your organization." />} />
        <Route path="/employees" element={<EmployeesPage />} />
        <Route path="/employees/:id" element={<EmployeeDetailsPage />} />
        <Route path="*" element={<Box><Typography component="h1" variant="h3" sx={{ mb: 2 }}>Page not found</Typography><Button href="/dashboard">Back to Dashboard</Button></Box>} />
      </Route>
    </Route>
  </Routes>;
}
