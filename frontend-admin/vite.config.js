import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // In production Docker build VITE_BASE is set to /admin/ so assets resolve
  // correctly when the SPA is served under /admin by the FastAPI backend.
  // During local development this defaults to / so the dev server works normally.
  base: process.env.VITE_BASE || '/',
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
