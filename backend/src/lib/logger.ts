import { config } from '../config';

function write(level: 'info' | 'error', message: string, meta?: Record<string, unknown>) {
  if (config.isTest) return;
  const safe: Record<string, unknown> = { ...meta };
  for (const key of ['password', 'passwordHash', 'authorization', 'cookie', 'token']) {
    if (key in safe) delete safe[key];
  }
  console.log(JSON.stringify({ level, message, ...safe, time: new Date().toISOString() }));
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    write('info', message, meta);
  },
  error(message: string, meta?: Record<string, unknown>) {
    write('error', message, meta);
  },
};
