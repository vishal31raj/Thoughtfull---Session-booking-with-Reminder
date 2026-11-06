import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { sendData } from '../lib/http';
import { AppError } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { parsePage } from './schemas';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadCount,
} from '../services/notification.service';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    sendData(res, await unreadCount(req.authUser!.id));
  }),
);

notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = parsePage(req.query as Record<string, unknown>);
    if ('error' in page) throw new AppError(400, 'VALIDATION', page.error);
    const unreadOnly = req.query.unreadOnly === 'true';
    const result = await listNotifications({
      userId: req.authUser!.id,
      page: page.page,
      pageSize: page.pageSize,
      unreadOnly,
    });
    sendData(res, result.notifications, 200, {
      page: page.page,
      pageSize: page.pageSize,
      total: result.total,
      unreadCount: result.unreadCount,
    });
  }),
);

notificationsRouter.patch(
  '/read-all',
  asyncHandler(async (req, res) => {
    sendData(res, await markAllNotificationsRead(req.authUser!.id));
  }),
);

notificationsRouter.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError(400, 'VALIDATION', 'Invalid notification id.');
    sendData(res, await markNotificationRead(req.authUser!.id, id.data));
  }),
);
