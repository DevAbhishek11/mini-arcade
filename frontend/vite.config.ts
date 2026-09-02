import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const API_TARGET = process.env.VITE_API_PROXY ?? 'http://127.0.0.1:4000';

/** Same wiring for `vite dev` and `vite preview`: the API is same-origin. */
const proxy = {
  '/api': { target: API_TARGET, changeOrigin: true },
  '/metrics': { target: API_TARGET, changeOrigin: true },
  '/realtime': { target: API_TARGET, ws: true, changeOrigin: true },
};

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Installable app + offline play. Solo mode runs the shared engines in the
    // browser, so a precached shell is genuinely playable with no connection.
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'og-image.jpg', 'icons/*.png', 'art/*.webp'],
      manifest: {
        id: '/',
        name: 'Mini Arcade — realtime multiplayer games',
        short_name: 'Mini Arcade',
        description:
          'Seven classic games with realtime multiplayer, private rooms, bots and an offline single player mode.',
        theme_color: '#05060c',
        background_color: '#05060c',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        categories: ['games', 'entertainment'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Play offline', short_name: 'Solo', url: '/solo/tic-tac-toe' },
          { name: 'Leaderboard', short_name: 'Ladder', url: '/leaderboard' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        // Never hijack the API or the websocket upgrade.
        navigateFallbackDenylist: [/^\/api/, /^\/realtime/, /^\/metrics/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/api/games') || url.pathname.startsWith('/api/progress/catalog'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'arcade-catalog',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Preview/dev hosts are proxied, so accept any Host header.
    allowedHosts: true,
    proxy,
  },
  preview: { host: true, port: 4173, allowedHosts: true, proxy },
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
