import { useState } from 'react';
import { Alert, Box, Button, CircularProgress, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import AppIcon from '../components/AppIcon';
import Brand from '../components/Brand';

export default function LoginPage() {
  const { user, login } = useAuth();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const requested = location.state?.from;
  const destination = typeof requested === 'string' && requested.startsWith('/') && !requested.startsWith('//') && requested !== '/login'
    ? requested : '/dashboard';

  if (user) return <Navigate to={destination} replace />;

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setError('');
    setSaving(true);
    try { await login({ username: username.trim(), password }); }
    catch (failure) { setError(failure.message); }
    finally { setSaving(false); }
  }

  return <Box className="login-page">
    <Box component="aside" className="login-story">
      <Brand light />
      <Box sx={{ position: 'relative', zIndex: 1, maxWidth: 470, py: 7 }}>
        <Typography className="eyebrow" sx={{ color: '#b7d5c3', mb: 3 }}>PEOPLE FIRST. ALWAYS.</Typography>
        <Typography component="h2" sx={{ fontSize: { md: 46, lg: 58 }, fontWeight: 550, lineHeight: 1.12, letterSpacing: '-2px', mb: 3 }}>
          A clearer view.<br />A better workplace.
        </Typography>
        <Typography sx={{ color: '#c2d6cc', fontSize: 17, lineHeight: 1.8, maxWidth: 360 }}>
          Your people and their compensation, thoughtfully brought together.
        </Typography>
        <Box className="story-art" aria-hidden="true">
          <div className="art-orbit" /><div className="art-block art-block-one" />
          <div className="art-block art-block-two" /><div className="art-dot" />
        </Box>
      </Box>
      <Typography sx={{ color: '#a7c5b6', fontSize: 12 }}>ACME · People Operations</Typography>
    </Box>
    <Box component="main" className="login-main">
      <Box sx={{ display: { xs: 'block', md: 'none' }, mb: 7 }}><Brand /></Box>
      <Box sx={{ width: '100%', maxWidth: 400 }}>
        <Box sx={{ display: 'inline-flex', p: 1.3, bgcolor: 'primary.light', color: 'primary.main', borderRadius: '14px', mb: 3 }}><AppIcon name="lock" /></Box>
        <Typography className="eyebrow" color="text.secondary" sx={{ mb: 1.5 }}>SALARY MANAGEMENT</Typography>
        <Typography variant="h3" component="h1" sx={{ mb: 1.5 }}>Welcome back.</Typography>
        <Typography color="text.secondary" sx={{ mb: 4 }}>Sign in with your HR account to continue.</Typography>
        {error && <Alert severity="error" sx={{ mb: 3 }} role="alert">{error}</Alert>}
        <Box component="form" onSubmit={submit} sx={{ display: 'grid', gap: 2.5 }}>
          <TextField id="username" label="Username" value={username} onChange={event => setUsername(event.target.value)}
            autoComplete="username" required fullWidth disabled={saving} autoFocus
            slotProps={{ htmlInput: { maxLength: 150 } }} />
          <TextField id="password" label="Password" value={password} onChange={event => setPassword(event.target.value)}
            autoComplete="current-password" type={showPassword ? 'text' : 'password'} required fullWidth disabled={saving}
            slotProps={{ input: { endAdornment: <InputAdornment position="end"><IconButton
              aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}
              disabled={saving} edge="end"><AppIcon name={showPassword ? 'eyeOff' : 'eye'} sx={{ fontSize: 20 }} /></IconButton></InputAdornment> } }} />
          <Button type="submit" variant="contained" size="large" disabled={saving} fullWidth
            endIcon={saving ? <CircularProgress color="inherit" size={18} /> : <AppIcon name="arrow" />} sx={{ mt: 1, py: 1.6 }}>
            {saving ? 'Signing in…' : 'Sign in'}
          </Button>
        </Box>
        <Typography color="text.secondary" sx={{ fontSize: 13, mt: 3.5, textAlign: 'center' }}>Need access? Contact your administrator.</Typography>
      </Box>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 8 }}>Access is limited to authorized HR staff.</Typography>
    </Box>
  </Box>;
}
