import { describe, expect, it } from 'vitest';
import { firstName, formatDate, formatTime, greeting, groupSlots } from './time';

describe('member timezone display', () => {
  it('shows a Singapore morning slot as the previous evening in New York', () => {
    expect(formatTime('2026-11-09T01:00:00.000Z', 'America/New_York')).toBe('8:00 PM');
    expect(formatDate('2026-11-09T01:00:00.000Z', 'America/New_York')).toBe('Sunday, November 8, 2026');
    expect(formatTime('2026-11-09T01:00:00.000Z', 'Asia/Singapore')).toBe('9:00 AM');
  });

  it('groups slots by the viewer’s local date', () => {
    const grouped = groupSlots(
      [
        { startAt: '2026-11-09T01:00:00.000Z', endAt: '2026-11-09T01:50:00.000Z', available: true },
        { startAt: '2026-11-09T02:00:00.000Z', endAt: '2026-11-09T02:50:00.000Z', available: true },
      ],
      'America/New_York',
    );
    expect([...grouped.keys()]).toEqual(['2026-11-08']);
  });

  it('skips an honorific when greeting a professional', () => {
    expect(firstName('Dr. Sarah Chen')).toBe('Sarah');
    expect(firstName('Anika Sharma')).toBe('Anika');
  });

  it('chooses a greeting from the viewer timezone', () => {
    expect(greeting('Asia/Kolkata', new Date('2026-11-06T04:00:00.000Z'))).toBe('Good morning');
    expect(greeting('America/New_York', new Date('2026-11-06T04:00:00.000Z'))).toBe('Good evening');
  });
});
