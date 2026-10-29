import { Box, Typography } from '@mui/material';

export default function Brand({ light = false }) {
  return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: light ? '#fff' : 'text.primary' }}>
    <Box aria-hidden="true" sx={{ width: 36, height: 36, borderRadius: '11px', bgcolor: light ? '#ffffff18' : 'primary.main',
      display: 'grid', placeItems: 'center', color: '#fff', fontSize: 25, fontWeight: 750 }}>a</Box>
    <Typography sx={{ fontSize: 28, letterSpacing: '-1.5px', fontWeight: 750, lineHeight: 1 }}>acme<span style={{ color: '#8abf9b' }}>.</span></Typography>
  </Box>;
}
