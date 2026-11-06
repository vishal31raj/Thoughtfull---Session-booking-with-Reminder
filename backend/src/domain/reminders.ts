import { DateTime } from 'luxon';
import type { ReminderType } from '@prisma/client';
import { shortName } from './time';

export interface ReminderDraft {
  sessionId: string;
  recipientId: string;
  type: ReminderType;
  scheduledAt: Date;
  status: 'PENDING';
}

const OFFSETS: Array<{ type: ReminderType; ms: number }> = [
  { type: 'HOURS_24', ms: 24 * 60 * 60 * 1000 },
  { type: 'HOUR_1', ms: 60 * 60 * 1000 },
];

export function buildReminderDrafts(input: {
  sessionId: string;
  memberId: string;
  professionalId: string;
  startAt: Date;
  now: Date;
}): ReminderDraft[] {
  const drafts: ReminderDraft[] = [];
  for (const offset of OFFSETS) {
    const scheduledAt = new Date(input.startAt.getTime() - offset.ms);
    if (scheduledAt.getTime() < input.now.getTime()) continue;
    for (const recipientId of [input.memberId, input.professionalId]) {
      drafts.push({
        sessionId: input.sessionId,
        recipientId,
        type: offset.type,
        scheduledAt,
        status: 'PENDING',
      });
    }
  }
  return drafts;
}

export function reminderMessage(input: {
  type: ReminderType;
  otherPartyName: string;
  startAt: Date;
  recipientTimezone: string;
}): string {
  const local = DateTime.fromJSDate(input.startAt, { zone: 'utc' }).setZone(input.recipientTimezone);
  const hour12 = local.hour % 12 === 0 ? 12 : local.hour % 12;
  const minute = String(local.minute).padStart(2, '0');
  const time = `${hour12}:${minute} ${local.hour < 12 ? 'AM' : 'PM'}`;
  const who = shortName(input.otherPartyName);
  if (input.type === 'HOURS_24') {
    return `Your session with ${who} is tomorrow at ${time}.`;
  }
  return `Your session with ${who} starts in one hour.`;
}
