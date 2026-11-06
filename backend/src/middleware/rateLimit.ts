import rateLimit from 'express-rate-limit';
import { config } from '../config';

export function createAuthRateLimiter(max = config.authRateLimitMax, windowMs = config.authRateLimitWindowMs) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many attempts. Please wait and try again.',
      },
    },
  });
}

export const authRateLimiter = createAuthRateLimiter();
