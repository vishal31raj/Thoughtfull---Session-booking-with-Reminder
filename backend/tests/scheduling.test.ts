import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { assertBookableSlot, generateSlots, type AvailabilityWindow } from '../src/domain/scheduling';
import { buildReminderDrafts, reminderMessage } from '../src/domain/reminders';
import { canChangeAtLeast24HoursBefore, isValidIanaTimeZone } from '../src/domain/time';

const config = { sessionDurationMinutes: 50, slotIntervalMinutes: 60 };

function windows(days: number[], startTime: string, endTime: string): AvailabilityWindow[] {
  return days.map((dayOfWeek) => ({ dayOfWeek, startTime, endTime, enabled: true }));
}

describe('slot generation', () => {
  it('creates 50-minute sessions on a 60-minute grid inside working hours', () => {
    const now = new Date('2026-03-01T00:00:00.000Z');
    const slots = generateSlots({
      timezone: 'Asia/Singapore',
      windows: windows([1], '09:00', '12:00'),
      rangeStart: new Date('2026-03-02T00:00:00.000Z'),
      rangeEnd: new Date('2026-03-03T00:00:00.000Z'),
      now,
      busy: [],
      config,
    });
    expect(slots.map((slot) => DateTime.fromJSDate(slot.startAt, { zone: 'utc' }).setZone('Asia/Singapore').toFormat('HH:mm'))).toEqual([
      '09:00',
      '10:00',
      '11:00',
    ]);
    for (const slot of slots) {
      expect(slot.endAt.getTime() - slot.startAt.getTime()).toBe(50 * 60 * 1000);
      expect(slot.available).toBe(true);
    }
  });

  it('excludes past slots and slots that overlap a booking', () => {
    const now = DateTime.fromISO('2026-03-02T02:30:00.000Z').toJSDate();
    const busyStart = DateTime.fromObject({ year: 2026, month: 3, day: 2, hour: 11 }, { zone: 'Asia/Singapore' }).toUTC().toJSDate();
    const slots = generateSlots({
      timezone: 'Asia/Singapore',
      windows: windows([1], '09:00', '12:00'),
      rangeStart: new Date('2026-03-02T00:00:00.000Z'),
      rangeEnd: new Date('2026-03-03T00:00:00.000Z'),
      now,
      busy: [{ startAt: busyStart, endAt: new Date(busyStart.getTime() + 50 * 60 * 1000) }],
      config,
    });
    const labels = slots.map((slot) => DateTime.fromJSDate(slot.startAt).setZone('Asia/Singapore').toFormat('HH:mm'));
    expect(labels).toEqual(['11:00']);
    expect(slots[0].available).toBe(false);
  });

  it('converts the same wall-clock hour to different UTC instants across a US daylight-saving change', () => {
    const winter = DateTime.fromObject({ year: 2026, month: 3, day: 2, hour: 9 }, { zone: 'America/New_York' });
    const summer = DateTime.fromObject({ year: 2026, month: 3, day: 9, hour: 9 }, { zone: 'America/New_York' });
    expect(winter.offset).toBe(-300);
    expect(summer.offset).toBe(-240);

    const slots = generateSlots({
      timezone: 'America/New_York',
      windows: windows([1], '09:00', '10:00'),
      rangeStart: new Date('2026-03-01T00:00:00.000Z'),
      rangeEnd: new Date('2026-03-10T00:00:00.000Z'),
      now: new Date('2026-02-01T00:00:00.000Z'),
      busy: [],
      config,
    });
    const starts = slots.map((slot) => slot.startAt.toISOString());
    expect(starts).toContain(winter.toUTC().toISO());
    expect(starts).toContain(summer.toUTC().toISO());
    expect(winter.toUTC().toISO()).not.toBe(summer.toUTC().toISO());
  });

  it('skips a wall-clock time that does not exist during the spring-forward gap', () => {
    const slots = generateSlots({
      timezone: 'America/New_York',
      windows: windows([7], '01:00', '04:00'),
      rangeStart: new Date('2026-03-08T00:00:00.000Z'),
      rangeEnd: new Date('2026-03-09T00:00:00.000Z'),
      now: new Date('2026-03-01T00:00:00.000Z'),
      busy: [],
      config,
    });
    const hours = slots.map((slot) => DateTime.fromJSDate(slot.startAt).setZone('America/New_York').hour);
    expect(hours).toContain(1);
    expect(hours).not.toContain(2);
    expect(hours).toContain(3);
  });

  it('offers an ambiguous fall-back hour only once', () => {
    const slots = generateSlots({
      timezone: 'America/New_York',
      windows: windows([7], '01:00', '03:00'),
      rangeStart: new Date('2026-11-01T00:00:00.000Z'),
      rangeEnd: new Date('2026-11-02T00:00:00.000Z'),
      now: new Date('2026-10-01T00:00:00.000Z'),
      busy: [],
      config,
    });
    const atOne = slots.filter((slot) => DateTime.fromJSDate(slot.startAt).setZone('America/New_York').hour === 1);
    expect(atOne).toHaveLength(1);
    expect(() =>
      assertBookableSlot({
        timezone: 'America/New_York',
        windows: windows([7], '01:00', '03:00'),
        startAt: atOne[0].startAt,
        now: new Date('2026-10-01T00:00:00.000Z'),
        config,
      }),
    ).not.toThrow();
  });
});

