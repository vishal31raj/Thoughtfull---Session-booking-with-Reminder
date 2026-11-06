import { describe, expect, it } from 'vitest';
import { futureSlot, registerMember, registerProfessional, setAvailability, weekWindows } from './helpers';

describe('privacy', () => {
  it('hides other people sessions and booking identities', async () => {
    const professional = await registerProfessional({ timezone: 'Asia/Singapore' });
    const otherProfessional = await registerProfessional({ name: 'Other Professional', timezone: 'Asia/Singapore' });
    await setAvailability(professional.agent, professional.csrf, weekWindows([1, 2, 3, 4, 5, 6, 7], '08:00', '18:00'));
    const member = await registerMember({ name: 'Secret Member Zephyr' });
    const otherMember = await registerMember({ name: 'Hidden Member Quill' });
    const startAt = futureSlot('Asia/Singapore', 10, 0, 26 * 60 * 60 * 1000);
    const booked = await member.agent.post('/api/sessions').set('X-CSRF-Token', member.csrf).send({
      professionalId: professional.res.body.data.user.id,
      startAt: startAt.toISOString(),
    });
    expect(booked.status).toBe(201);

    const stolen = await otherMember.agent.get(`/api/sessions/${booked.body.data.id}`);
    expect(stolen.status).toBe(404);
    const stolenCancel = await otherMember.agent
      .patch(`/api/sessions/${booked.body.data.id}/cancel`)
      .set('X-CSRF-Token', otherMember.csrf);
    expect(stolenCancel.status).toBe(404);

    const professionalList = await otherProfessional.agent.get('/api/sessions/my-sessions');
    expect(professionalList.status).toBe(200);
    expect(professionalList.body.data).toEqual([]);

    const ownList = await professional.agent.get('/api/sessions/my-sessions');
    expect(ownList.body.data).toHaveLength(1);
    expect(ownList.body.data[0].member.name).toBe('Secret Member Zephyr');

    const slots = await otherMember.agent.get(`/api/professionals/${professional.res.body.data.user.id}/slots`);
    const serialized = JSON.stringify(slots.body);
    expect(serialized).not.toContain('Secret Member Zephyr');
    expect(serialized).not.toContain(member.body.email);
    expect(serialized).not.toContain(member.res.body.data.user.id);
    const taken = (slots.body.data.slots as Array<{ startAt: string; available: boolean }>).find(
      (slot) => slot.startAt === startAt.toISOString(),
    );
    expect(taken?.available).toBe(false);
  });
});
