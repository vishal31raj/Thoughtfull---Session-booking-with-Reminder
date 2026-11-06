import type { NextFunction, Request, Response } from 'express';
import type { ZodSchema } from 'zod';
import { AppError } from '../lib/errors';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      next(
        new AppError(
          400,
          'VALIDATION',
          'Check the submitted fields.',
          parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        ),
      );
      return;
    }
    req.body = parsed.data;
    next();
  };
}
