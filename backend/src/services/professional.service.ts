import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { generateSlots } from '../domain/scheduling';
import { schedulingConfig } from '../config';
import { clock } from '../lib/clock';
import { toAvailabilityDto } from './availability.service';

const MAX_RANGE_MS = 31 * 24 * 60 * 60 * 1000;
const DEFAULT_RANGE_MS = 28 * 24 * 60 * 60 * 1000;

export async function listProfessionals(page: number, pageSize: number, query?: string) {
  const where: Prisma.UserWhereInput = {
    role: 'PROFESSIONAL',
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { title: { contains: query, mode: 'insensitive' } },
            { focusAreas: { contains: query, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { name: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        title: true,
        bio: true,
        focusAreas: true,
        timezone: true,
        availability: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
      },
    }),
  ]);
  return {
    total,
    professionals: rows.map((row) => ({
      id: row.id,
      name: row.name,
      title: row.title,
      bio: row.bio,
      focusAreas: row.focusAreas,
      timezone: row.timezone,
      availability: row.availability.map(toAvailabilityDto),
    })),
  };
}

export async function getProfessional(id: string) {
  const row = await prisma.user.findFirst({
    where: { id, role: 'PROFESSIONAL' },
    select: {
      id: true,
      name: true,
      title: true,
      bio: true,
      focusAreas: true,
      timezone: true,
      availability: { orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
    },
  });
  if (!row) throw new AppError(404, 'NOT_FOUND', 'Professional not found.');
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    bio: row.bio,
    focusAreas: row.focusAreas,
    timezone: row.timezone,
    availability: row.availability.map(toAvailabilityDto),
  };
}

export async function getProfessionalSlots(input: {
  professionalId: string;
  requesterId: string;
  from?: Date;
  to?: Date;
  excludeSessionId?: string;
  now?: Date;
}) {
  const now = input.now ?? clock.now();
  const from = input.from && input.from > now ? input.from : now;
  const to = input.to ?? new Date(now.getTime() + DEFAULT_RANGE_MS);
  if (!(from < to)) {
    throw new AppError(400, 'VALIDATION', 'The end of the range must be after the start.');
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_MS) {
    throw new AppError(400, 'VALIDATION', 'Date range cannot exceed 31 days.');
  }

  const professional = await prisma.user.findFirst({
    where: { id: input.professionalId, role: 'PROFESSIONAL' },
    include: { availability: true },
  });
  if (!professional) throw new AppError(404, 'NOT_FOUND', 'Professional not found.');

  let excludeId: string | undefined;
  if (input.excludeSessionId) {
    const session = await prisma.session.findUnique({ where: { id: input.excludeSessionId } });
    const ownsSession =
      session &&
      session.professionalId === professional.id &&
      (session.memberId === input.requesterId || session.professionalId === input.requesterId);
    if (ownsSession) excludeId = session.id;
  }

  const busy = await prisma.session.findMany({
    where: {
      professionalId: professional.id,
      status: 'BOOKED',
      ...(excludeId ? { id: { not: excludeId } } : {}),
      startAt: { lt: to },
      endAt: { gt: from },
    },
    select: { startAt: true, endAt: true },
  });
  if (input.requesterId !== professional.id) {
    const ownSessions = await prisma.session.findMany({
      where: {
        memberId: input.requesterId,
        status: 'BOOKED',
        ...(excludeId ? { id: { not: excludeId } } : {}),
        startAt: { lt: to },
        endAt: { gt: from },
      },
      select: { startAt: true, endAt: true },
    });
    busy.push(...ownSessions);
  }

  const schedule = schedulingConfig();
  const slots = generateSlots({
    timezone: professional.timezone,
    windows: professional.availability,
    rangeStart: from,
    rangeEnd: to,
    now,
    busy,
    config: schedule,
  });

  return {
    professionalTimezone: professional.timezone,
    durationMinutes: schedule.sessionDurationMinutes,
    intervalMinutes: schedule.slotIntervalMinutes,
    slots: slots.map((slot) => ({
      startAt: slot.startAt.toISOString(),
      endAt: slot.endAt.toISOString(),
      available: slot.available,
    })),
  };
}
