import { Router } from 'express';
import { asyncHandler } from '../lib/async-handler';
import { sendData } from '../lib/http';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { availabilitySchema } from './schemas';
import { getMyAvailability, replaceAvailability } from '../services/availability.service';

export const availabilityRouter = Router();

availabilityRouter.use(requireAuth, requireRole('PROFESSIONAL'));

availabilityRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    sendData(res, await getMyAvailability(req.authUser!.id));
  }),
);

availabilityRouter.put(
  '/me',
  validateBody(availabilitySchema),
  asyncHandler(async (req, res) => {
    sendData(res, await replaceAvailability(req.authUser!.id, req.body.windows));
  }),
);
