import { defineConfig, devices } from '@playwright/test';

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgresql://thoughtfull:thoughtfull@localhost:5432/thoughtfull_test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npx prisma migrate deploy && npm run dev:serve',
      cwd: '../backend',
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: databaseUrl,
        JWT_SECRET: 'e2e-secret-not-for-production',
        NODE_ENV: 'development',
        CORS_ORIGIN: 'http://localhost:5173',
        COOKIE_SECURE: 'false',
        BCRYPT_ROUNDS: '4',
        PORT: '4000',
      },
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
