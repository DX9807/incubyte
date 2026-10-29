import { SvgIcon } from '@mui/material';

const paths = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  employees: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2" /></>,
  logout: <><path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5M9 12h12m-4-4 4 4-4 4" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="m3 3 18 18M10 5c6-1 12 7 12 7a24 24 0 0 1-4 4M6 6a24 24 0 0 0-4 6s4 7 10 7a12 12 0 0 0 5-1" /><path d="M10 10a3 3 0 0 0 4 4" /></>,
};

export default function AppIcon({ name, ...props }) {
  return <SvgIcon {...props} sx={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.65,
    strokeLinecap: 'round', strokeLinejoin: 'round', ...props.sx }}>{paths[name]}</SvgIcon>;
}
