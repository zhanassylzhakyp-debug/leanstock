const { Prisma } = require('@prisma/client');
const { prisma } = require('../../config/database');
const { AppError } = require('../../middleware/errorHandler');
const {
  acquireReservationLock,
  releaseReservationLock,
  clearReservationLock,
} = require('../../services/reservation.lock');

const DEFAULT_TTL_SECONDS = 900; // 15 minutes

const createReservation = async ({
  productId,
  locationId,
  quantity,
  userId,
  tenantId,
  ttlSeconds = DEFAULT_TTL_SECONDS,
}) => {
  if (quantity <= 0) throw new AppError('Quantity must be positive', 400);

  const product = await prisma.product.findFirst({ where: { id: productId, tenantId } });
  if (!product) throw new AppError('Product not found', 404);

  const location = await prisma.location.findFirst({ where: { id: locationId, tenantId } });
  if (!location) throw new AppError('Location not found', 404);

  const lock = await acquireReservationLock(productId, locationId, ttlSeconds);

  try {
    return await prisma.$transaction(
      async (tx) => {
        const inv = await tx.inventory.findUnique({
          where: { productId_locationId: { productId, locationId } },
        });
        if (!inv || inv.quantity < quantity) {
          throw new AppError(
            `Insufficient stock. Available: ${inv?.quantity ?? 0}, Requested: ${quantity}`,
            409
          );
        }

        const pendingQty = await tx.reservation.aggregate({
          where: {
            productId,
            locationId,
            tenantId,
            status: 'PENDING',
            expiresAt: { gt: new Date() },
          },
          _sum: { quantity: true },
        });
        const reserved = pendingQty._sum.quantity || 0;
        if (inv.quantity - reserved < quantity) {
          throw new AppError(
            `Insufficient available stock after reservations. Free: ${inv.quantity - reserved}`,
            409
          );
        }

        const dec = await tx.inventory.updateMany({
          where: { id: inv.id, quantity: { gte: quantity } },
          data: { quantity: { decrement: quantity } },
        });
        if (dec.count !== 1) throw new AppError('Concurrent reservation conflict', 409);

        const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
        const reservation = await tx.reservation.create({
          data: {
            productId,
            locationId,
            quantity,
            userId,
            tenantId,
            expiresAt,
            status: 'PENDING',
          },
        });

        return reservation;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (err) {
    await releaseReservationLock(lock.key, lock.token);
    throw err;
  }
};

const confirmReservation = async (reservationId, userId, tenantId) => {
  return prisma.$transaction(async (tx) => {
    const reservation = await tx.reservation.findFirst({
      where: { id: reservationId, tenantId, userId },
    });
    if (!reservation) throw new AppError('Reservation not found', 404);
    if (reservation.status !== 'PENDING') {
      throw new AppError(`Cannot confirm reservation in status ${reservation.status}`, 409);
    }
    if (reservation.expiresAt <= new Date()) {
      throw new AppError('Reservation expired', 409);
    }

    const updated = await tx.reservation.update({
      where: { id: reservationId },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });

    await clearReservationLock(reservation.productId, reservation.locationId);

    return updated;
  });
};

const releaseReservation = async (reservationId, userId, tenantId, force = false) => {
  return prisma.$transaction(
    async (tx) => {
      const reservation = await tx.reservation.findFirst({
        where: {
          id: reservationId,
          tenantId,
          ...(force ? {} : { userId }),
        },
      });
      if (!reservation) throw new AppError('Reservation not found', 404);
      if (reservation.status === 'RELEASED' || reservation.status === 'EXPIRED') {
        return reservation;
      }
      if (reservation.status === 'CONFIRMED') {
        throw new AppError('Confirmed reservations cannot be released via API', 409);
      }

      await tx.inventory.upsert({
        where: {
          productId_locationId: {
            productId: reservation.productId,
            locationId: reservation.locationId,
          },
        },
        update: { quantity: { increment: reservation.quantity } },
        create: {
          productId: reservation.productId,
          locationId: reservation.locationId,
          quantity: reservation.quantity,
        },
      });

      return tx.reservation.update({
        where: { id: reservationId },
        data: { status: 'RELEASED', releasedAt: new Date() },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
};

const expireStaleReservations = async () => {
  const stale = await prisma.reservation.findMany({
    where: { status: 'PENDING', expiresAt: { lte: new Date() } },
    take: 100,
  });

  let expired = 0;
  for (const r of stale) {
    try {
      await prisma.$transaction(async (tx) => {
        const current = await tx.reservation.findUnique({ where: { id: r.id } });
        if (!current || current.status !== 'PENDING') return;

        await tx.inventory.upsert({
          where: {
            productId_locationId: {
              productId: current.productId,
              locationId: current.locationId,
            },
          },
          update: { quantity: { increment: current.quantity } },
          create: {
            productId: current.productId,
            locationId: current.locationId,
            quantity: current.quantity,
          },
        });

        await tx.reservation.update({
          where: { id: r.id },
          data: { status: 'EXPIRED', releasedAt: new Date() },
        });
      });
      await clearReservationLock(r.productId, r.locationId);
      expired++;
    } catch (e) {
      // continue with next
    }
  }
  return { scanned: stale.length, expired };
};

const listReservations = async (tenantId, { cursor, limit, status }) => {
  const take = limit + 1;
  const where = {
    tenantId,
    ...(status && { status }),
  };
  const rows = await prisma.reservation.findMany({
    where,
    take,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    orderBy: { createdAt: 'desc' },
  });
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;
  const total = await prisma.reservation.count({ where });
  return { data, nextCursor, total };
};

module.exports = {
  createReservation,
  confirmReservation,
  releaseReservation,
  expireStaleReservations,
  listReservations,
  DEFAULT_TTL_SECONDS,
};
