import { createApp } from './app';
import { config } from './config';
import { logger } from './lib/logger';
import { seed } from './seed';

async function main() {
  if (config.seedOnStart) {
    await seed();
  }
  const app = createApp();
  app.listen(config.port, () => {
    logger.info('api listening', { port: config.port });
  });
}

main().catch((error) => {
  logger.error('api failed to start', { name: error instanceof Error ? error.name : 'Error' });
  process.exit(1);
});
