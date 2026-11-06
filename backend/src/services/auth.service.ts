import type { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { hashPassword, verifyPassword } from '../lib/password';
import { signToken } from '../lib/tokens';
import { AppError } from '../lib/errors';
import { mapDatabaseError } from '../lib/db-errors';
import { publicUserSelect, toPublicUser } from './user-view';

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
  role: Role;
  timezone: string;
  title?: string;
  bio?: string;
  focusAreas?: string;
}) {
  try {
    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash: await hashPassword(input.password),
        role: input.role,
        timezone: input.timezone,
        title: input.role === 'PROFESSIONAL' ? input.title : null,
        bio: input.role === 'PROFESSIONAL' ? input.bio : null,
        focusAreas: input.role === 'PROFESSIONAL' ? input.focusAreas ?? null : null,
      },
      select: { ...publicUserSelect, sessionVersion: true },
    });
    const token = signToken({ sub: user.id, role: user.role, sv: user.sessionVersion });
    return { token, user: toPublicUser(user) };
  } catch (error) {
    const mapped = mapDatabaseError(error);
    if (mapped) throw mapped;
    throw error;
  }
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !valid) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }
  const token = signToken({ sub: user.id, role: user.role, sv: user.sessionVersion });
  return { token, user: toPublicUser(user) };
}

export async function logoutUser(userId: string | undefined) {
  if (!userId) return;
  await prisma.user.updateMany({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
  });
}

export async function updateProfile(
  userId: string,
  input: {
    name: string;
    timezone: string;
    title?: string | null;
    bio?: string | null;
    focusAreas?: string | null;
  },
) {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) throw new AppError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      name: input.name,
      timezone: input.timezone,
      title: existing.role === 'PROFESSIONAL' ? input.title ?? existing.title : null,
      bio: existing.role === 'PROFESSIONAL' ? input.bio ?? existing.bio : null,
      focusAreas: existing.role === 'PROFESSIONAL' ? input.focusAreas ?? existing.focusAreas : null,
    },
    select: publicUserSelect,
  });
  return toPublicUser(user);
}
