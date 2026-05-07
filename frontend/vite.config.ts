import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3004',
        changeOrigin: true
      }
    }
  },
  // Define environment variables for Cloudflare Pages
  define: {
    'import.meta.env.PUBLIC_API_URL': JSON.stringify(process.env.PUBLIC_API_URL || '')
  }
});