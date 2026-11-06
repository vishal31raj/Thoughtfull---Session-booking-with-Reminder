import request from 'supertest';
import { DateTime } from 'luxon';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

export const app = createApp();

let sequence = 0;

export function uniqueEmail(prefix = 'user') {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}@example.com`;
}

export async function resetDatabase() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE notifications, reminders, sessions, availability, users RESTART IDENTITY CASCADE',
  );
}

export function cookieValue(res: request.Response, name: string): string {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const found = list.find((item) => item.startsWith(`${name}=`));
  if (!found) throw new Error(`missing cookie ${name}`);
  return decodeURIComponent(found.split(';')[0].slice(name.length + 1));
}

export async function csrfOf(agent: request.Agent) {
  const res = await agent.get('/api/auth/csrf');
  const token = res.body?.data?.csrfToken;
  if (typeof token === 'string' && token.length > 0) return token;
  return cookieValue(res, 'tf_csrf');
}

export function api() {
  return request.agent(app);
}

export async function register(agent: request.Agent, overrides: Record<string, unknown> = {}) {
  const csrf = await csrfOf(agent);
  const role = overrides.role === 'PROFESSIONAL' ? 'PROFESSIONAL' : 'MEMBER';
  const body = {
    name: role === 'PROFESSIONAL' ? 'Dr. Sarah Chen' : 'Anika Sharma',
    email: uniqueEmail(role === 'PROFESSIONAL' ? 'pro' : 'member'),
    password: 'Password123!',
    role,
    timezone: role === 'PROFESSIONAL' ? 'Asia/Singapore' : 'Asia/Kolkata',
    ...(role === 'PROFESSIONAL'
      ? {
          title: 'Clinical Psychologist',
          bio: 'Helps adults with stress, worry, and seasons of change in a steady way.',
          focusAreas: 'Anxiety, burnout',
        }
      : {}),
    ...overrides,
  };
  return agent.post('/api/auth/register').set('X-CSRF-Token', csrf).send(body);
}

async function mutate(agent: request.Agent, method: 'post' | 'patch', path: string, payload?: unknown) {
  const csrf = await csrfOf(agent);
  const call = agent[method](path).set('X-CSRF-Token', csrf);
  if (payload === undefined || payload === null) return call;
  return call.send(payload as object);
}

export function book(agent: request.Agent, professionalId: string, startAt: string) {
  return mutate(agent, 'post', '/api/sessions', { professionalId, startAt });
}

export function cancel(agent: request.Agent, sessionId: string) {
  return mutate(agent, 'patch', `/api/sessions/${sessionId}/cancel`);
}

export function reschedule(agent: request.Agent, sessionId: string, startAt: string) {
  return mutate(agent, 'patch', `/api/sessions/${sessionId}/reschedule`, { startAt });
}

export function weekWindows(enabled = [1, 2, 3, 4, 5, 6, 7], startTime = '09:00', endTime = '17:00') {
  return {
    windows: [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => ({
      dayOfWeek,
      startTime,
      endTime,
      enabled: enabled.includes(dayOfWeek),
    })),
  };
}

export async function registerProfessional(
  overrides: Record<string, unknown> = {},
) {
  const agent = request.agent(app);
  const csrf = await csrfOf(agent);
  const body = {
    name: 'Dr. Sarah Chen',
    email: uniqueEmail('pro'),
    password: 'Password123!',
    role: 'PROFESSIONAL',
    timezone: 'Asia/Singapore',
    title: 'Clinical Psychologist',
    bio: 'Helps adults with stress, worry, and seasons of change in a steady way.',
    focusAreas: 'Anxiety, burnout',
    ...overrides,
  };
  const res = await agent.post('/api/auth/register').set('X-CSRF-Token', csrf).send(body);
  return { agent, csrf, res, body };
}

export async function registerMember(overrides: Record<string, unknown> = {}) {
  const agent = request.agent(app);
  const csrf = await csrfOf(agent);
  const body = {
    name: 'Anika Sharma',
    email: uniqueEmail('member'),
    password: 'Password123!',
    role: 'MEMBER',
    timezone: 'Asia/Kolkata',
    ...overrides,
  };
  const res = await agent.post('/api/auth/register').set('X-CSRF-Token', csrf).send(body);
  return { agent, csrf, res, body };
}

export async function setAvailability(
  agent: request.Agent,
  csrfOrWindows?: string | Array<{ dayOfWeek: number; startTime: string; endTime: string; enabled: boolean }>,
  body = weekWindows(),
) {
  if (typeof csrfOrWindows === 'string') {
    return agent.put('/api/availability/me').set('X-CSRF-Token', csrfOrWindows).send(body);
  }
  const csrf = await csrfOf(agent);
  const payload = Array.isArray(csrfOrWindows) ? { windows: csrfOrWindows } : weekWindows();
  return agent.put('/api/availability/me').set('X-CSRF-Token', csrf).send(payload);
}

export function futureSlot(zone: string, hour: number, minute = 0, minLeadMs = 60 * 60 * 1000) {
  let day = DateTime.now().setZone(zone).startOf('day');
  for (let index = 0; index < 28; index += 1) {
    const local = day.set({ hour, minute, second: 0, millisecond: 0 });
    if (local.isValid && local.toUTC().toMillis() > Date.now() + minLeadMs) {
      return local.toUTC().toJSDate();
    }
    day = day.plus({ days: 1 });
  }
  throw new Error(`No future ${hour}:${minute} slot in ${zone}`);
}

export { prisma };
