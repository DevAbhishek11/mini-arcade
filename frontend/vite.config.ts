import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_TARGET = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Preview/dev hosts are proxied, so accept any Host header.
    allowedHosts: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/metrics': { target: API_TARGET, changeOrigin: true },
      '/realtime': { target: API_TARGET, ws: true, changeOrigin: true },
    },
  },
  preview: { host: true, port: 4173, allowedHosts: true },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          realtime: ['socket.io-client'],
        },
      },
    },
  },
});
