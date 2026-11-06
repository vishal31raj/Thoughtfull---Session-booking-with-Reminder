import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async-handler';
import { sendData } from '../lib/http';
import { AppError } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { parsePage } from './schemas';
import { getProfessional, getProfessionalSlots, listProfessionals } from '../services/professional.service';

export const professionalsRouter = Router();

professionalsRouter.use(requireAuth);

professionalsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const page = parsePage(req.query as Record<string, unknown>);
    if ('error' in page) throw new AppError(400, 'VALIDATION', page.error);
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;
    const result = await listProfessionals(page.page, page.pageSize, query || undefined);
    sendData(res, result.professionals, 200, { page: page.page, pageSize: page.pageSize, total: result.total });
  }),
);

professionalsRouter.get(
  '/:id/slots',
  asyncHandler(async (req, res) => {
    const params = z
      .object({
        from: z.string().datetime({ offset: true }).optional(),
        to: z.string().datetime({ offset: true }).optional(),
        excludeSessionId: z.string().uuid().optional(),
      })
      .safeParse(req.query);
    if (!params.success) throw new AppError(400, 'VALIDATION', 'Invalid slot query.');
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError(400, 'VALIDATION', 'Invalid professional id.');
    const data = await getProfessionalSlots({
      professionalId: id.data,
      requesterId: req.authUser!.id,
      from: params.data.from ? new Date(params.data.from) : undefined,
      to: params.data.to ? new Date(params.data.to) : undefined,
      excludeSessionId: params.data.excludeSessionId,
    });
    sendData(res, data);
  }),
);

professionalsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) throw new AppError(400, 'VALIDATION', 'Invalid professional id.');
    sendData(res, await getProfessional(id.data));
  }),
);
