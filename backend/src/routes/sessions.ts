import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { sendData } from '../lib/http';
import { AppError } from '../lib/errors';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { bookSessionSchema, parsePage, rescheduleSchema } from './schemas';
import {
  bookSession,
  cancelSession,
  getSessionForUser,
  listMySessions,
  rescheduleSession,
} from '../services/session.service';

export const sessionsRouter = Router();

sessionsRouter.use(requireAuth);

sessionsRouter.post(
  '/',
  requireRole('MEMBER'),
  validateBody(bookSessionSchema),
  asyncHandler(async (req, res) => {
    const id = await bookSession({
      memberId: req.authUser!.id,
      professionalId: req.body.professionalId,
      startAt: new Date(req.body.startAt),
    });
    const session = await getSessionForUser(id, req.authUser!);
    sendData(res, session, 201);
  }),
);

sessionsRouter.get(
  '/my-sessions',
  asyncHandler(async (req, res) => {
    const page = parsePage(req.query as Record<string, unknown>);
    if ('error' in page) throw new AppError(400, 'VALIDATION', page.error);
    const view = z.enum(['upcoming', 'past', 'cancelled']).optional().safeParse(req.query.status);
    if (!view.success) throw new AppError(400, 'VALIDATION', 'status must be upcoming, past, or cancelled.');
    const result = await listMySessions({
      viewer: req.authUser!,
      view: view.data,
      page: page.page,
      pageSize: page.pageSize,
    });
    sendData(res, result.sessions, 200, { page: page.page, pageSize: page.pageSize, total: result.total });
  }),
);

sessionsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError(400, 'VALIDATION', 'Invalid session id.');
    sendData(res, await getSessionForUser(id.data, req.authUser!));
  }),
);

sessionsRouter.patch(
  '/:id/cancel',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError(400, 'VALIDATION', 'Invalid session id.');
    sendData(res, await cancelSession({ sessionId: id.data, viewer: req.authUser! }));
  }),
);

sessionsRouter.patch(
  '/:id/reschedule',
  requireRole('MEMBER'),
  validateBody(rescheduleSchema),
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError(400, 'VALIDATION', 'Invalid session id.');
    await rescheduleSession({
      sessionId: id.data,
      memberId: req.authUser!.id,
      startAt: new Date(req.body.startAt),
    });
    sendData(res, await getSessionForUser(id.data, req.authUser!));
  }),
);
