const { prisma } = require('../../config/database');
const { AppError } = require('../../middleware/errorHandler');

const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_LEAD_TIME_DAYS = 7;

/**
 * Moving-average forecast: avg daily outbound from transfer logs + sales proxy.
 * reorderQty = max(0, avgDailyUsage * leadTime - availableStock + minQuantity)
 */
const computeMovingAverageForecast = (movements, windowDays, leadTimeDays, currentQty, minQuantity) => {
  const totalMoved = movements.reduce((sum, m) => sum + m.quantity, 0);
  const avgDaily = windowDays > 0 ? totalMoved / windowDays : 0;
  const targetStock = Math.ceil(avgDaily * leadTimeDays) + minQuantity;
  const reorderQty = Math.max(0, targetStock - currentQty);
  return {
    avgDailyUsage: Number(avgDaily.toFixed(2)),
    targetStock,
    reorderQty,
    windowDays,
    leadTimeDays,
    totalMoved,
  };
};

const getProductForecast = async (tenantId, productId, options = {}) => {
  const windowDays = options.windowDays || DEFAULT_WINDOW_DAYS;
  const leadTimeDays = options.leadTimeDays || DEFAULT_LEAD_TIME_DAYS;
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

  const product = await prisma.product.findFirst({
    where: { id: productId, tenantId, isActive: true },
    include: {
      inventory: { include: { location: { select: { id: true, name: true } } } },
    },
  });
  if (!product) throw new AppError('Product not found', 404);

  const movements = await prisma.transferLog.findMany({
    where: { productId, tenantId, createdAt: { gte: since } },
    select: { quantity: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });

  const totalQty = product.inventory.reduce((s, i) => s + i.quantity, 0);
  const minQty = product.inventory.reduce((s, i) => s + i.minQuantity, 0);
  const forecast = computeMovingAverageForecast(
    movements,
    windowDays,
    leadTimeDays,
    totalQty,
    minQty
  );

  return {
    product: { id: product.id, sku: product.sku, name: product.name },
    currentStock: totalQty,
    minQuantity: minQty,
    ...forecast,
    byLocation: product.inventory.map((inv) => ({
      location: inv.location,
      quantity: inv.quantity,
      minQuantity: inv.minQuantity,
      suggestedReorder: Math.max(0, Math.ceil(forecast.avgDailyUsage * leadTimeDays) + inv.minQuantity - inv.quantity),
    })),
  };
};

const getTenantForecast = async (tenantId, { cursor, limit, windowDays, leadTimeDays }) => {
  const take = limit + 1;
  const products = await prisma.product.findMany({
    where: { tenantId, isActive: true },
    take,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    orderBy: { id: 'asc' },
    select: { id: true, sku: true, name: true },
  });

  const hasMore = products.length > limit;
  const slice = hasMore ? products.slice(0, limit) : products;
  const nextCursor = hasMore ? slice[slice.length - 1].id : null;

  const forecasts = [];
  for (const p of slice) {
    forecasts.push(await getProductForecast(tenantId, p.id, { windowDays, leadTimeDays }));
  }

  const total = await prisma.product.count({ where: { tenantId, isActive: true } });
  return { data: forecasts, nextCursor, total };
};

module.exports = {
  computeMovingAverageForecast,
  getProductForecast,
  getTenantForecast,
};
