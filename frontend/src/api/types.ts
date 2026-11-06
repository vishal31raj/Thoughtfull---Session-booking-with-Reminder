export type Role = 'MEMBER' | 'PROFESSIONAL';

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  timezone: string;
  title: string | null;
  bio: string | null;
  focusAreas: string | null;
  createdAt: string;
};

export type AvailabilityWindow = {
  id?: string;
  dayOfWeek: number;
  label?: string;
  startTime: string;
  endTime: string;
  enabled: boolean;
};

export type Professional = {
  id: string;
  name: string;
  title: string | null;
  bio: string | null;
  focusAreas: string | null;
  timezone: string;
  availability: AvailabilityWindow[];
};

export type Slot = {
  startAt: string;
  endAt: string;
  available: boolean;
};

export type Session = {
  id: string;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  status: 'BOOKED' | 'CANCELLED';
  displayStatus: 'upcoming' | 'past' | 'cancelled';
  member: { id: string; name: string };
  professional: { id: string; name: string; title: string | null };
  cancelledAt: string | null;
  permissions: { cancel: boolean; reschedule: boolean; cancelBlockedReason: string | null };
};

export type AppNotification = {
  id: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};
