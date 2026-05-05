import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const appVersion = process.env.APP_VERSION || process.env.npm_package_version || '0.0.0';
const devHost = process.env.VITE_HOST || '0.0.0.0';
const devPort = Number(process.env.VITE_PORT) || 5173;
const apiTarget = process.env.VITE_API_TARGET || 'http://127.0.0.1:4287';

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    host: devHost,
    port: devPort,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/uploads': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
