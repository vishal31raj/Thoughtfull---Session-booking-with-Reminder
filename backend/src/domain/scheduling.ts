import { DateTime } from 'luxon';
import { AppError } from '../lib/errors';

export interface AvailabilityWindow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  enabled: boolean;
}

export interface TimeRange {
  startAt: Date;
  endAt: Date;
}

export interface SchedulingConfig {
  sessionDurationMinutes: number;
  slotIntervalMinutes: number;
}

export interface GeneratedSlot {
  startAt: Date;
  endAt: Date;
  available: boolean;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseClock(value: string): { hour: number; minute: number } {
  const match = TIME_PATTERN.exec(value);
  if (!match) {
    throw new AppError(400, 'VALIDATION', 'Times must use HH:mm in 24-hour form.');
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function toMinutes(value: string): number {
  const { hour, minute } = parseClock(value);
  return hour * 60 + minute;
}

export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

function wallClock(day: DateTime, hour: number, minute: number): DateTime {
  const requested = DateTime.fromObject(
    {
      year: day.year,
      month: day.month,
      day: day.day,
      hour,
      minute,
      second: 0,
      millisecond: 0,
    },
    { zone: day.zone },
  );
  // A spring-forward gap is not a real local time. Luxon may roll it forward,
  // so require the resulting wall clock to be the one we asked for.
  if (!requested.isValid || requested.hour !== hour || requested.minute !== minute || requested.day !== day.day) {
    return DateTime.invalid('missing local time');
  }
  // A fall-back hour happens twice. Offer the earlier instant once.
  const earlier = requested.minus({ hours: 1 });
  if (earlier.isValid && earlier.hour === hour && earlier.minute === minute && earlier.day === day.day) {
    return earlier;
  }
  return requested;
}

/**
 * Build bookable instants from weekly wall-clock hours.
 * Slots are not stored. Each start is interpreted in the professional's IANA zone.
 * Missing local times are skipped. Repeated local times are offered once, at the earlier instant.
 */
export function generateSlots(input: {
  timezone: string;
  windows: AvailabilityWindow[];
  rangeStart: Date;
  rangeEnd: Date;
  now: Date;
  busy: TimeRange[];
  config: SchedulingConfig;
}): GeneratedSlot[] {
  const zone = input.timezone;
  let day = DateTime.fromJSDate(input.rangeStart, { zone: 'utc' }).setZone(zone).startOf('day');
  const lastDay = DateTime.fromJSDate(new Date(input.rangeEnd.getTime() - 1), { zone: 'utc' })
    .setZone(zone)
    .startOf('day');
  const slots: GeneratedSlot[] = [];
  const durationMs = input.config.sessionDurationMinutes * 60_000;

  for (; day.toMillis() <= lastDay.toMillis(); day = day.plus({ days: 1 })) {
    const windows = input.windows.filter((window) => window.enabled && window.dayOfWeek === day.weekday);
    for (const window of windows) {
      const startMinutes = toMinutes(window.startTime);
      const endMinutes = toMinutes(window.endTime);
      const boundary = wallClock(day, Math.floor(endMinutes / 60), endMinutes % 60);
      if (!boundary.isValid) continue;

      for (
        let minuteOfDay = startMinutes;
        minuteOfDay + input.config.sessionDurationMinutes <= endMinutes;
        minuteOfDay += input.config.slotIntervalMinutes
      ) {
        const localStart = wallClock(day, Math.floor(minuteOfDay / 60), minuteOfDay % 60);
        if (!localStart.isValid) {
          continue;
        }
        const startAt = localStart.toUTC().toJSDate();
        const endAt = new Date(startAt.getTime() + durationMs);
        if (endAt.getTime() > boundary.toUTC().toMillis()) continue;
        if (startAt.getTime() <= input.now.getTime()) continue;
        if (startAt < input.rangeStart || startAt >= input.rangeEnd) continue;

        const available = !input.busy.some((range) => rangesOverlap(startAt, endAt, range.startAt, range.endAt));
        slots.push({ startAt, endAt, available });
      }
    }
  }

  slots.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return slots;
}

export function assertBookableSlot(input: {
  timezone: string;
  windows: AvailabilityWindow[];
  startAt: Date;
  now: Date;
  config: SchedulingConfig;
}): Date {
  if (input.startAt.getTime() <= input.now.getTime()) {
    throw new AppError(400, 'PAST_SLOT', 'Past sessions cannot be booked.');
  }

  const local = DateTime.fromJSDate(input.startAt, { zone: 'utc' }).setZone(input.timezone);
  if (!local.isValid || local.second !== 0 || local.millisecond !== 0) {
    throw new AppError(400, 'INVALID_SLOT', 'That time is not an available session slot.');
  }

  const minuteOfDay = local.hour * 60 + local.minute;
  const fits = input.windows.some((window) => {
    if (!window.enabled || window.dayOfWeek !== local.weekday) return false;
    const start = toMinutes(window.startTime);
    const end = toMinutes(window.endTime);
    const offset = minuteOfDay - start;
    if (offset < 0 || offset % input.config.slotIntervalMinutes !== 0) return false;
    if (minuteOfDay + input.config.sessionDurationMinutes > end) return false;
    return true;
  });
  if (!fits) {
    throw new AppError(400, 'INVALID_SLOT', "That time is outside this professional's working hours.");
  }

  const expected = wallClock(local, local.hour, local.minute);
  if (!expected.isValid || expected.toUTC().toMillis() !== input.startAt.getTime()) {
    throw new AppError(400, 'INVALID_SLOT', "That time does not exist in the professional's timezone.");
  }

  const endAt = new Date(input.startAt.getTime() + input.config.sessionDurationMinutes * 60_000);
  const windowEnd = input.windows
    .filter((window) => window.enabled && window.dayOfWeek === local.weekday)
    .map((window) => {
      const end = toMinutes(window.endTime);
      return wallClock(local, Math.floor(end / 60), end % 60);
    })
    .find((boundary) => boundary.isValid && endAt.getTime() <= boundary.toUTC().toMillis());
  if (!windowEnd) {
    throw new AppError(400, 'INVALID_SLOT', 'That session does not fit inside working hours.');
  }
  return endAt;
}

export function assertNoOverlappingWindows(
  windows: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
) {
  const byDay = new Map<number, typeof windows>();
  for (const window of windows) {
    const list = byDay.get(window.dayOfWeek) ?? [];
    list.push(window);
    byDay.set(window.dayOfWeek, list);
  }
  for (const list of byDay.values()) {
    const sorted = [...list].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index].startTime < sorted[index - 1].endTime) {
        throw new AppError(
          400,
          'OVERLAPPING_AVAILABILITY',
          'Working periods on the same weekday cannot overlap.',
        );
      }
    }
  }
}
