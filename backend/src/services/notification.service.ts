import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';

export async function listNotifications(input: {
  userId: string;
  page: number;
  pageSize: number;
  unreadOnly?: boolean;
}) {
  const where = {
    userId: input.userId,
    ...(input.unreadOnly ? { readAt: null } : {}),
  };
  const [total, unreadCount, rows] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: input.userId, readAt: null } }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
  ]);
  return {
    total,
    unreadCount,
    notifications: rows.map(toNotificationDto),
  };
}

export async function unreadCount(userId: string) {
  const count = await prisma.notification.count({ where: { userId, readAt: null } });
  return { count };
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const existing = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!existing || existing.userId !== userId) {
    throw new AppError(404, 'NOT_FOUND', 'Notification not found.');
  }
  if (existing.readAt) return toNotificationDto(existing);
  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() },
  });
  return toNotificationDto(updated);
}

export async function markAllNotificationsRead(userId: string) {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
}

function toNotificationDto(notification: {
  id: string;
  message: string;
  readAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: notification.id,
    message: notification.message,
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}
