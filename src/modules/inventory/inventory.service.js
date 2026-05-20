const { Prisma } = require('@prisma/client');
const { prisma } = require('../../config/database');
const { AppError } = require('../../middleware/errorHandler');
const { enqueueEmailJob } = require('../../queues/email.queue');

/**
 * Atomic inventory transfer (Prisma only — no raw SQL).
 * Uses Serializable isolation + conditional updateMany to avoid overselling under concurrency.
 */
const transferInventory = async ({ productId, fromLocationId, toLocationId, quantity, userId, tenantId }) => {
  if (fromLocationId === toLocationId) {
    throw new AppError('Source and destination locations must be different', 400);
  }
  if (quantity <= 0) {
    throw new AppError('Quantity must be positive', 400);
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const product = await tx.product.findFirst({
        where: { id: productId, tenantId },
      });
      if (!product) throw new AppError('Product not found in this tenant', 404);

      const [fromLoc, toLoc] = await Promise.all([
        tx.location.findFirst({ where: { id: fromLocationId, tenantId } }),
        tx.location.findFirst({ where: { id: toLocationId, tenantId } }),
      ]);
      if (!fromLoc) throw new AppError('Source location not found', 404);
      if (!toLoc) throw new AppError('Destination location not found', 404);

      const src = await tx.inventory.findUnique({
        where: { productId_locationId: { productId, locationId: fromLocationId } },
      });
      if (!src) throw new AppError('Source inventory record not found', 404);
      if (src.quantity < quantity) {
        throw new AppError(
          `Insufficient stock. Available: ${src.quantity}, Requested: ${quantity}`,
          409
        );
      }

      const decrement = await tx.inventory.updateMany({
        where: {
          id: src.id,
          quantity: { gte: quantity },
        },
        data: { quantity: { decrement: quantity } },
      });

      if (decrement.count !== 1) {
        throw new AppError('Insufficient stock or concurrent update — try again', 409);
      }

      await tx.inventory.upsert({
        where: { productId_locationId: { productId, locationId: toLocationId } },
        update: { quantity: { increment: quantity } },
        create: { productId, locationId: toLocationId, quantity },
      });

      const fromAfter = await tx.inventory.findUnique({
        where: { productId_locationId: { productId, locationId: fromLocationId } },
      });

      const log = await tx.transferLog.create({
        data: {
          productId,
          fromLocationId,
          toLocationId,
          quantity,
          performedBy: userId,
          tenantId,
        },
      });

      return {
        transferId: log.id,
        product: { id: product.id, name: product.name, sku: product.sku },
        from: {
          location: fromLoc.name,
          quantityBefore: src.quantity,
          quantityAfter: fromAfter.quantity,
        },
        to: { location: toLoc.name, quantityAdded: quantity },
      };
    },
    {
      maxWait: 5000,
      timeout: 15000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (user?.email) {
    await enqueueEmailJob({
      type: 'TRANSFER_COMPLETE',
      to: user.email,
      payload: {
        transferId: result.transferId,
        sku: result.product.sku,
        name: result.product.name,
        quantity,
        from: result.from.location,
        to: result.to.location,
      },
    });
  }

  return result;
};

/**
 * Record a sale / outbound movement: decrements stock and updates lastSoldAt (lean / dead-stock signal).
 */
const recordSale = async ({ productId, locationId, quantity, tenantId }) => {
  if (quantity <= 0) throw new AppError('Quantity must be positive', 400);

  return prisma.$transaction(
    async (tx) => {
      const product = await tx.product.findFirst({ where: { id: productId, tenantId } });
      if (!product) throw new AppError('Product not found in this tenant', 404);

      const location = await tx.location.findFirst({ where: { id: locationId, tenantId } });
      if (!location) throw new AppError('Location not found', 404);

      const inv = await tx.inventory.findUnique({
        where: { productId_locationId: { productId, locationId } },
      });
      if (!inv) throw new AppError('No inventory at this location', 404);
      if (inv.quantity < quantity) {
        throw new AppError(`Insufficient stock. Available: ${inv.quantity}`, 409);
      }

      const dec = await tx.inventory.updateMany({
        where: { id: inv.id, quantity: { gte: quantity } },
        data: {
          quantity: { decrement: quantity },
          lastSoldAt: new Date(),
        },
      });
      if (dec.count !== 1) throw new AppError('Concurrent sale conflict — try again', 409);

      const after = await tx.inventory.findUnique({
        where: { productId_locationId: { productId, locationId } },
      });

      return {
        product: { id: product.id, sku: product.sku, name: product.name },
        location: { id: location.id, name: location.name },
        quantitySold: quantity,
        quantityRemaining: after.quantity,
        lastSoldAt: after.lastSoldAt,
      };
    },
    {
      maxWait: 5000,
      timeout: 10000,
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }
  );
};

const setInventory = async ({ productId, locationId, quantity, tenantId }) => {
  const product = await prisma.product.findFirst({ where: { id: productId, tenantId } });
  if (!product) throw new AppError('Product not found', 404);

  const location = await prisma.location.findFirst({ where: { id: locationId, tenantId } });
  if (!location) throw new AppError('Location not found', 404);

  const inv = await prisma.inventory.upsert({
    where: { productId_locationId: { productId, locationId } },
    update: { quantity },
    create: { productId, locationId, quantity },
  });

  return inv;
};

const getInventoryReport = async (tenantId, { cursor, limit }) => {
  const take = limit + 1;
  const rows = await prisma.inventory.findMany({
    where: { product: { tenantId } },
    take,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    orderBy: { id: 'asc' },
    include: {
      product: { select: { id: true, sku: true, name: true, price: true } },
      location: { select: { id: true, name: true } },
    },
  });

  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;
  const total = await prisma.inventory.count({ where: { product: { tenantId } } });

  return { data, nextCursor, total };
};

const calculateDecayDiscount = (lastSoldAt, rules = {}) => {
  const {
    tier1Days = 30,
    tier2Days = 60,
    tier3Days = 90,
    tier1Discount = 10,
    tier2Discount = 25,
    tier3Discount = 40,
    maxDiscount = 50,
  } = rules;

  if (!lastSoldAt) return 0;
  const daysSinceLastSold = Math.floor(
    (Date.now() - new Date(lastSoldAt).getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysSinceLastSold >= tier3Days) return Math.min(tier3Discount, maxDiscount);
  if (daysSinceLastSold >= tier2Days) return Math.min(tier2Discount, maxDiscount);
  if (daysSinceLastSold >= tier1Days) return Math.min(tier1Discount, maxDiscount);
  return 0;
};

const applyDeadStockDecay = async () => {
  const allInventory = await prisma.inventory.findMany({
    where: { quantity: { gt: 0 } },
    include: { product: { select: { tenantId: true } } },
  });

  const rulesCache = new Map();
  let updated = 0;

  for (const inv of allInventory) {
    const tenantId = inv.product.tenantId;
    if (!rulesCache.has(tenantId)) {
      const rules = await prisma.tenantDecayRules.findUnique({ where: { tenantId } });
      rulesCache.set(tenantId, rules || {});
    }
    const rules = rulesCache.get(tenantId);
    const ruleObj = rules.id
      ? {
          tier1Days: rules.tier1Days,
          tier2Days: rules.tier2Days,
          tier3Days: rules.tier3Days,
          tier1Discount: Number(rules.tier1Discount),
          tier2Discount: Number(rules.tier2Discount),
          tier3Discount: Number(rules.tier3Discount),
          maxDiscount: Number(rules.maxDiscount),
        }
      : {};

    const newDiscount = calculateDecayDiscount(inv.lastSoldAt, ruleObj);
    if (newDiscount !== Number(inv.discountPct)) {
      await prisma.inventory.update({ where: { id: inv.id }, data: { discountPct: newDiscount } });
      updated++;
    }
  }
  return { processed: allInventory.length, updated };
};

/**
 * Find rows where quantity <= minQuantity; enqueue one LOW_STOCK email per row (async).
 */
const scanLowStockAndNotify = async () => {
  const low = await prisma.inventory.findMany({
    where: {
      quantity: { gt: 0 },
      minQuantity: { gt: 0 },
    },
    include: {
      product: { select: { sku: true, name: true, tenantId: true } },
      location: { select: { name: true } },
    },
  });

  const alerts = low.filter((row) => row.quantity <= row.minQuantity);
  let queued = 0;

  for (const row of alerts) {
    const admins = await prisma.user.findMany({
      where: {
        tenantId: row.product.tenantId,
        role: { in: ['ADMIN', 'MANAGER'] },
        isActive: true,
        emailVerifiedAt: { not: null },
      },
      select: { email: true },
    });
    const uniqueEmails = [...new Set(admins.map((u) => u.email))];
    for (const to of uniqueEmails) {
      await enqueueEmailJob({
        type: 'LOW_STOCK_ALERT',
        to,
        payload: {
          sku: row.product.sku,
          name: row.product.name,
          location: row.location.name,
          quantity: row.quantity,
          minQuantity: row.minQuantity,
        },
      });
      queued++;
    }
  }

  return { scanned: low.length, alertRows: alerts.length, emailsQueued: queued };
};

module.exports = {
  transferInventory,
  recordSale,
  setInventory,
  getInventoryReport,
  calculateDecayDiscount,
  applyDeadStockDecay,
  scanLowStockAndNotify,
};
