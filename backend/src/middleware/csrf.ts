import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config';
import { CSRF_COOKIE, setCsrfCookie } from '../lib/cookies';
import { AppError } from '../lib/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function tokensMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function issueCsrf(req: Request, res: Response, next: NextFunction) {
  const existing = req.cookies?.[CSRF_COOKIE];
  if (typeof existing === 'string' && existing.length >= 32) {
    next();
    return;
  }
  const token = randomBytes(32).toString('hex');
  setCsrfCookie(res, token);
  req.cookies[CSRF_COOKIE] = token;
  next();
}

export function requireCsrf(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  const origin = req.get('origin');
  if (origin && !config.corsOrigins.includes(origin)) {
    next(new AppError(403, 'CSRF', 'This request origin is not allowed.'));
    return;
  }
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.get('x-csrf-token');
  if (typeof cookie !== 'string' || typeof header !== 'string' || !tokensMatch(cookie, header)) {
    next(new AppError(403, 'CSRF', 'Missing or invalid CSRF token.'));
    return;
  }
  next();
}
