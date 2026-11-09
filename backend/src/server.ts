import { pool } from './config/db';
import { env } from './config/env';
import { createApp } from './app';
import { startScheduler } from './services/scheduler.service';
import { logger } from './utils/logger';

const server = createApp().listen(env.PORT, () => logger.info(`API listening on port ${env.PORT} (${env.NODE_ENV})`));
const stopScheduler = env.SCHEDULER_ENABLED ? startScheduler() : () => undefined;

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  stopScheduler();
  server.close(() => { void pool.end().finally(() => process.exit(0)); });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled rejection'));
