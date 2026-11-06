import { beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/lib/password';
import { prisma } from '../src/lib/prisma';
import { resetDatabase } from './helpers';

describe('database constraints', () => {
  beforeEach(resetDatabase);

  it('installs gist exclusion constraints for active sessions', async () => {
    const extensions = await prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname FROM pg_extension WHERE extname = 'btree_gist'
    `;
    expect(extensions).toHaveLength(1);
    const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
      SELECT conname FROM pg_constraint
      WHERE conname IN ('sessions_professional_no_overlap', 'sessions_member_no_overlap', 'sessions_duration_50min')
    `;
    expect(constraints).toHaveLength(3);
  });

  it('rejects a second active overlap in SQL and allows it after cancellation', async () => {
    const passwordHash = await hashPassword('Password123!');
    const memberA = await prisma.user.create({
      data: { name: 'Member A', email: 'sql-a@example.com', passwordHash, role: 'MEMBER', timezone: 'UTC' },
    });
    const memberB = await prisma.user.create({
      data: { name: 'Member B', email: 'sql-b@example.com', passwordHash, role: 'MEMBER', timezone: 'UTC' },
    });
    const professional = await prisma.user.create({
      data: { name: 'Pro', email: 'sql-pro@example.com', passwordHash, role: 'PROFESSIONAL', timezone: 'UTC', title: 'Counsellor', bio: 'Fictional biography used only by automated tests.' },
    });
    const start = new Date('2026-12-20T10:00:00.000Z');
    const end = new Date('2026-12-20T10:50:00.000Z');
    await prisma.session.create({
      data: { memberId: memberA.id, professionalId: professional.id, startAt: start, endAt: end, status: 'BOOKED' },
    });
    await expect(
      prisma.session.create({
        data: { memberId: memberB.id, professionalId: professional.id, startAt: start, endAt: end, status: 'BOOKED' },
      }),
    ).rejects.toThrow();
    await prisma.session.updateMany({ data: { status: 'CANCELLED' } });
    const rebooked = await prisma.session.create({
      data: { memberId: memberB.id, professionalId: professional.id, startAt: start, endAt: end, status: 'BOOKED' },
    });
    expect(rebooked.status).toBe('BOOKED');
  });
});
