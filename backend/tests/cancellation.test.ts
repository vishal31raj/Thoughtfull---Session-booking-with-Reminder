import { DateTime } from 'luxon';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { cancelSession } from '../src/services/session.service';
import type { AuthUser } from '../src/types/express';
import { api, book, cancel, register, resetDatabase, setAvailability } from './helpers';

async function viewer(email: string): Promise<AuthUser> {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return {
    id: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
    timezone: user.timezone,
    title: user.title,
    bio: user.bio,
    focusAreas: user.focusAreas,
    sessionVersion: user.sessionVersion,
  };
}

describe('cancellation', () => {
  beforeEach(resetDatabase);

  async function sessionIn(days: number) {
    const professional = api();
    const member = api();
    const pro = await register(professional, { role: 'PROFESSIONAL', timezone: 'Asia/Kolkata', email: `pro-${days}@example.com` });
    await setAvailability(professional);
    await register(member, { email: `member-${days}@example.com`, timezone: 'Asia/Kolkata' });
    const start = DateTime.now().setZone('Asia/Kolkata').plus({ days }).set({ hour: 10, minute: 0, second: 0, millisecond: 0 });
    const created = await book(member, pro.body.data.user.id, start.toUTC().toISO()!);
    expect(created.status).toBe(201);
    return { professional, member, sessionId: created.body.data.id as string, start, email: `member-${days}@example.com` };
  }

  it('lets a member cancel more than 24 hours before the start', async () => {
    const { member, sessionId } = await sessionIn(3);
    const response = await cancel(member, sessionId);
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('CANCELLED');
  });

  it('lets a member cancel at exactly 24 hours and blocks one millisecond inside the window', async () => {
    const { sessionId, start, email } = await sessionIn(4);
    const exact = await cancelSession({
      sessionId,
      viewer: await viewer(email),
      now: new Date(start.toUTC().toMillis() - 24 * 60 * 60 * 1000),
    });
    expect(exact.status).toBe('CANCELLED');

    const later = await sessionIn(5);
    await expect(
      cancelSession({
        sessionId: later.sessionId,
        viewer: await viewer(later.email),
        now: new Date(later.start.toUTC().toMillis() - 24 * 60 * 60 * 1000 + 1),
      }),
    ).rejects.toMatchObject({ code: 'TOO_LATE' });
    expect((await prisma.session.findUniqueOrThrow({ where: { id: later.sessionId } })).status).toBe('BOOKED');
  });

  it('lets the professional cancel inside the final day', async () => {
    const professional = api();
    const member = api();
    const pro = await register(professional, { role: 'PROFESSIONAL', timezone: 'Asia/Kolkata', email: 'late-pro@example.com' });
    await setAvailability(
      professional,
      [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
        dayOfWeek,
        startTime: '00:00',
        endTime: '23:00',
        enabled: true,
      })),
    );
    await register(member, { email: 'late-member@example.com' });
    const start = DateTime.now().setZone('Asia/Kolkata').plus({ hours: 3 }).set({ minute: 0, second: 0, millisecond: 0 });
    const created = await book(member, pro.body.data.user.id, start.toUTC().toISO()!);
    expect(created.status).toBe(201);
    expect((await cancel(member, created.body.data.id)).status).toBe(403);
    const response = await cancel(professional, created.body.data.id);
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('CANCELLED');
  });
});
