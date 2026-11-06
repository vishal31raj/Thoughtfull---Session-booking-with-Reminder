import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof AppError) {
    const body: { error: { code: string; message: string; details?: unknown } } = {
      error: { code: error.code, message: error.message },
    };
    if (error.details !== undefined) body.error.details = error.details;
    res.status(error.status).json(body);
    return;
  }
  logger.error('unhandled error', { name: error instanceof Error ? error.name : 'Error' });
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } });
}
