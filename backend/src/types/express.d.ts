import type { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  role: Role;
  email: string;
  name: string;
  timezone: string;
  title: string | null;
  bio: string | null;
  focusAreas: string | null;
  sessionVersion: number;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

export {};
