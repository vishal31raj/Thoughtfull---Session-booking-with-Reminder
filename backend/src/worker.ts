import { config } from './config';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { processDueReminders } from './services/reminder-worker';

let running = true;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loop() {
  logger.info('reminder worker started', { pollMs: config.workerPollMs });
  while (running) {
    try {
      const count = await processDueReminders();
      if (count > 0) logger.info('processed reminders', { count });
    } catch (error) {
      logger.error('reminder poll failed', { name: error instanceof Error ? error.name : 'Error' });
    }
    await sleep(config.workerPollMs);
  }
}

function shutdown() {
  running = false;
  prisma
    .$disconnect()
    .catch(() => undefined)
    .finally(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

loop().catch((error) => {
  logger.error('reminder worker crashed', { name: error instanceof Error ? error.name : 'Error' });
  process.exit(1);
});
