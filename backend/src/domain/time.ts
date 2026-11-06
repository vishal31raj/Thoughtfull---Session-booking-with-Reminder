import { IANAZone } from 'luxon';

const OFFSET_LIKE = /^(UTC|GMT)[+-]\d/i;

export function isValidIanaTimeZone(zone: string): boolean {
  const trimmed = zone.trim();
  if (!trimmed || OFFSET_LIKE.test(trimmed) || /^[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return false;
  }
  if (trimmed !== 'UTC' && !trimmed.includes('/')) {
    return false;
  }
  return IANAZone.isValidZone(trimmed);
}

export const WEEKDAY_LABELS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export function weekdayLabel(dayOfWeek: number): string {
  return WEEKDAY_LABELS[dayOfWeek - 1] ?? 'Unknown';
}

export function canChangeAtLeast24HoursBefore(startAt: Date, now: Date): boolean {
  return startAt.getTime() - now.getTime() >= 24 * 60 * 60 * 1000;
}

export function shortName(fullName: string): string {
  const withoutTitle = fullName.replace(/^(Dr|Mr|Mrs|Ms|Mx|Prof)\.?\s+/i, '').trim();
  const first = withoutTitle.split(/\s+/).filter(Boolean)[0];
  return first || fullName;
}
