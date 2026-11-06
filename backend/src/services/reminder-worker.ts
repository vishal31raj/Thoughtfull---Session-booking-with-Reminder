import { config } from '../config';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { reminderMessage } from '../domain/reminders';

/**
 * Persistent reminder worker.
 * Due work lives in PostgreSQL. Claiming uses SELECT ... FOR UPDATE SKIP LOCKED
 * so two workers cannot take the same row. Notification insert is idempotent on reminder_id.
 */
export async function processDueReminders(now = new Date()): Promise<number> {
  await recoverStaleReminders(now);
  const claimed = await claimDueReminders(now);
  for (const reminderId of claimed) {
    await deliverReminder(reminderId, now);
  }
  return claimed.length;
}

async function recoverStaleReminders(now: Date) {
  const staleBefore = new Date(now.getTime() - config.workerLockTimeoutMs);
  await prisma.$executeRaw`
    UPDATE reminders AS r
    SET status = 'DELIVERED',
        delivered_at = COALESCE(r.delivered_at, ${now}),
        locked_at = NULL,
        updated_at = ${now}
    WHERE r.status::text = 'PROCESSING'
      AND EXISTS (SELECT 1 FROM notifications n WHERE n.reminder_id = r.id)
  `;
  await prisma.$executeRaw`
    UPDATE reminders
    SET status = 'PENDING',
        locked_at = NULL,
        updated_at = ${now}
    WHERE status::text = 'PROCESSING'
      AND locked_at IS NOT NULL
      AND locked_at < ${staleBefore}
      AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.reminder_id = reminders.id)
  `;
}

async function claimDueReminders(now: Date): Promise<string[]> {
  const limit = Math.min(Math.max(config.workerBatchSize, 1), 100);
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id
       FROM reminders
       WHERE status::text = 'PENDING'
         AND scheduled_at <= $1
       ORDER BY scheduled_at ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
      now,
      limit,
    );
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    await tx.reminder.updateMany({
      where: { id: { in: ids }, status: 'PENDING' },
      data: { status: 'PROCESSING', lockedAt: now, attempts: { increment: 1 } },
    });
    return ids;
  });
}

export async function deliverReminder(reminderId: string, now = new Date()): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const sessionLock = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT s.id
        FROM sessions s
        WHERE s.id = (SELECT session_id FROM reminders WHERE id = CAST(${reminderId} AS uuid))
        FOR UPDATE
      `;
      if (sessionLock.length === 0) {
        await tx.reminder.update({
          where: { id: reminderId },
          data: { status: 'CANCELLED', lockedAt: null },
        });
        return;
      }
      await tx.$queryRaw`
        SELECT id FROM reminders WHERE id = CAST(${reminderId} AS uuid) FOR UPDATE
      `;

      const reminder = await tx.reminder.findUnique({
        where: { id: reminderId },
        include: {
          recipient: true,
          session: { include: { member: true, professional: true } },
        },
      });
      if (!reminder || reminder.status === 'CANCELLED' || reminder.status === 'DELIVERED' || reminder.status === 'FAILED') {
        return;
      }
      if (reminder.session.status !== 'BOOKED') {
        await tx.reminder.update({
          where: { id: reminder.id },
          data: { status: 'CANCELLED', lockedAt: null },
        });
        return;
      }

      const otherParty =
        reminder.recipientId === reminder.session.memberId ? reminder.session.professional : reminder.session.member;
      const message = reminderMessage({
        type: reminder.type,
        otherPartyName: otherParty.name,
        startAt: reminder.session.startAt,
        recipientTimezone: reminder.recipient.timezone,
      });

      await tx.$executeRaw`
        INSERT INTO notifications (id, user_id, reminder_id, message, created_at)
        VALUES (
          gen_random_uuid(),
          CAST(${reminder.recipientId} AS uuid),
          CAST(${reminder.id} AS uuid),
          ${message},
          ${now}
        )
        ON CONFLICT (reminder_id) DO NOTHING
      `;
      await tx.reminder.update({
        where: { id: reminder.id },
        data: { status: 'DELIVERED', deliveredAt: now, lockedAt: null, lastError: null },
      });
    });
  } catch (error) {
    logger.error('reminder delivery failed', { reminderId });
    const current = await prisma.reminder.findUnique({ where: { id: reminderId } });
    if (!current || current.status === 'DELIVERED' || current.status === 'CANCELLED') return;
    const exhausted = current.attempts >= config.workerMaxAttempts;
    await prisma.reminder.update({
      where: { id: reminderId },
      data: {
        status: exhausted ? 'FAILED' : 'PENDING',
        lockedAt: null,
        lastError: error instanceof Error ? error.name : 'delivery failed',
      },
    });
  }
}
