import { afterAll, beforeEach } from 'vitest';
import { clock } from '../src/lib/clock';
import { prisma, resetDatabase } from './helpers';

beforeEach(async () => {
  clock.now = () => new Date();
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});
