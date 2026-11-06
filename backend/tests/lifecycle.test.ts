import { describe, expect, it } from 'vitest';
import { buildReminderDrafts } from '../src/domain/reminders';
import { clock } from '../src/lib/clock';
import {
  futureSlot,
  prisma,
  registerMember,
  registerProfessional,
  setAvailability,
  weekWindows,
} from './helpers';

async function readyProfessional() {
  const professional = await registerProfessional({ timezone: 'Asia/Singapore' });
  await setAvailability(professional.agent, professional.csrf, weekWindows([1, 2, 3, 4, 5, 6, 7], '00:00', '23:00'));
  return professional;
}

describe('cancellation', () => {
  it('allows a member at and beyond 24 hours, blocks inside the window, and lets a professional cancel at any time', async () => {
    const professional = await registerProfessional();
    const member = await registerMember();
    const fixed = new Date('2026-11-06T12:00:00.000Z');
    clock.now = () => fixed;
    const now = fixed.getTime();
    const cases = [
      { lead: 30 * 60 * 60 * 1000, expected: 200 },
      { lead: 24 * 60 * 60 * 1000, expected: 200 },
      { lead: 2 * 60 * 60 * 1000, expected: 403 },
    ];
    for (const item of cases) {
      const startAt = new Date(now + item.lead);
      const session = await prisma.session.create({
        data: {
          memberId: member.res.body.data.user.id,
          professionalId: professional.res.body.data.user.id,
          startAt,
          endAt: new Date(startAt.getTime() + 50 * 60 * 1000),
        },
      });
      await prisma.reminder.createMany({
        data: buildReminderDrafts({
          sessionId: session.id,
          memberId: member.res.body.data.user.id,
          professionalId: professional.res.body.data.user.id,
          startAt,
          now: new Date(now),
        }),
      });
      const res = await member.agent.patch(`/api/sessions/${session.id}/cancel`).set('X-CSRF-Token', member.csrf);
      expect(res.status).toBe(item.expected);
      if (item.expected === 200) {
        const pending = await prisma.reminder.count({
          where: { sessionId: session.id, status: { in: ['PENDING', 'PROCESSING'] } },
        });
        expect(pending).toBe(0);
      }
    }

    const soon = new Date(now + 60 * 60 * 1000);
    const professionalSession = await prisma.session.create({
      data: {
        memberId: member.res.body.data.user.id,
        professionalId: professional.res.body.data.user.id,
        startAt: soon,
        endAt: new Date(soon.getTime() + 50 * 60 * 1000),
      },
    });
    const cancelled = await professional.agent
      .patch(`/api/sessions/${professionalSession.id}/cancel`)
      .set('X-CSRF-Token', professional.csrf);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
  });
});

describe('rescheduling', () => {
  it('moves a session, replaces reminders, and keeps the original when the new slot is taken', async () => {
    const professional = await readyProfessional();
    const otherProfessional = await readyProfessional();
    const member = await registerMember();
    const otherMember = await registerMember({ name: 'Other Person' });
    const originalStart = futureSlot('Asia/Singapore', 9, 0, 50 * 60 * 60 * 1000);
    const destination = futureSlot('Asia/Singapore', 13, 0, 50 * 60 * 60 * 1000);
    const conflicting = futureSlot('Asia/Singapore', 16, 0, 50 * 60 * 60 * 1000);

    const booked = await member.agent.post('/api/sessions').set('X-CSRF-Token', member.csrf).send({
      professionalId: professional.res.body.data.user.id,
      startAt: originalStart.toISOString(),
    });
    expect(booked.status).toBe(201);
    const before = await prisma.reminder.findMany({ where: { sessionId: booked.body.data.id, status: 'PENDING' } });
    expect(before.length).toBe(4);

    const moved = await member.agent.patch(`/api/sessions/${booked.body.data.id}/reschedule`).set('X-CSRF-Token', member.csrf).send({
      startAt: destination.toISOString(),
    });
    expect(moved.status).toBe(200);
    expect(moved.body.data.startAt).toBe(destination.toISOString());
    const cancelledReminders = await prisma.reminder.count({
      where: { sessionId: booked.body.data.id, status: 'CANCELLED' },
    });
    const pendingReminders = await prisma.reminder.count({
      where: { sessionId: booked.body.data.id, status: 'PENDING' },
    });
    expect(cancelledReminders).toBe(4);
    expect(pendingReminders).toBe(4);

    const taken = await otherMember.agent.post('/api/sessions').set('X-CSRF-Token', otherMember.csrf).send({
      professionalId: professional.res.body.data.user.id,
      startAt: conflicting.toISOString(),
    });
    expect(taken.status).toBe(201);
    const blocked = await member.agent
      .patch(`/api/sessions/${booked.body.data.id}/reschedule`)
      .set('X-CSRF-Token', member.csrf)
      .send({ startAt: conflicting.toISOString() });
    expect(blocked.status).toBe(409);
    const unchanged = await prisma.session.findUniqueOrThrow({ where: { id: booked.body.data.id } });
    expect(unchanged.startAt.toISOString()).toBe(destination.toISOString());

    const ownOther = await member.agent.post('/api/sessions').set('X-CSRF-Token', member.csrf).send({
      professionalId: otherProfessional.res.body.data.user.id,
      startAt: futureSlot('Asia/Singapore', 18, 0, 50 * 60 * 60 * 1000).toISOString(),
    });
    expect(ownOther.status).toBe(201);
    const memberConflict = await member.agent
      .patch(`/api/sessions/${ownOther.body.data.id}/reschedule`)
      .set('X-CSRF-Token', member.csrf)
      .send({ startAt: destination.toISOString() });
    expect(memberConflict.status).toBe(409);
    expect(memberConflict.body.error.code).toBe('MEMBER_OVERLAP');
    const preserved = await prisma.session.findUniqueOrThrow({ where: { id: ownOther.body.data.id } });
    expect(preserved.startAt.toISOString()).toBe(new Date(ownOther.body.data.startAt).toISOString());
  });
});
