const { Queue } = require('bullmq');
const { buildBullConnection } = require('../config/bullConnection');
const env = require('../config/env');
const logger = require('../config/logger');

const connection = buildBullConnection();

let maintenanceQueue;

const getMaintenanceQueue = () => {
  if (env.NODE_ENV === 'test' && env.ENABLE_TEST_QUEUES !== 'true') {
    return null;
  }
  if (!maintenanceQueue) {
    maintenanceQueue = new Queue(`${env.QUEUE_PREFIX}-maintenance`, {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 10000 },
        removeOnComplete: 200,
        removeOnFail: 100,
      },
    });
  }
  return maintenanceQueue;
};

const enqueueMaintenanceJob = async (name, data = {}) => {
  const q = getMaintenanceQueue();
  if (!q) {
    logger.debug('[queue] maintenance skipped', { name });
    return null;
  }
  return q.add(name, data, { jobId: `${name}:${Date.now()}` });
};

const getMaintenanceQueueCounts = async () => {
  const q = getMaintenanceQueue();
  if (!q) return null;
  return q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
};

module.exports = {
  enqueueMaintenanceJob,
  getMaintenanceQueue,
  getMaintenanceQueueCounts,
};
