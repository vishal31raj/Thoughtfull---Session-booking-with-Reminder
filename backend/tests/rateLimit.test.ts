import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createAuthRateLimiter } from '../src/middleware/rateLimit';

describe('auth rate limit', () => {
  it('returns 429 after the configured number of attempts', async () => {
    const app = express();
    app.use(express.json());
    app.post('/login', createAuthRateLimiter(2, 60_000), (_req, res) => {
      res.status(401).json({ ok: false });
    });
    const agent = request.agent(app);
    expect((await agent.post('/login').send({})).status).toBe(401);
    expect((await agent.post('/login').send({})).status).toBe(401);
    const blocked = await agent.post('/login').send({});
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});
