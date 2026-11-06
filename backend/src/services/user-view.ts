export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  timezone: true,
  title: true,
  bio: true,
  focusAreas: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function toPublicUser(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  timezone: string;
  title: string | null;
  bio: string | null;
  focusAreas: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    timezone: user.timezone,
    title: user.title,
    bio: user.bio,
    focusAreas: user.focusAreas,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
