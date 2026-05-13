const app = require('./app');
const { connectDB, disconnectDB } = require('./config/database');
const redis = require('./config/redis');
const { startScheduledJobs } = require('./jobs/deadStockDecay.job');
const env = require('./config/env');
const logger = require('./config/logger');

const PORT = env.PORT || 3000;

const start = async () => {
  await connectDB();

  if (env.NODE_ENV !== 'test') {
    try {
      await redis.connect();
      logger.info('Redis connected for rate limiting / queues');
    } catch (e) {
      logger.error('Redis connection failed', { error: e.message });
      process.exit(1);
    }
    startScheduledJobs();
  }

  const server = app.listen(PORT, () => {
    logger.info(`LeanStock API on port ${PORT}`);
    logger.info(`Swagger: http://localhost:${PORT}/docs`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await disconnectDB();
      if (env.NODE_ENV !== 'test') {
        await redis.quit();
      }
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
