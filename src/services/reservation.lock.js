const redis = require('../config/redis');
const env = require('../config/env');
const { AppError } = require('../middleware/errorHandler');

const LOCK_PREFIX = 'leanstock:reservation:lock';
const memoryLocks = new Map();

const lockKey = (productId, locationId) => `${LOCK_PREFIX}:${productId}:${locationId}`;

const acquireMemoryLock = (key, ttlSeconds) => {
  const now = Date.now();
  const existing = memoryLocks.get(key);
  if (existing && existing.expiresAt > now) {
    throw new AppError('Inventory is locked by another reservation — try again shortly', 409);
  }
  const token = `${now}-${Math.random().toString(36).slice(2)}`;
  memoryLocks.set(key, { token, expiresAt: now + ttlSeconds * 1000 });
  return { key, token };
};

const releaseMemoryLock = (key, token) => {
  const current = memoryLocks.get(key);
  if (current?.token === token) memoryLocks.delete(key);
};

/**
 * Redis SET NX EX lock (Redlock-lite). Falls back to in-memory locks in test when Redis is unavailable.
 */
const acquireReservationLock = async (productId, locationId, ttlSeconds = 900) => {
  const key = lockKey(productId, locationId);
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (env.NODE_ENV === 'test') {
    return acquireMemoryLock(key, ttlSeconds);
  }

  try {
    const result = await redis.set(key, token, 'EX', ttlSeconds, 'NX');
    if (result !== 'OK') {
      throw new AppError('Inventory is locked by another reservation — try again shortly', 409);
    }
    return { key, token };
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (env.NODE_ENV === 'development') {
      return acquireMemoryLock(key, ttlSeconds);
    }
    throw err;
  }
};

const releaseReservationLock = async (key, token) => {
  if (env.NODE_ENV === 'test' || memoryLocks.has(key)) {
    releaseMemoryLock(key, token);
    return;
  }
  const current = await redis.get(key);
  if (current === token) await redis.del(key);
};

const extendReservationLock = async (key, token, ttlSeconds) => {
  if (env.NODE_ENV === 'test' || memoryLocks.has(key)) {
    const current = memoryLocks.get(key);
    if (current?.token !== token) return false;
    current.expiresAt = Date.now() + ttlSeconds * 1000;
    return true;
  }
  const current = await redis.get(key);
  if (current !== token) return false;
  await redis.expire(key, ttlSeconds);
  return true;
};

const clearReservationLock = async (productId, locationId) => {
  const key = lockKey(productId, locationId);
  if (env.NODE_ENV === 'test') {
    memoryLocks.delete(key);
    return;
  }
  await redis.del(key).catch(() => {});
};

module.exports = {
  acquireReservationLock,
  releaseReservationLock,
  extendReservationLock,
  clearReservationLock,
  lockKey,
};
