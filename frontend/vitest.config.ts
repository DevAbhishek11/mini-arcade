import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Frontend unit tests run in a DOM environment because the offline game
 * runner leans on requestAnimationFrame, timers and localStorage.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Only Vite provides this module; tests get an inert stand-in.
      'virtual:pwa-register/react': fileURLToPath(new URL('./tests/stubs/pwa-register.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['./tests/setup.ts'],
    restoreMocks: true,
  },
});
