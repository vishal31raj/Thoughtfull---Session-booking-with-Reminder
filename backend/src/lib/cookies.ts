import type { Response } from 'express';
import { config } from '../config';

export const SESSION_COOKIE = 'tf_session';
export const CSRF_COOKIE = 'tf_csrf';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function baseOptions() {
  return {
    sameSite: 'lax' as const,
    secure: config.cookieSecure,
    path: '/',
  };
}

export function setSessionCookie(res: Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    ...baseOptions(),
    httpOnly: true,
    maxAge: SEVEN_DAYS_MS,
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, { ...baseOptions(), httpOnly: true });
}

export function setCsrfCookie(res: Response, token: string) {
  res.cookie(CSRF_COOKIE, token, {
    ...baseOptions(),
    httpOnly: false,
  });
}
