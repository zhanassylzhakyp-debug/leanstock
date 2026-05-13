const { Queue } = require('bullmq');
const { buildBullConnection } = require('../config/bullConnection');
const env = require('../config/env');
const logger = require('../config/logger');

const connection = buildBullConnection();

let emailQueue;

const getEmailQueue = () => {
  if (env.NODE_ENV === 'test' && env.ENABLE_TEST_QUEUES !== 'true') {
    return null;
  }
  if (!emailQueue) {
    emailQueue = new Queue(`${env.QUEUE_PREFIX}-email`, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 500,
        removeOnFail: 200,
      },
    });
  }
  return emailQueue;
};

/**
 * @param {{ type: string, to: string, payload: Record<string, unknown> }} job
 */
const enqueueEmailJob = async (job) => {
  const q = getEmailQueue();
  if (!q) {
    logger.debug('[queue] email job skipped (no queue in this process)', { type: job.type });
    return null;
  }
  return q.add('email', job, { jobId: `${job.type}:${job.to}:${Date.now()}` });
};

const getEmailQueueCounts = async () => {
  const q = getEmailQueue();
  if (!q) return null;
  return q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
};

module.exports = { enqueueEmailJob, getEmailQueue, getEmailQueueCounts, connection };
