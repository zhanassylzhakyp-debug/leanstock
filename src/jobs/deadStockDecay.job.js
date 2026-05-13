const cron = require('node-cron');
const { enqueueMaintenanceJob } = require('../queues/maintenance.queue');
const env = require('../config/env');
const logger = require('../config/logger');

/**
 * Планировщик фоновых задач (ставит jobs в BullMQ / Redis):
 * - dead-stock-decay: ежедневно 02:00
 * - low-stock-scan: ежедневно 08:00
 *
 * Обработка: процесс `npm run worker`.
 */
const startScheduledJobs = () => {
  if (env.NODE_ENV === 'test') {
    logger.info('Scheduled maintenance enqueue disabled in test');
    return;
  }

  cron.schedule('0 2 * * *', async () => {
    logger.info('Enqueue dead-stock-decay');
    try {
      await enqueueMaintenanceJob('dead-stock-decay');
    } catch (err) {
      logger.error('enqueue dead-stock-decay failed', { error: err.message });
    }
  });

  cron.schedule('0 8 * * *', async () => {
    logger.info('Enqueue low-stock-scan');
    try {
      await enqueueMaintenanceJob('low-stock-scan');
    } catch (err) {
      logger.error('enqueue low-stock-scan failed', { error: err.message });
    }
  });

  logger.info('Cron: 02:00 dead-stock-decay, 08:00 low-stock-scan → Redis queues');
};

module.exports = { startScheduledJobs };
