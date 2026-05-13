const { URL } = require('url');
const env = require('./env');

/**
 * BullMQ requires maxRetriesPerRequest: null on the ioredis options.
 */
function buildBullConnection() {
  const u = new URL(env.REDIS_URL);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    username: u.username || undefined,
    password: u.password || undefined,
    maxRetriesPerRequest: null,
  };
}

module.exports = { buildBullConnection };
