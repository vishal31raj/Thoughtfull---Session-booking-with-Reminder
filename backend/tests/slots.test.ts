import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { buildReminderDrafts, reminderMessage } from '../src/domain/reminders';
import { generateSlots } from '../src/domain/scheduling';
import { canChangeAtLeast24HoursBefore } from '../src/domain/time';

const config = { sessionDurationMinutes: 50, slotIntervalMinutes: 60 };

function sunday(year: number, month: number, nth: number) {
  let day = DateTime.fromObject({ year, month, day: 1 }, { zone: 'America/New_York' });
  while (day.weekday !== 7) day = day.plus({ days: 1 });
  return day.plus({ weeks: nth - 1 });
}

describe('slot generation', () => {
  it('creates 50-minute sessions every 60 minutes inside working hours', () => {
    const day = DateTime.fromObject({ year: 2026, month: 11, day: 9 }, { zone: 'Asia/Singapore' });
    const slots = generateSlots({
      timezone: 'Asia/Singapore',
      windows: [{ dayOfWeek: day.weekday, startTime: '09:00', endTime: '12:00', enabled: true }],
      rangeStart: day.startOf('day').toUTC().toJSDate(),
      rangeEnd: day.plus({ days: 1 }).startOf('day').toUTC().toJSDate(),
      now: day.startOf('day').toUTC().toJSDate(),
      busy: [],
      config,
    });
    expect(slots.map((slot) => DateTime.fromJSDate(slot.startAt).setZone('Asia/Singapore').toFormat('HH:mm'))).toEqual([
      '09:00',
      '10:00',
      '11:00',
    ]);
    expect(slots[0].endAt.getTime() - slots[0].startAt.getTime()).toBe(50 * 60 * 1000);
    expect(slots[1].startAt.getTime() - slots[0].startAt.getTime()).toBe(60 * 60 * 1000);
    expect(slots[0].startAt.toISOString()).toBe('2026-11-09T01:00:00.000Z');
  });

  it('drops past slots and marks a booked range unavailable', () => {
    const day = DateTime.fromObject({ year: 2026, month: 11, day: 9 }, { zone: 'Asia/Singapore' });
    const busyStart = new Date('2026-11-09T02:00:00.000Z');
    const slots = generateSlots({
      timezone: 'Asia/Singapore',
      windows: [{ dayOfWeek: day.weekday, startTime: '09:00', endTime: '12:00', enabled: true }],
      rangeStart: day.startOf('day').toUTC().toJSDate(),
      rangeEnd: day.plus({ days: 1 }).startOf('day').toUTC().toJSDate(),
      now: new Date('2026-11-09T01:30:00.000Z'),
      busy: [{ startAt: busyStart, endAt: new Date(busyStart.getTime() + 50 * 60 * 1000) }],
      config,
    });
    expect(
      slots.map((slot) => ({
        time: DateTime.fromJSDate(slot.startAt).setZone('Asia/Singapore').toFormat('HH:mm'),
        available: slot.available,
      })),
    ).toEqual([
      { time: '10:00', available: false },
      { time: '11:00', available: true },
    ]);
  });

  it('skips the missing hour on a New York spring-forward morning', () => {
    const spring = sunday(2027, 3, 2);
    const slots = generateSlots({
      timezone: 'America/New_York',
      windows: [{ dayOfWeek: 7, startTime: '01:00', endTime: '04:00', enabled: true }],
      rangeStart: spring.startOf('day').toUTC().toJSDate(),
      rangeEnd: spring.plus({ days: 1 }).startOf('day').toUTC().toJSDate(),
      now: spring.minus({ days: 1 }).toJSDate(),
      busy: [],
      config,
    });
    expect(slots.map((slot) => slot.startAt.toISOString())).toEqual([
      '2027-03-14T06:00:00.000Z',
      '2027-03-14T07:00:00.000Z',
    ]);
  });

  it('uses one instant for the repeated hour on a New York fall-back morning', () => {
    const fall = sunday(2027, 11, 1);
    const slots = generateSlots({
      timezone: 'America/New_York',
      windows: [{ dayOfWeek: 7, startTime: '01:00', endTime: '04:00', enabled: true }],
      rangeStart: fall.startOf('day').toUTC().toJSDate(),
      rangeEnd: fall.plus({ days: 1 }).startOf('day').toUTC().toJSDate(),
      now: fall.minus({ days: 1 }).toJSDate(),
      busy: [],
      config,
    });
    expect(slots.map((slot) => slot.startAt.toISOString())).toEqual([
      '2027-11-07T05:00:00.000Z',
      '2027-11-07T07:00:00.000Z',
      '2027-11-07T08:00:00.000Z',
    ]);
  });
});

describe('reminders and the 24-hour rule', () => {
  const start = new Date('2026-11-10T04:30:00.000Z');

  it('plans four reminders, then only the one-hour pair, then none', () => {
    const base = { sessionId: 's', memberId: 'm', professionalId: 'p', startAt: start };
    expect(buildReminderDrafts({ ...base, now: new Date('2026-11-08T04:30:00.000Z') })).toHaveLength(4);
    expect(buildReminderDrafts({ ...base, now: new Date('2026-11-09T05:30:00.000Z') }).map((item) => item.type)).toEqual([
      'HOUR_1',
      'HOUR_1',
    ]);
    expect(buildReminderDrafts({ ...base, now: new Date('2026-11-10T04:00:00.000Z') })).toEqual([]);
  });

  it('writes reminder copy in the recipient timezone', () => {
    expect(
      reminderMessage({
        type: 'HOURS_24',
        otherPartyName: 'Dr. Sarah Chen',
        startAt: start,
        recipientTimezone: 'Asia/Kolkata',
      }),
    ).toBe('Your session with Sarah is tomorrow at 10:00 AM.');
    expect(
      reminderMessage({
        type: 'HOUR_1',
        otherPartyName: 'Rahul Mehta',
        startAt: start,
        recipientTimezone: 'Asia/Kolkata',
      }),
    ).toBe('Your session with Rahul starts in one hour.');
  });

  it('allows a change at exactly 24 hours and blocks one millisecond later', () => {
    const day = 24 * 60 * 60 * 1000;
    expect(canChangeAtLeast24HoursBefore(start, new Date(start.getTime() - day))).toBe(true);
    expect(canChangeAtLeast24HoursBefore(start, new Date(start.getTime() - day - 1))).toBe(true);
    expect(canChangeAtLeast24HoursBefore(start, new Date(start.getTime() - day + 1))).toBe(false);
  });
});
