import { z } from 'zod';
import { isValidIanaTimeZone } from '../domain/time';

const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(255).transform((value) => value.toLowerCase()),
    password: z.string().min(8).max(72),
    role: z.enum(['MEMBER', 'PROFESSIONAL']),
    timezone: z.string().trim().refine(isValidIanaTimeZone, 'Use an IANA timezone such as Asia/Kolkata.'),
    title: z.string().trim().min(2).max(120).optional(),
    bio: z.string().trim().min(20).max(2000).optional(),
    focusAreas: z.string().trim().max(200).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role !== 'PROFESSIONAL') return;
    if (!value.title) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['title'], message: 'Professionals need a title.' });
    }
    if (!value.bio) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['bio'], message: 'Professionals need a short bio.' });
    }
  });

export const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(72),
});

export const profileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  timezone: z.string().trim().refine(isValidIanaTimeZone, 'Use an IANA timezone such as Asia/Kolkata.'),
  title: z.string().trim().min(2).max(120).nullable().optional(),
  bio: z.string().trim().min(20).max(2000).nullable().optional(),
  focusAreas: z.string().trim().max(200).nullable().optional(),
});

export const availabilitySchema = z.object({
  windows: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(1).max(7),
        startTime: z.string().regex(timePattern, 'Use HH:mm.'),
        endTime: z.string().regex(timePattern, 'Use HH:mm.'),
        enabled: z.boolean(),
      }),
    )
    .max(21),
}).superRefine((value, ctx) => {
  for (const window of value.windows) {
    if (window.endTime <= window.startTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['windows'],
        message: 'End time must be later than start time.',
      });
    }
  }
});

export const bookSessionSchema = z.object({
  professionalId: z.string().uuid(),
  startAt: z.string().datetime({ offset: true }),
});

export const rescheduleSchema = z.object({
  startAt: z.string().datetime({ offset: true }),
});

export function parsePage(
  query: Record<string, unknown>,
): { error: string } | { page: number; pageSize: number } {
  const page = Number(query.page ?? 1);
  const pageSize = Number(query.pageSize ?? 20);
  if (!Number.isInteger(page) || page < 1) {
    return { error: 'page must be a positive integer' as const };
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    return { error: 'pageSize must be between 1 and 50' as const };
  }
  return { page, pageSize };
}
