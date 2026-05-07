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
  base: '/',
  // 使用相对路径，Pages 会通过 _redirects 转发
  define: {
    'import.meta.env.PUBLIC_API_URL': JSON.stringify('')
  }
});