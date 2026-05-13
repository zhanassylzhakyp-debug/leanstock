/**
 * Запуск фоновых воркеров BullMQ (очереди email + maintenance).
 * Команда: npm run worker
 */
require('../config/env');
const { Worker } = require('bullmq');
const { buildBullConnection } = require('../config/bullConnection');
const env = require('../config/env');
const { connectDB, disconnectDB } = require('../config/database');
const { processEmailJob } = require('./email.processor');
const { processMaintenanceJob } = require('./maintenance.processor');
const logger = require('../config/logger');

const connection = buildBullConnection();

const start = async () => {
  await connectDB();

  const prefix = env.QUEUE_PREFIX;

  const emailWorker = new Worker(`${prefix}-email`, processEmailJob, {
    connection,
    concurrency: 5,
  });
  emailWorker.on('completed', (job) => logger.info('[worker] email done', { id: job.id }));
  emailWorker.on('failed', (job, err) =>
    logger.error('[worker] email failed', { id: job?.id, error: err.message })
  );

  const maintenanceWorker = new Worker(`${prefix}-maintenance`, processMaintenanceJob, {
    connection,
    concurrency: 2,
  });
  maintenanceWorker.on('completed', (job) =>
    logger.info('[worker] maintenance done', { id: job.id, name: job.name })
  );
  maintenanceWorker.on('failed', (job, err) =>
    logger.error('[worker] maintenance failed', { id: job?.id, error: err.message })
  );

  logger.info(`Workers listening on queues ${prefix}-email, ${prefix}-maintenance`);

  const shutdown = async (signal) => {
    logger.info(`${signal} — closing workers`);
    await emailWorker.close();
    await maintenanceWorker.close();
    await disconnectDB();
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
