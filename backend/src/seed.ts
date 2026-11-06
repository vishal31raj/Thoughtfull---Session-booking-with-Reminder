import { DateTime } from 'luxon';
import { prisma } from './lib/prisma';
import { hashPassword } from './lib/password';
import { schedulingConfig } from './config';
import { generateSlots, type AvailabilityWindow } from './domain/scheduling';
import { replaceAvailability, type AvailabilityInput } from './services/availability.service';
import { reminderMessage } from './domain/reminders';
import { bookSession } from './services/session.service';

const PASSWORD = 'Thoughtfull123!';

interface ProfessionalSeed {
  name: string;
  email: string;
  timezone: string;
  title: string;
  focusAreas: string;
  bio: string;
  windows: AvailabilityInput[];
}

function week(days: Array<{ day: number; start: string; end: string }>): AvailabilityInput[] {
  return [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek) => {
    const match = days.find((day) => day.day === dayOfWeek);
    if (!match) {
      return { dayOfWeek, startTime: '09:00', endTime: '17:00', enabled: false };
    }
    return { dayOfWeek, startTime: match.start, endTime: match.end, enabled: true };
  });
}

const professionals: ProfessionalSeed[] = [
  {
    name: 'Dr. Sarah Chen',
    email: 'sarah.chen@thoughtfull.test',
    timezone: 'Asia/Singapore',
    title: 'Clinical Psychologist',
    focusAreas: 'Anxiety, burnout, life transitions',
    bio: 'Sarah offers structured conversations for adults navigating worry, burnout, and change. Sessions are calm, practical, and paced for real life.',
    windows: week([
      { day: 1, start: '09:00', end: '17:00' },
      { day: 2, start: '09:00', end: '17:00' },
      { day: 3, start: '10:00', end: '16:00' },
      { day: 4, start: '09:00', end: '17:00' },
      { day: 5, start: '09:00', end: '15:00' },
    ]),
  },
  {
    name: 'James Okonkwo',
    email: 'james.okonkwo@thoughtfull.test',
    timezone: 'Europe/London',
    title: 'Counsellor',
    focusAreas: 'Relationships, self-esteem, stress',
    bio: 'James works with people who want a steadier relationship with themselves and with the people close to them. He keeps the work collaborative.',
    windows: week([1, 2, 3, 4, 5].map((day) => ({ day, start: '10:00', end: '18:00' }))),
  },
  {
    name: 'Dr. Priya Nair',
    email: 'priya.nair@thoughtfull.test',
    timezone: 'Asia/Kolkata',
    title: 'Psychotherapist',
    focusAreas: 'Grief, family stress, young adults',
    bio: 'Priya supports clients through grief, family pressure, and the stretch of early adulthood. She leaves room for both feeling and next steps.',
    windows: week([
      ...[1, 2, 3, 4, 5].map((day) => ({ day, start: '09:00', end: '17:00' })),
      { day: 6, start: '09:00', end: '13:00' },
    ]),
  },
  {
    name: 'Dr. Elena Vargas',
    email: 'elena.vargas@thoughtfull.test',
    timezone: 'America/New_York',
    title: 'Licensed Therapist',
    focusAreas: 'Work stress, insomnia, mood',
    bio: 'Elena helps clients untangle work stress, sleep trouble, and low mood. She is direct, kind, and careful with time zones and follow-through.',
    windows: week([2, 3, 4, 5, 6].map((day) => ({ day, start: '08:00', end: '16:00' }))),
  },
  {
    name: 'Rahul Mehta',
    email: 'rahul.mehta@thoughtfull.test',
    timezone: 'Asia/Dubai',
    title: 'Wellbeing Coach',
    focusAreas: 'Habits, focus, career transitions',
    bio: 'Rahul coaches professionals through habit change and career transitions. Sessions stay concrete without turning into a productivity lecture.',
    windows: week([
      { day: 7, start: '09:00', end: '17:00' },
      { day: 1, start: '09:00', end: '17:00' },
      { day: 2, start: '09:00', end: '17:00' },
      { day: 3, start: '09:00', end: '17:00' },
      { day: 4, start: '09:00', end: '17:00' },
    ]),
  },
];

