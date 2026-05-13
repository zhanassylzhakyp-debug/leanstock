const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const redis = require('../config/redis');

const jsonMessage = (msg) => ({
  success: false,
  error: { message: msg },
});

const useRedisStore = process.env.NODE_ENV !== 'test';

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('Слишком много попыток — подождите минуту'),
  ...(useRedisStore
    ? {
        store: new RedisStore({
          sendCommand: (...args) => redis.call(...args),
          prefix: 'rl:auth:',
        }),
        keyGenerator: (req) => req.ip,
      }
    : {}),
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('Слишком много запросов'),
  ...(useRedisStore
    ? {
        store: new RedisStore({
          sendCommand: (...args) => redis.call(...args),
          prefix: 'rl:api:',
        }),
        keyGenerator: (req) => req.ip,
      }
    : {}),
});

const strictPublicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: jsonMessage('Слишком много запросов к этому методу'),
  ...(useRedisStore
    ? {
        store: new RedisStore({
          sendCommand: (...args) => redis.call(...args),
          prefix: 'rl:strict:',
        }),
        keyGenerator: (req) => req.ip,
      }
    : {}),
});

module.exports = { authLimiter, apiLimiter, strictPublicLimiter };
