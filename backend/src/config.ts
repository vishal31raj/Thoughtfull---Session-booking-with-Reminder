import dotenv from 'dotenv';

dotenv.config();

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isTest = nodeEnv === 'test';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

export const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest,
  port: intEnv('PORT', 4000),
  databaseUrl: required(
    'DATABASE_URL',
    isTest ? 'postgresql://thoughtfull:thoughtfull@localhost:5432/thoughtfull_test' : undefined,
  ),
  jwtSecret: required('JWT_SECRET', isTest ? 'test-jwt-secret-that-is-at-least-32-chars' : undefined),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  sessionDurationMinutes: intEnv('SESSION_DURATION_MINUTES', 50),
  slotIntervalMinutes: intEnv('SLOT_INTERVAL_MINUTES', 60),
  authRateLimitWindowMs: intEnv('AUTH_RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
  authRateLimitMax: intEnv('AUTH_RATE_LIMIT_MAX', isTest ? 10_000 : 20),
  workerPollMs: intEnv('WORKER_POLL_MS', 5_000),
  workerBatchSize: intEnv('WORKER_BATCH_SIZE', 20),
  workerLockTimeoutMs: intEnv('WORKER_LOCK_TIMEOUT_MS', 120_000),
  workerMaxAttempts: intEnv('WORKER_MAX_ATTEMPTS', 5),
  bcryptRounds: intEnv('BCRYPT_ROUNDS', isTest ? 4 : 12),
  seedOnStart: process.env.SEED_ON_START === 'true',
  cancellationWindowMs: 24 * 60 * 60 * 1000,
};

if (config.jwtSecret.length < 16) {
  throw new Error('JWT_SECRET must be at least 16 characters');
}
if (config.sessionDurationMinutes <= 0 || config.slotIntervalMinutes <= 0) {
  throw new Error('Session duration and slot interval must be positive');
}
if (config.sessionDurationMinutes > config.slotIntervalMinutes) {
  throw new Error('SESSION_DURATION_MINUTES cannot exceed SLOT_INTERVAL_MINUTES');
}

export function schedulingConfig() {
  return {
    sessionDurationMinutes: config.sessionDurationMinutes,
    slotIntervalMinutes: config.slotIntervalMinutes,
  };
}