describe('time rules', () => {
  it('rejects offset timezones and accepts IANA names', () => {
    expect(isValidIanaTimeZone('UTC+5:30')).toBe(false);
    expect(isValidIanaTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidIanaTimeZone('America/New_York')).toBe(true);
  });

  it('allows cancellation at exactly 24 hours and blocks one millisecond inside the window', () => {
    const now = new Date('2026-11-06T06:00:00.000Z');
    expect(canChangeAtLeast24HoursBefore(new Date(now.getTime() + 24 * 60 * 60 * 1000), now)).toBe(true);
    expect(canChangeAtLeast24HoursBefore(new Date(now.getTime() + 24 * 60 * 60 * 1000 - 1), now)).toBe(false);
  });
});

describe('reminder drafts', () => {
  const start = new Date('2026-11-10T04:30:00.000Z');

  it('creates four reminders when both offsets are still in the future', () => {
    const drafts = buildReminderDrafts({
      sessionId: 'session',
      memberId: 'member',
      professionalId: 'pro',
      startAt: start,
      now: new Date('2026-11-08T04:30:00.000Z'),
    });
    expect(drafts).toHaveLength(4);
    expect(drafts.filter((draft) => draft.type === 'HOURS_24')).toHaveLength(2);
    expect(drafts.filter((draft) => draft.type === 'HOUR_1')).toHaveLength(2);
  });

  it('skips a reminder whose scheduled time has already passed', () => {
    const drafts = buildReminderDrafts({
      sessionId: 'session',
      memberId: 'member',
      professionalId: 'pro',
      startAt: start,
      now: new Date('2026-11-09T05:30:00.000Z'),
    });
    expect(drafts.map((draft) => draft.type)).toEqual(['HOUR_1', 'HOUR_1']);
  });

  it('formats each recipient in their own timezone', () => {
    const memberMessage = reminderMessage({
      type: 'HOURS_24',
      otherPartyName: 'Dr. Sarah Chen',
      startAt: start,
      recipientTimezone: 'Asia/Kolkata',
    });
    const professionalMessage = reminderMessage({
      type: 'HOUR_1',
      otherPartyName: 'Rahul Mehta',
      startAt: start,
      recipientTimezone: 'Asia/Singapore',
    });
    expect(memberMessage).toBe('Your session with Sarah is tomorrow at 10:00 AM.');
    expect(professionalMessage).toBe('Your session with Rahul starts in one hour.');
  });
});
