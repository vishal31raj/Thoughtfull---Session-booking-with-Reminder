import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { AppError } from '../lib/errors';
import { prisma } from '../lib/prisma';
import { verifyToken } from '../lib/tokens';
import { SESSION_COOKIE } from '../lib/cookies';
import type { AuthUser } from '../types/express';

export function toAuthUser(user: {
  id: string;
  role: Role;
  email: string;
  name: string;
  timezone: string;
  title: string | null;
  bio: string | null;
  focusAreas: string | null;
  sessionVersion: number;
}): AuthUser {
  return {
    id: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
    timezone: user.timezone,
    title: user.title,
    bio: user.bio,
    focusAreas: user.focusAreas,
    sessionVersion: user.sessionVersion,
  };
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token || typeof token !== 'string') {
      throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    }
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.sessionVersion !== payload.sv || user.role !== payload.role) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Your session has ended. Sign in again.');
    }
    req.authUser = toAuthUser(user);
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }
    next(new AppError(401, 'UNAUTHENTICATED', 'Your session has ended. Sign in again.'));
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.authUser) {
      next(new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.'));
      return;
    }
    if (!roles.includes(req.authUser.role)) {
      next(new AppError(403, 'FORBIDDEN', 'You do not have access to this action.'));
      return;
    }
    next();
  };
}
