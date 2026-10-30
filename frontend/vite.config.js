import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'ACME_');
  const proxy = {
    '/api': {
      target: process.env.ACME_API_PROXY_TARGET || env.ACME_API_PROXY_TARGET || 'http://127.0.0.1:9000',
      // Keep the browser's Host/Origin pair intact for Django CSRF checks.
      changeOrigin: false,
    },
  };
  return {
    plugins: [react()],
    server: { port: 5173, strictPort: true, proxy },
    preview: { port: 4173, strictPort: true, proxy },
    build: {
      outDir: 'dist',
      rollupOptions: { output: { manualChunks: {
        react: ['react', 'react-dom', 'react-router-dom'],
        mui: ['@mui/material', '@emotion/react', '@emotion/styled'],
      } } },
    },
  };
});