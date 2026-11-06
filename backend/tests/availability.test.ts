import { DateTime } from 'luxon';
import { beforeEach, describe, expect, it } from 'vitest';
import { api, book, register, resetDatabase, setAvailability } from './helpers';

describe('availability and discovery', () => {
  beforeEach(resetDatabase);

  it('saves a week and rejects overlapping or backwards hours', async () => {
    const professional = api();
    await register(professional, { role: 'PROFESSIONAL', timezone: 'Asia/Singapore' });
    const saved = await setAvailability(professional, [
      { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', enabled: true },
      { dayOfWeek: 3, startTime: '10:00', endTime: '16:00', enabled: true },
      { dayOfWeek: 5, startTime: '09:00', endTime: '15:00', enabled: true },
      { dayOfWeek: 6, startTime: '09:00', endTime: '17:00', enabled: false },
    ]);
    expect(saved.body.data).toHaveLength(4);

    const token = (await professional.get('/api/auth/csrf')).body.data.csrfToken as string;
    const backwards = await professional.put('/api/availability/me').set('X-CSRF-Token', token).send({
      windows: [{ dayOfWeek: 1, startTime: '17:00', endTime: '09:00', enabled: true }],
    });
    expect(backwards.status).toBe(400);

    const overlap = await professional.put('/api/availability/me').set('X-CSRF-Token', token).send({
      windows: [
        { dayOfWeek: 1, startTime: '09:00', endTime: '12:00', enabled: true },
        { dayOfWeek: 1, startTime: '11:00', endTime: '15:00', enabled: true },
      ],
    });
    expect(overlap.status).toBe(400);
    expect(overlap.body.error.code).toBe('OVERLAPPING_AVAILABILITY');
  });

  it('lists only open slots and never the name of the person who booked one', async () => {
    const professional = api();
    const member = api();
    const created = await register(professional, { role: 'PROFESSIONAL', timezone: 'Asia/Singapore', name: 'Sarah Chen' });
    await setAvailability(professional, [{ dayOfWeek: 1, startTime: '09:00', endTime: '12:00', enabled: true }]);
    await register(member, { name: 'Maya Ellison', email: 'maya-slots@example.com', timezone: 'America/New_York' });

    const monday = DateTime.now().setZone('Asia/Singapore').plus({ weeks: 1 }).set({ weekday: 1 }).startOf('day');
    const from = monday.toUTC().toISO()!;
    const to = monday.plus({ days: 1 }).toUTC().toISO()!;
    const open = await member.get(
      `/api/professionals/${created.body.data.user.id}/slots?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    expect(open.status).toBe(200);
    const labels = open.body.data.slots.map((slot: { startAt: string }) =>
      DateTime.fromISO(slot.startAt).setZone('Asia/Singapore').toFormat('HH:mm'),
    );
    expect(labels).toEqual(['09:00', '10:00', '11:00']);

    const booked = await book(member, created.body.data.user.id, open.body.data.slots[1].startAt);
    expect(booked.status).toBe(201);
    const after = await member.get(
      `/api/professionals/${created.body.data.user.id}/slots?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
    const taken = after.body.data.slots.find((slot: { startAt: string }) => slot.startAt === open.body.data.slots[1].startAt);
    expect(taken.available).toBe(false);
    const body = JSON.stringify(after.body);
    expect(body).not.toContain('maya-slots@example.com');
    expect(body).not.toContain('Maya Ellison');
    expect(body).not.toContain('memberId');
  });
});
