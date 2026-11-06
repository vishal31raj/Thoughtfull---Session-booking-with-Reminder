import type { SessionStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError, findAppError } from '../lib/errors';
import { mapDatabaseError } from '../lib/db-errors';
import { schedulingConfig } from '../config';
import { clock } from '../lib/clock';
import { assertBookableSlot } from '../domain/scheduling';
import { buildReminderDrafts } from '../domain/reminders';
import { canChangeAtLeast24HoursBefore } from '../domain/time';
import type { AuthUser } from '../types/express';

const sessionInclude = {
  member: { select: { id: true, name: true } },
  professional: { select: { id: true, name: true, title: true } },
} as const;

type SessionRecord = {
  id: string;
  memberId: string;
  professionalId: string;
  startAt: Date;
  endAt: Date;
  status: SessionStatus;
  cancelledAt: Date | null;
  createdAt: Date;
  member: { id: string; name: string };
  professional: { id: string; name: string; title: string | null };
};

function displayStatus(session: { status: SessionStatus; endAt: Date }, now: Date) {
  if (session.status === 'CANCELLED') return 'cancelled' as const;
  if (session.endAt.getTime() <= now.getTime()) return 'past' as const;
  return 'upcoming' as const;
}

function permissions(session: SessionRecord, viewer: AuthUser, now: Date) {
  if (session.status !== 'BOOKED') {
    return {
      cancel: false,
      reschedule: false,
      cancelBlockedReason: 'This session is no longer booked.',
    };
  }
  if (viewer.role === 'PROFESSIONAL' && viewer.id === session.professionalId) {
    return { cancel: true, reschedule: false, cancelBlockedReason: null };
  }
  if (viewer.role === 'MEMBER' && viewer.id === session.memberId) {
    const allowed = canChangeAtLeast24HoursBefore(session.startAt, now);
    return {
      cancel: allowed,
      reschedule: allowed,
      cancelBlockedReason: allowed
        ? null
        : 'Sessions can only be cancelled or rescheduled until 24 hours before the start time.',
    };
  }
  return { cancel: false, reschedule: false, cancelBlockedReason: null };
}

export function toSessionDto(session: SessionRecord, viewer: AuthUser, now = clock.now()) {
  const schedule = schedulingConfig();
  return {
    id: session.id,
    startAt: session.startAt.toISOString(),
    endAt: session.endAt.toISOString(),
    durationMinutes: schedule.sessionDurationMinutes,
    status: session.status,
    displayStatus: displayStatus(session, now),
    member: session.member,
    professional: session.professional,
    cancelledAt: session.cancelledAt?.toISOString() ?? null,
    createdAt: session.createdAt.toISOString(),
    permissions: permissions(session, viewer, now),
  };
}

async function loadSession(id: string) {
  return prisma.session.findUnique({ where: { id }, include: sessionInclude });
}

function assertParticipant(session: { memberId: string; professionalId: string }, userId: string) {
  if (session.memberId !== userId && session.professionalId !== userId) {
    throw new AppError(404, 'NOT_FOUND', 'Session not found.');
  }
}

export async function bookSession(input: { memberId: string; professionalId: string; startAt: Date; now?: Date }) {
  const now = input.now ?? clock.now();
  const professional = await prisma.user.findFirst({
    where: { id: input.professionalId, role: 'PROFESSIONAL' },
    include: { availability: true },
  });
  if (!professional) throw new AppError(404, 'NOT_FOUND', 'Professional not found.');

  const endAt = assertBookableSlot({
    timezone: professional.timezone,
    windows: professional.availability,
    startAt: input.startAt,
    now,
    config: schedulingConfig(),
  });

  try {
    const created = await prisma.$transaction(async (tx) => {
      const session = await tx.session.create({
        data: {
          memberId: input.memberId,
          professionalId: professional.id,
          startAt: input.startAt,
          endAt,
          status: 'BOOKED',
        },
      });
      const drafts = buildReminderDrafts({
        sessionId: session.id,
        memberId: session.memberId,
        professionalId: session.professionalId,
        startAt: session.startAt,
        now,
      });
      if (drafts.length > 0) {
        await tx.reminder.createMany({ data: drafts });
      }
      return session.id;
    });
    return created;
  } catch (error) {
    const appError = findAppError(error);
    if (appError) throw appError;
    const mapped = mapDatabaseError(error);
    if (mapped) throw mapped;
    throw error;
  }
}

export async function getSessionForUser(sessionId: string, viewer: AuthUser, now = clock.now()) {
  const session = await loadSession(sessionId);
  if (!session) throw new AppError(404, 'NOT_FOUND', 'Session not found.');
  assertParticipant(session, viewer.id);
  return toSessionDto(session, viewer, now);
}

