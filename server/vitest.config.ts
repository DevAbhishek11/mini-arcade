import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
    pool: 'forks',
    testTimeout: 15_000,
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      JWT_SECRET: 'test-secret-that-is-long-enough',
      CLUSTER_WORKERS: '1',
      BOT_FILL_MS: '0',
      METRICS_ENABLED: 'true',
    },
  },
});
