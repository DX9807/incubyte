import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material';
import { AuthProvider } from './auth/AuthContext';
import App from './App';
import './styles.css';

const theme = createTheme({
  palette: {
    primary: { main: '#286549', dark: '#183b30', light: '#eaf1e9', contrastText: '#ffffff' },
    background: { default: '#f5f6f3', paper: '#ffffff' },
    text: { primary: '#20362d', secondary: '#6c786f' },
    divider: '#e5e9e3',
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
    h3: { fontSize: '2.15rem', fontWeight: 650, letterSpacing: '-1.1px' },
    h5: { fontSize: '1.2rem', fontWeight: 600, letterSpacing: '-0.3px' },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiButton: { styleOverrides: { root: { boxShadow: 'none', padding: '11px 20px', '&:hover': { boxShadow: 'none' } } } },
    MuiOutlinedInput: { styleOverrides: { root: { backgroundColor: '#fff' } } },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><ThemeProvider theme={theme}><CssBaseline /><BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter></ThemeProvider></React.StrictMode>,
);
