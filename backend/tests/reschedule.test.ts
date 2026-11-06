import { DateTime } from 'luxon';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { api, book, register, reschedule, resetDatabase, setAvailability } from './helpers';

describe('rescheduling', () => {
  beforeEach(resetDatabase);

  const zone = 'Asia/Singapore';

  function at(days: number, hour: number) {
    return DateTime.now().setZone(zone).plus({ days }).set({ hour, minute: 0, second: 0, millisecond: 0 });
  }

  it('moves the same session and replaces its reminders', async () => {
    const professional = api();
    const member = api();
    const pro = await register(professional, { role: 'PROFESSIONAL', timezone: zone, email: 'sarah@example.com' });
    await setAvailability(professional);
    await register(member, { email: 'maya@example.com' });
    const original = at(4, 10);
    const destination = at(5, 11);
    const created = await book(member, pro.body.data.user.id, original.toUTC().toISO()!);
    expect(created.status).toBe(201);
    expect(await prisma.reminder.count({ where: { sessionId: created.body.data.id, status: 'PENDING' } })).toBe(4);

    const response = await reschedule(member, created.body.data.id, destination.toUTC().toISO()!);
    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(created.body.data.id);
    expect(response.body.data.startAt).toBe(destination.toUTC().toISO());
    const reminders = await prisma.reminder.findMany({ where: { sessionId: created.body.data.id } });
    expect(reminders.filter((reminder) => reminder.status === 'CANCELLED')).toHaveLength(4);
    const pending = reminders.filter((reminder) => reminder.status === 'PENDING');
    expect(pending).toHaveLength(4);
    expect(pending.some((reminder) => reminder.scheduledAt.toISOString() === destination.minus({ hours: 24 }).toUTC().toISO())).toBe(true);
  });

  it('leaves the original booking in place when the new slot is taken or invalid', async () => {
    const professional = api();
    const memberA = api();
    const memberB = api();
    const pro = await register(professional, { role: 'PROFESSIONAL', timezone: zone, email: 'keep@example.com' });
    await setAvailability(professional);
    await register(memberA, { email: 'keep-a@example.com' });
    await register(memberB, { email: 'keep-b@example.com' });
    const original = at(4, 10);
    const destination = at(4, 12);
    const created = await book(memberA, pro.body.data.user.id, original.toUTC().toISO()!);
    expect((await book(memberB, pro.body.data.user.id, destination.toUTC().toISO()!)).status).toBe(201);

    const conflict = await reschedule(memberA, created.body.data.id, destination.toUTC().toISO()!);
    expect(conflict.status).toBe(409);
    expect((await prisma.session.findUniqueOrThrow({ where: { id: created.body.data.id } })).startAt.toISOString()).toBe(
      original.toUTC().toISO(),
    );
    expect(await prisma.reminder.count({ where: { sessionId: created.body.data.id, status: 'PENDING' } })).toBe(4);

    const offGrid = destination.set({ minute: 15 });
    expect((await reschedule(memberA, created.body.data.id, offGrid.toUTC().toISO()!)).status).toBe(400);
    expect((await prisma.session.findUniqueOrThrow({ where: { id: created.body.data.id } })).startAt.toISOString()).toBe(
      original.toUTC().toISO(),
    );
  });
});