export async function listMySessions(input: {
  viewer: AuthUser;
  view?: 'upcoming' | 'past' | 'cancelled';
  page: number;
  pageSize: number;
  now?: Date;
}) {
  const now = input.now ?? clock.now();
  const participant =
    input.viewer.role === 'PROFESSIONAL'
      ? { professionalId: input.viewer.id }
      : { memberId: input.viewer.id };

  const view = input.view;
  const where = {
    ...participant,
    ...(view === 'cancelled'
      ? { status: 'CANCELLED' as const }
      : view === 'past'
        ? { status: 'BOOKED' as const, endAt: { lte: now } }
        : view === 'upcoming'
          ? { status: 'BOOKED' as const, endAt: { gt: now } }
          : {}),
  };
  const orderBy =
    view === 'upcoming'
      ? ({ startAt: 'asc' } as const)
      : view === 'past'
        ? ({ startAt: 'desc' } as const)
        : ({ updatedAt: 'desc' } as const);

  const [total, rows] = await prisma.$transaction([
    prisma.session.count({ where }),
    prisma.session.findMany({
      where,
      include: sessionInclude,
      orderBy,
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
  ]);

  return {
    total,
    sessions: rows.map((row) => toSessionDto(row, input.viewer, now)),
  };
}

export async function cancelSession(input: { sessionId: string; viewer: AuthUser; now?: Date }) {
  const now = input.now ?? clock.now();
  try {
    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM sessions WHERE id = CAST(${input.sessionId} AS uuid) FOR UPDATE
      `;
      if (locked.length === 0) throw new AppError(404, 'NOT_FOUND', 'Session not found.');
      const session = await tx.session.findUnique({ where: { id: input.sessionId } });
      if (!session) throw new AppError(404, 'NOT_FOUND', 'Session not found.');

      const isMember = input.viewer.role === 'MEMBER' && session.memberId === input.viewer.id;
      const isProfessional = input.viewer.role === 'PROFESSIONAL' && session.professionalId === input.viewer.id;
      if (!isMember && !isProfessional) throw new AppError(404, 'NOT_FOUND', 'Session not found.');
      if (session.status !== 'BOOKED') {
        throw new AppError(409, 'NOT_BOOKED', 'This session is already cancelled.');
      }
      if (isMember && !canChangeAtLeast24HoursBefore(session.startAt, now)) {
        throw new AppError(
          403,
          'TOO_LATE',
          'Sessions can only be cancelled until 24 hours before the start time. This session is inside that window.',
        );
      }

      await tx.session.update({
        where: { id: session.id },
        data: { status: 'CANCELLED', cancelledAt: now, cancelledById: input.viewer.id },
      });
      await tx.reminder.updateMany({
        where: { sessionId: session.id, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'CANCELLED', lockedAt: null },
      });
    });
  } catch (error) {
    const appError = findAppError(error);
    if (appError) throw appError;
    const mapped = mapDatabaseError(error);
    if (mapped) throw mapped;
    throw error;
  }
  return getSessionForUser(input.sessionId, input.viewer, now);
}

export async function rescheduleSession(input: { sessionId: string; memberId: string; startAt: Date; now?: Date }) {
  const now = input.now ?? clock.now();
  try {
    await prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM sessions WHERE id = CAST(${input.sessionId} AS uuid) FOR UPDATE
        `;
        if (locked.length === 0) throw new AppError(404, 'NOT_FOUND', 'Session not found.');
        const session = await tx.session.findUnique({ where: { id: input.sessionId } });
        if (!session || session.memberId !== input.memberId) {
          throw new AppError(404, 'NOT_FOUND', 'Session not found.');
        }
        if (session.status !== 'BOOKED') {
          throw new AppError(409, 'NOT_BOOKED', 'Only booked sessions can be rescheduled.');
        }
        if (!canChangeAtLeast24HoursBefore(session.startAt, now)) {
          throw new AppError(
            403,
            'TOO_LATE',
            'Sessions can only be rescheduled until 24 hours before the start time.',
          );
        }
        if (session.startAt.getTime() === input.startAt.getTime()) {
          throw new AppError(400, 'SAME_SLOT', 'Choose a different time.');
        }

        const professional = await tx.user.findFirst({
          where: { id: session.professionalId, role: 'PROFESSIONAL' },
          include: { availability: true },
        });
        if (!professional) throw new AppError(404, 'NOT_FOUND', 'Professional not found.');

        const endAt = assertBookableSlot({
          timezone: professional.timezone,
          windows: professional.availability,
          startAt: input.startAt,
          now,
          config: schedulingConfig(),
        });

        await tx.session.update({
          where: { id: session.id },
          data: { startAt: input.startAt, endAt },
        });
        await tx.reminder.updateMany({
          where: { sessionId: session.id, status: { in: ['PENDING', 'PROCESSING'] } },
          data: { status: 'CANCELLED', lockedAt: null },
        });
        const drafts = buildReminderDrafts({
          sessionId: session.id,
          memberId: session.memberId,
          professionalId: session.professionalId,
          startAt: input.startAt,
          now,
        });
        if (drafts.length > 0) {
          await tx.reminder.createMany({ data: drafts });
        }
      },
      { timeout: 15_000 },
    );
  } catch (error) {
    const appError = findAppError(error);
    if (appError) throw appError;
    const mapped = mapDatabaseError(error);
    if (mapped) throw mapped;
    throw error;
  }
}

export async function countReminders(sessionId: string) {
  return prisma.reminder.groupBy({
    by: ['status'],
    where: { sessionId },
    _count: { _all: true },
  });
}
