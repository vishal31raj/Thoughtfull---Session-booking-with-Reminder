import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 1,
    globalSetup: './tests/global-setup.ts',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgresql://thoughtfull:thoughtfull@localhost:5432/thoughtfull_test',
      JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-chars',
      JWT_EXPIRES_IN: '7d',
      CORS_ORIGIN: 'http://localhost:5173',
      COOKIE_SECURE: 'false',
      SEED_ON_START: 'false',
      BCRYPT_ROUNDS: '4',
      SESSION_DURATION_MINUTES: '50',
      SLOT_INTERVAL_MINUTES: '60',
      AUTH_RATE_LIMIT_WINDOW_MS: '900000',
      AUTH_RATE_LIMIT_MAX: '10000',
      WORKER_POLL_MS: '5000',
      WORKER_BATCH_SIZE: '20',
      WORKER_LOCK_TIMEOUT_MS: '120000',
      WORKER_MAX_ATTEMPTS: '5',
    },
  },
});
