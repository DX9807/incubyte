import { Box, Chip, Paper, Typography } from '@mui/material';
import AppIcon from '../components/AppIcon';

export default function WorkspacePlaceholder({ section, icon, description }) {
  return <>
    <Typography className="eyebrow" color="text.secondary" sx={{ mb: 1.5 }}>YOUR WORKSPACE</Typography>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
      <Typography component="h1" variant="h3">{section}</Typography>
      <Chip label="Coming soon" size="small" sx={{ bgcolor: '#eaf0e8', color: 'primary.dark', fontSize: 11 }} />
    </Box>
    <Typography color="text.secondary" sx={{ mb: 5 }}>{description}</Typography>
    <Paper variant="outlined" sx={{ minHeight: 390, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4, borderRadius: 3 }}>
      <Box sx={{ textAlign: 'center', maxWidth: 390 }}>
        <Box sx={{ width: 76, height: 76, display: 'grid', placeItems: 'center', bgcolor: 'primary.light', color: 'primary.main', borderRadius: '24px', mx: 'auto', mb: 3 }}><AppIcon name={icon} sx={{ fontSize: 32 }} /></Box>
        <Typography component="h2" variant="h5" sx={{ mb: 1.5 }}>{section === 'Dashboard' ? 'A little more clarity is on its way.' : 'A place for your people.'}</Typography>
        <Typography color="text.secondary" sx={{ lineHeight: 1.8 }}>{section === 'Dashboard' ? 'Your compensation overview will be available here soon.' : 'Employee management will be available here soon.'}</Typography>
      </Box>
    </Paper>
  </>;
}
