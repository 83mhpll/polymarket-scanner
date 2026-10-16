import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // Rewrite /api/opportunities -> /api/scan while supporting query params & preserving other /api routes
        rewrite: (path) => path.replace(/^\/api\/opportunities(?:\/|(?=[?#]|$))/, '/api/scan'),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    emptyOutDir: true,
  },
});
