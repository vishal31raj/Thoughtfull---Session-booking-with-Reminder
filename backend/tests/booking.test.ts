import { describe, expect, it } from 'vitest';
import { futureSlot, prisma, registerMember, registerProfessional, setAvailability, weekWindows } from './helpers';

async function professionalWithHours(start = '00:00', end = '23:00', timezone = 'Asia/Singapore') {
  const professional = await registerProfessional({ timezone });
  expect(professional.res.status).toBe(201);
  const saved = await setAvailability(professional.agent, professional.csrf, weekWindows([1, 2, 3, 4, 5, 6, 7], start, end));
  expect(saved.status).toBe(200);
  return professional;
}

describe('booking', () => {
  it('books a slot and rejects a second member, a past time, and a time off the grid', async () => {
    const professional = await professionalWithHours();
    const member = await registerMember();
    const startAt = futureSlot('Asia/Singapore', 10, 0, 26 * 60 * 60 * 1000);
    const booked = await member.agent.post('/api/sessions').set('X-CSRF-Token', member.csrf).send({
      professionalId: professional.res.body.data.user.id,
      startAt: startAt.toISOString(),
    });
    expect(booked.status).toBe(201);
    expect(booked.body.data.durationMinutes).toBe(50);
    expect(booked.body.data.status).toBe('BOOKED');
    expect(new Date(booked.body.data.endAt).getTime() - new Date(booked.body.data.startAt).getTime()).toBe(50 * 60 * 1000);

    const other = await registerMember({ name: 'Other Member' });
    const conflict = await other.agent.post('/api/sessions').set('X-CSRF-Token', other.csrf).send({
      professionalId: professional.res.body.data.user.id,
      startAt: startAt.toISOString(),
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('PROFESSIONAL_OVERLAP');

    const past = await member.agent.post('/api/sessions').set('X-CSRF-Token', member.csrf).send({
      professionalId: professional.res.body.data.user.id,
      startAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    });
    expect(past.status).toBe(400);
    expect(past.body.error.code).toBe('PAST_SLOT');

    const offGrid = new Date(startAt.getTime() + 15 * 60 * 1000);
    const invalid = await other.agent.post('/api/sessions').set('X-CSRF-Token', other.csrf).send({
      professionalId: professional.res.body.data.user.id,
      startAt: offGrid.toISOString(),
    });
    expect(invalid.status).toBe(400);
  });

  it('lets only one of two simultaneous bookings succeed', async () => {
    const professional = await professionalWithHours();
    const first = await registerMember({ name: 'Member A' });
    const second = await registerMember({ name: 'Member B' });
    const startAt = futureSlot('Asia/Singapore', 11, 0, 26 * 60 * 60 * 1000);
    const payload = { professionalId: professional.res.body.data.user.id, startAt: startAt.toISOString() };
    const [left, right] = await Promise.all([
      first.agent.post('/api/sessions').set('X-CSRF-Token', first.csrf).send(payload),
      second.agent.post('/api/sessions').set('X-CSRF-Token', second.csrf).send(payload),
    ]);
    const statuses = [left.status, right.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect(await prisma.session.count({ where: { status: 'BOOKED' } })).toBe(1);
  });

  it('rejects an overlapping session for the same member with a different professional', async () => {
    const firstProfessional = await professionalWithHours('09:00', '17:00', 'Asia/Singapore');
    const secondProfessional = await professionalWithHours('09:00', '17:00', 'Asia/Singapore');
    const member = await registerMember();
    const startAt = futureSlot('Asia/Singapore', 15, 0, 26 * 60 * 60 * 1000);
    const firstBooking = await member.agent.post('/api/sessions').set('X-CSRF-Token', member.csrf).send({
      professionalId: firstProfessional.res.body.data.user.id,
      startAt: startAt.toISOString(),
    });
    expect(firstBooking.status).toBe(201);
    const secondBooking = await member.agent.post('/api/sessions').set('X-CSRF-Token', member.csrf).send({
      professionalId: secondProfessional.res.body.data.user.id,
      startAt: startAt.toISOString(),
    });
    expect(secondBooking.status).toBe(409);
    expect(secondBooking.body.error.code).toBe('MEMBER_OVERLAP');
  });

  it('allows sessions that only meet at an endpoint and rejects a real overlap', async () => {
    const professional = await registerProfessional();
    const memberA = await registerMember();
    const memberB = await registerMember();
    const start = futureSlot('UTC', 12, 0, 48 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 50 * 60 * 1000);
    await prisma.session.create({
      data: {
        memberId: memberA.res.body.data.user.id,
        professionalId: professional.res.body.data.user.id,
        startAt: start,
        endAt: end,
      },
    });
    await prisma.session.create({
      data: {
        memberId: memberB.res.body.data.user.id,
        professionalId: professional.res.body.data.user.id,
        startAt: end,
        endAt: new Date(end.getTime() + 50 * 60 * 1000),
      },
    });
    await expect(
      prisma.session.create({
        data: {
          memberId: memberA.res.body.data.user.id,
          professionalId: professional.res.body.data.user.id,
          startAt: new Date(start.getTime() + 20 * 60 * 1000),
          endAt: new Date(start.getTime() + 70 * 60 * 1000),
        },
      }),
    ).rejects.toThrow(/sessions_professional_no_overlap|sessions_member_no_overlap|23P01/);
  });
});

describe('availability', () => {
  it('rejects overlapping windows on the same weekday', async () => {
    const professional = await registerProfessional();
    const res = await setAvailability(professional.agent, professional.csrf, {
      windows: [
        { dayOfWeek: 1, startTime: '09:00', endTime: '12:00', enabled: true },
        { dayOfWeek: 1, startTime: '11:00', endTime: '15:00', enabled: true },
      ],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('OVERLAPPING_AVAILABILITY');
  });
});
