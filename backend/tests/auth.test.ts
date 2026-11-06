import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { api, register, resetDatabase } from './helpers';

describe('authentication', () => {
  beforeEach(resetDatabase);

  it('registers a member, stores a bcrypt hash, and keeps the cookie session', async () => {
    const agent = api();
    const response = await register(agent, { name: 'Anika Sharma', email: 'anika@example.com', timezone: 'Asia/Kolkata' });
    expect(response.status).toBe(201);
    expect(response.body.data.user).toMatchObject({
      name: 'Anika Sharma',
      email: 'anika@example.com',
      role: 'MEMBER',
      timezone: 'Asia/Kolkata',
    });
    expect(response.body.data.user.passwordHash).toBeUndefined();
    expect(String(response.headers['set-cookie'])).toMatch(/tf_session=/);
    expect(String(response.headers['set-cookie'])).toMatch(/HttpOnly/i);

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'anika@example.com' } });
    expect(stored.passwordHash).not.toContain('Password123');
    expect(await bcrypt.compare('Password123!', stored.passwordHash)).toBe(true);
    expect((await agent.get('/api/auth/me')).body.data.email).toBe('anika@example.com');
  });

  it('rejects a duplicate email, a bad password, and an offset timezone', async () => {
    const professional = await register(api(), {
      role: 'PROFESSIONAL',
      email: 'sarah@example.com',
      name: 'Sarah Chen',
      timezone: 'Asia/Singapore',
    });
    expect(professional.status).toBe(201);

    const duplicate = await register(api(), { email: 'sarah@example.com' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('EMAIL_TAKEN');

    const agent = api();
    await register(agent, { email: 'login@example.com' });
    const token = (await agent.get('/api/auth/csrf')).body.data.csrfToken as string;
    const login = await agent.post('/api/auth/login').set('X-CSRF-Token', token).send({
      email: 'login@example.com',
      password: 'not-the-password',
    });
    expect(login.status).toBe(401);

    const offset = await register(api(), { timezone: 'UTC+5:30', email: 'offset@example.com' });
    expect(offset.status).toBe(400);
  });

  it('protects routes, enforces roles, and clears the session on logout', async () => {
    expect((await api().get('/api/sessions/my-sessions')).status).toBe(401);
    const member = api();
    await register(member);
    expect((await member.get('/api/availability/me')).status).toBe(403);

    const professional = api();
    await register(professional, { role: 'PROFESSIONAL' });
    const token = (await professional.get('/api/auth/csrf')).body.data.csrfToken as string;
    const booking = await professional.post('/api/sessions').set('X-CSRF-Token', token).send({
      professionalId: '00000000-0000-4000-8000-000000000000',
      startAt: '2026-12-01T04:30:00.000Z',
    });
    expect(booking.status).toBe(403);

    const logoutToken = (await member.get('/api/auth/csrf')).body.data.csrfToken as string;
    expect((await member.post('/api/auth/logout').set('X-CSRF-Token', logoutToken)).status).toBe(204);
    expect((await member.get('/api/auth/me')).status).toBe(401);
  });

  it('rejects a mutation without the CSRF header', async () => {
    const response = await api().post('/api/auth/login').send({ email: 'a@example.com', password: 'Password123!' });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF');
  });
});
