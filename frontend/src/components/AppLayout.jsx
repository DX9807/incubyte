import { useState } from 'react';
import { Alert, Avatar, Box, Button, Chip, Divider, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Typography, useMediaQuery, useTheme } from '@mui/material';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import Brand from './Brand';
import AppIcon from './AppIcon';

const navigation = [{ to: '/dashboard', label: 'Dashboard', icon: 'dashboard' }, { to: '/employees', label: 'Employees', icon: 'employees' }];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const mobile = useMediaQuery(useTheme().breakpoints.down('md'));
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState('');
  const location = useLocation();
  const title = navigation.find(item => location.pathname.startsWith(item.to))?.label || 'Workspace';

  async function signOut() {
    if (loggingOut) return;
    setLoggingOut(true);
    setError('');
    try { await logout(); }
    catch (failure) { setError(failure.message); }
    finally { setLoggingOut(false); }
  }

  return <Box sx={{ minHeight: '100dvh', display: 'flex' }}>
    <Drawer variant={mobile ? 'temporary' : 'permanent'} open={!mobile || open} onClose={() => setOpen(false)}
      sx={{ width: { md: 248 }, flexShrink: 0, '& .MuiDrawer-paper': { width: 248, boxSizing: 'border-box', borderColor: 'divider', p: 3, bgcolor: '#fcfdfb' } }}>
      <Box sx={{ py: 1, mb: 5 }}><Brand /></Box>
      <Typography className="eyebrow" color="text.secondary" sx={{ px: 1.5, mb: 1.5, fontSize: 10 }}>WORKSPACE</Typography>
      <List component="nav" aria-label="Main navigation" sx={{ p: 0 }}>
        {navigation.map(item => <ListItemButton key={item.to} component={NavLink} to={item.to} onClick={() => setOpen(false)}
          sx={{ mb: 1, borderRadius: 2, py: 1.5, color: 'text.secondary', '&.active': { bgcolor: 'primary.light', color: 'primary.main', '& .MuiListItemIcon-root': { color: 'primary.main' } } }}>
          <ListItemIcon sx={{ minWidth: 36 }}><AppIcon name={item.icon} sx={{ fontSize: 21 }} /></ListItemIcon>
          <ListItemText primary={item.label} slotProps={{ primary: { fontSize: 14, fontWeight: 600 } }} />
        </ListItemButton>)}
      </List>
      <Box sx={{ mt: 'auto', pt: 4 }}>
        <Divider sx={{ mb: 2.5 }} />
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 2.5 }}>
          <Avatar sx={{ width: 36, height: 36, bgcolor: '#e6ece5', color: 'primary.dark', fontSize: 12, fontWeight: 700 }}>{user.username.slice(0, 2).toUpperCase()}</Avatar>
          <Box sx={{ minWidth: 0 }}><Typography noWrap sx={{ fontSize: 13, fontWeight: 650 }}>{user.username}</Typography>
            <Typography noWrap color="text.secondary" sx={{ fontSize: 11 }}>HR staff</Typography></Box>
        </Box>
        <Button fullWidth onClick={signOut} disabled={loggingOut} startIcon={<AppIcon name="logout" />}
          sx={{ justifyContent: 'flex-start', color: 'text.secondary', px: 1 }}>{loggingOut ? 'Logging out…' : 'Log out'}</Button>
      </Box>
    </Drawer>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Box component="header" sx={{ height: 80, px: { xs: 2.5, md: 5 }, display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
        {mobile && <IconButton aria-label="Open navigation" onClick={() => setOpen(true)}><AppIcon name="menu" /></IconButton>}
        <Typography color="text.secondary" sx={{ fontSize: 13 }}>Workspace <Box component="span" sx={{ mx: 1.3, color: '#bdc5be' }}>/</Box> <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>{title}</Box></Typography>
        <Chip label="HR workspace" size="small" variant="outlined" sx={{ ml: 'auto', borderColor: 'divider', fontSize: 11, display: { xs: 'none', sm: 'flex' } }} />
      </Box>
      <Box component="main" sx={{ p: { xs: 3, md: 5 }, maxWidth: 1400, mx: 'auto' }}>
        {error && <Alert role="alert" severity="error" onClose={() => setError('')} sx={{ mb: 3 }}>{error}</Alert>}
        <Outlet />
      </Box>
    </Box>
  </Box>;
}