export async function seed() {
  const existing = await prisma.user.findUnique({ where: { email: 'member@thoughtfull.test' } });
  if (existing) return { seeded: false };

  const passwordHash = await hashPassword(PASSWORD);
  const member = await prisma.user.create({
    data: {
      name: 'Anika Sharma',
      email: 'member@thoughtfull.test',
      passwordHash,
      role: 'MEMBER',
      timezone: 'Asia/Kolkata',
    },
  });

  const created = [];
  for (const professional of professionals) {
    const user = await prisma.user.create({
      data: {
        name: professional.name,
        email: professional.email,
        passwordHash,
        role: 'PROFESSIONAL',
        timezone: professional.timezone,
        title: professional.title,
        bio: professional.bio,
        focusAreas: professional.focusAreas,
      },
    });
    await replaceAvailability(user.id, professional.windows);
    created.push({ user, windows: professional.windows.filter((window) => window.enabled) });
  }

  const sarah = created[0];
  const now = new Date();
  const slots = generateSlots({
    timezone: 'Asia/Singapore',
    windows: sarah.windows as AvailabilityWindow[],
    rangeStart: now,
    rangeEnd: new Date(now.getTime() + 21 * 24 * 60 * 60 * 1000),
    now,
    busy: [],
    config: schedulingConfig(),
  });
  const upcoming = slots.find((slot) => slot.startAt.getTime() >= now.getTime() + 48 * 60 * 60 * 1000);
  if (!upcoming) throw new Error('Seed could not find an upcoming slot');
  await bookSession({ memberId: member.id, professionalId: sarah.user.id, startAt: upcoming.startAt, now });

  const pastStart = DateTime.now()
    .setZone('Asia/Singapore')
    .minus({ days: 12 })
    .set({ hour: 10, minute: 0, second: 0, millisecond: 0 })
    .toUTC()
    .toJSDate();
  const past = await prisma.session.create({
    data: {
      memberId: member.id,
      professionalId: sarah.user.id,
      startAt: pastStart,
      endAt: new Date(pastStart.getTime() + 50 * 60 * 1000),
      status: 'BOOKED',
    },
  });
  const deliveredReminder = await prisma.reminder.create({
    data: {
      sessionId: past.id,
      recipientId: member.id,
      type: 'HOURS_24',
      scheduledAt: new Date(pastStart.getTime() - 24 * 60 * 60 * 1000),
      status: 'DELIVERED',
      deliveredAt: new Date(pastStart.getTime() - 24 * 60 * 60 * 1000),
    },
  });
  await prisma.notification.create({
    data: {
      userId: member.id,
      reminderId: deliveredReminder.id,
      message: reminderMessage({
        type: 'HOURS_24',
        otherPartyName: sarah.user.name,
        startAt: pastStart,
        recipientTimezone: member.timezone,
      }),
    },
  });

  const cancelledStart = DateTime.now()
    .setZone('Asia/Singapore')
    .minus({ days: 6 })
    .set({ hour: 14, minute: 0, second: 0, millisecond: 0 })
    .toUTC()
    .toJSDate();
  await prisma.session.create({
    data: {
      memberId: member.id,
      professionalId: created[1].user.id,
      startAt: cancelledStart,
      endAt: new Date(cancelledStart.getTime() + 50 * 60 * 1000),
      status: 'CANCELLED',
      cancelledAt: new Date(cancelledStart.getTime() - 3 * 24 * 60 * 60 * 1000),
      cancelledById: member.id,
    },
  });

  return { seeded: true };
}

if (require.main === module) {
  seed()
    .then((result) => {
      console.log(JSON.stringify(result));
      return prisma.$disconnect();
    })
    .catch(async (error) => {
      console.error(error instanceof Error ? error.message : 'seed failed');
      await prisma.$disconnect();
      process.exit(1);
    });
}
