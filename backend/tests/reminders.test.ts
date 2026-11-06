import { describe, expect, it } from 'vitest';
import { processDueReminders } from '../src/services/reminder-worker';
import { futureSlot, prisma, registerMember, registerProfessional, setAvailability, weekWindows } from './helpers';

describe('reminder scheduling', () => {
  it('creates four reminders far out and only the one-hour reminders inside 24 hours', async () => {
    const professional = await registerProfessional({ timezone: 'Asia/Singapore' });
    await setAvailability(professional.agent, professional.csrf, weekWindows([1, 2, 3, 4, 5, 6, 7], '00:00', '23:00'));
    const member = await registerMember();
    const far = futureSlot('Asia/Singapore', 10, 0, 30 * 60 * 60 * 1000);
    const farBooking = await member.agent.post('/api/sessions').set('X-CSRF-Token', member.csrf).send({
      professionalId: professional.res.body.data.user.id,
      startAt: far.toISOString(),
    });
    expect(farBooking.status).toBe(201);
    expect(await prisma.reminder.count({ where: { sessionId: farBooking.body.data.id } })).toBe(4);

    const slots = await member.agent.get(`/api/professionals/${professional.res.body.data.user.id}/slots`);
    const soon = (slots.body.data.slots as Array<{ startAt: string; available: boolean }>).find((slot) => {
      const lead = new Date(slot.startAt).getTime() - Date.now();
      return slot.available && lead > 70 * 60 * 1000 && lead < 20 * 60 * 60 * 1000;
    });
    expect(soon).toBeTruthy();
    const nearBooking = await member.agent.post('/api/sessions').set('X-CSRF-Token', member.csrf).send({
      professionalId: professional.res.body.data.user.id,
      startAt: soon!.startAt,
    });
    expect(nearBooking.status).toBe(201);
    const nearReminders = await prisma.reminder.findMany({ where: { sessionId: nearBooking.body.data.id } });
    expect(nearReminders.length).toBe(2);
    expect(nearReminders.every((reminder) => reminder.type === 'HOUR_1')).toBe(true);
  });
});

describe('reminder worker', () => {
  it('delivers a due reminder, survives another run, and does not duplicate notifications', async () => {
    const professional = await registerProfessional();
    const member = await registerMember();
    const startAt = futureSlot('UTC', 9, 0, 48 * 60 * 60 * 1000);
    const session = await prisma.session.create({
      data: {
        memberId: member.res.body.data.user.id,
        professionalId: professional.res.body.data.user.id,
        startAt,
        endAt: new Date(startAt.getTime() + 50 * 60 * 1000),
      },
    });
    const reminder = await prisma.reminder.create({
      data: {
        sessionId: session.id,
        recipientId: member.res.body.data.user.id,
        type: 'HOUR_1',
        scheduledAt: new Date(Date.now() - 1000),
        status: 'PENDING',
      },
    });

    expect(await processDueReminders()).toBe(1);
    expect(await prisma.notification.count({ where: { reminderId: reminder.id } })).toBe(1);
    const delivered = await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } });
    expect(delivered.status).toBe('DELIVERED');

    await processDueReminders();
    expect(await prisma.notification.count()).toBe(1);

    await prisma.reminder.update({
      where: { id: reminder.id },
      data: { status: 'PENDING', scheduledAt: new Date(Date.now() - 1000), deliveredAt: null },
    });
    await processDueReminders();
    expect(await prisma.notification.count({ where: { reminderId: reminder.id } })).toBe(1);
    expect((await prisma.reminder.findUniqueOrThrow({ where: { id: reminder.id } })).status).toBe('DELIVERED');
  });

  it('recovers a stale processing reminder and lets concurrent workers claim once', async () => {
    const professional = await registerProfessional();
    const member = await registerMember();
    const startAt = futureSlot('UTC', 12, 0, 48 * 60 * 60 * 1000);
    const session = await prisma.session.create({
      data: {
        memberId: member.res.body.data.user.id,
        professionalId: professional.res.body.data.user.id,
        startAt,
        endAt: new Date(startAt.getTime() + 50 * 60 * 1000),
      },
    });
    const stale = await prisma.reminder.create({
      data: {
        sessionId: session.id,
        recipientId: professional.res.body.data.user.id,
        type: 'HOURS_24',
        scheduledAt: new Date(Date.now() - 60_000),
        status: 'PROCESSING',
        lockedAt: new Date(Date.now() - 10 * 60 * 1000),
        attempts: 1,
      },
    });
    await processDueReminders();
    expect((await prisma.reminder.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe('DELIVERED');
    expect(await prisma.notification.count({ where: { reminderId: stale.id } })).toBe(1);

    const second = await prisma.reminder.create({
      data: {
        sessionId: session.id,
        recipientId: member.res.body.data.user.id,
        type: 'HOUR_1',
        scheduledAt: new Date(Date.now() - 1000),
        status: 'PENDING',
      },
    });
    await Promise.all([processDueReminders(), processDueReminders()]);
    expect(await prisma.notification.count({ where: { reminderId: second.id } })).toBe(1);
  });
});
