import type { Response } from 'express';

export function sendData(res: Response, data: unknown, status = 200, meta?: unknown) {
  if (meta === undefined) {
    res.status(status).json({ data });
    return;
  }
  res.status(status).json({ data, meta });
}
