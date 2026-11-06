import { Prisma } from '@prisma/client';
import { AppError } from './errors';

function errorText(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const record = current as { message?: unknown; code?: unknown; meta?: unknown; cause?: unknown };
    if (typeof record.message === 'string') parts.push(record.message);
    if (typeof record.code === 'string') parts.push(record.code);
    if (record.meta !== undefined) parts.push(JSON.stringify(record.meta));
    current = record.cause;
  }
  return parts.join(' ');
}

export function mapDatabaseError(error: unknown): AppError | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const target = JSON.stringify(error.meta?.target ?? '');
      if (target.includes('email')) {
        return new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
      }
      return new AppError(409, 'CONFLICT', 'That record already exists.');
    }
    if (error.code === 'P2025') {
      return new AppError(404, 'NOT_FOUND', 'Record not found.');
    }
  }

  const text = errorText(error);

  if (text.includes('sessions_member_no_overlap')) {
    return new AppError(409, 'MEMBER_OVERLAP', 'You already have a session that overlaps this time.');
  }
  if (text.includes('sessions_professional_no_overlap')) {
    return new AppError(409, 'PROFESSIONAL_OVERLAP', 'That time was just booked with this professional.');
  }
  if (text.includes('23P01') || text.includes('exclusion constraint')) {
    return new AppError(409, 'SLOT_UNAVAILABLE', 'That time slot is no longer available.');
  }
  if (text.includes('availability_no_overlap') || text.includes('OVERLAPPING_AVAILABILITY')) {
    return new AppError(400, 'OVERLAPPING_AVAILABILITY', 'Working periods on the same weekday cannot overlap.');
  }
  return null;
}
