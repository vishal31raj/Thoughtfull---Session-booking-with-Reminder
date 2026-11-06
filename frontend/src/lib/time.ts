import { DateTime } from 'luxon';
import type { Slot } from '../api/types';

export const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Dubai',
  'Asia/Tokyo',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Australia/Sydney',
  'Pacific/Auckland',
  'UTC',
];

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function formatTime(iso: string, zone: string): string {
  const local = DateTime.fromISO(iso, { zone: 'utc' }).setZone(zone);
  const hour12 = local.hour % 12 === 0 ? 12 : local.hour % 12;
  const minute = local.minute.toString().padStart(2, '0');
  return `${hour12}:${minute} ${local.hour < 12 ? 'AM' : 'PM'}`;
}

export function formatDate(iso: string, zone: string): string {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(zone).toFormat('cccc, LLLL d, yyyy');
}

export function formatShortDate(isoDate: string): string {
  return DateTime.fromISO(isoDate).toFormat('ccc d');
}

export function dayKey(iso: string, zone: string): string {
  return DateTime.fromISO(iso, { zone: 'utc' }).setZone(zone).toISODate() ?? '';
}

const HONORIFICS = new Set(['dr', 'mr', 'mrs', 'ms', 'mx', 'prof']);

export function firstName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const given = parts.find((part) => !HONORIFICS.has(part.replace(/\./g, '').toLowerCase()));
  return given ?? parts[0] ?? name;
}

export function greeting(zone: string, now = new Date()): string {
  const hour = DateTime.fromJSDate(now).setZone(zone).hour;
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function upcomingDays(zone: string, count = 28, now = new Date()): string[] {
  const start = DateTime.fromJSDate(now).setZone(zone).startOf('day');
  return Array.from({ length: count }, (_, index) => start.plus({ days: index }).toISODate() ?? '');
}

export function groupSlots(slots: Slot[], zone: string): Map<string, Slot[]> {
  const grouped = new Map<string, Slot[]>();
  for (const slot of slots) {
    const key = dayKey(slot.startAt, zone);
    const list = grouped.get(key) ?? [];
    list.push(slot);
    grouped.set(key, list);
  }
  return grouped;
}

export function canChangeSession(startAt: string, now = new Date()): boolean {
  return new Date(startAt).getTime() - now.getTime() >= 24 * 60 * 60 * 1000;
}
