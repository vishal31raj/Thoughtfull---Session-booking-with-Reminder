import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { sendData } from './lib/http';
import { issueCsrf, requireCsrf } from './middleware/csrf';
import { errorHandler, notFound } from './middleware/error';
import { authRouter } from './routes/auth';
import { professionalsRouter } from './routes/professionals';
import { availabilityRouter } from './routes/availability';
import { sessionsRouter } from './routes/sessions';
import { notificationsRouter } from './routes/notifications';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use((req, _res, next) => {
    if (!config.isTest) logger.info('request', { method: req.method, path: req.path });
    next();
  });
  app.use(issueCsrf);
  app.use(requireCsrf);

  app.get('/api/health', async (_req, res, next) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      sendData(res, { status: 'ok' });
    } catch (error) {
      next(error);
    }
  });
  app.use('/api/auth', authRouter);
  app.use('/api/professionals', professionalsRouter);
  app.use('/api/availability', availabilityRouter);
  app.use('/api/sessions', sessionsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}
