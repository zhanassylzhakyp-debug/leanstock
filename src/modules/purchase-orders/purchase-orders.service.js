const { Prisma } = require('@prisma/client');
const { prisma } = require('../../config/database');
const { AppError } = require('../../middleware/errorHandler');
const { enqueueEmailJob } = require('../../queues/email.queue');

const generatePoNumber = async (tenantId) => {
  const count = await prisma.purchaseOrder.count({ where: { tenantId } });
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `PO-${date}-${String(count + 1).padStart(4, '0')}`;
};

const createPurchaseOrder = async (tenantId, userId, { supplierId, locationId, notes, lines }) => {
  if (!lines?.length) throw new AppError('At least one line item is required', 400);

  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId, tenantId, isActive: true },
  });
  if (!supplier) throw new AppError('Supplier not found', 404);

  const location = await prisma.location.findFirst({ where: { id: locationId, tenantId } });
  if (!location) throw new AppError('Location not found', 404);

  for (const line of lines) {
    const product = await prisma.product.findFirst({
      where: { id: line.productId, tenantId, isActive: true },
    });
    if (!product) throw new AppError(`Product ${line.productId} not found`, 404);
    if (line.quantity <= 0) throw new AppError('Line quantity must be positive', 400);
  }

  const poNumber = await generatePoNumber(tenantId);

  return prisma.purchaseOrder.create({
    data: {
      poNumber,
      supplierId,
      locationId,
      tenantId,
      notes,
      createdBy: userId,
      lines: {
        create: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          unitCost: l.unitCost,
        })),
      },
    },
    include: {
      lines: { include: { purchaseOrder: false } },
      supplier: true,
    },
  });
};

const listPurchaseOrders = async (tenantId, { cursor, limit, status }) => {
  const take = limit + 1;
  const where = { tenantId, ...(status && { status }) };
  const rows = await prisma.purchaseOrder.findMany({
    where,
    take,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    orderBy: { createdAt: 'desc' },
    include: {
      supplier: { select: { id: true, name: true, email: true } },
      lines: true,
    },
  });
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;
  const total = await prisma.purchaseOrder.count({ where });
  return { data, nextCursor, total };
};

const getPurchaseOrder = async (tenantId, id) => {
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, tenantId },
    include: {
      supplier: true,
      lines: true,
    },
  });
  if (!po) throw new AppError('Purchase order not found', 404);
  return po;
};

const sendPurchaseOrder = async (tenantId, id, userEmail) => {
  const po = await getPurchaseOrder(tenantId, id);
  if (po.status !== 'DRAFT') {
    throw new AppError(`Cannot send PO in status ${po.status}`, 409);
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id },
    data: { status: 'SENT', sentAt: new Date() },
    include: { supplier: true, lines: true },
  });

  const productIds = updated.lines.map((l) => l.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, sku: true, name: true },
  });
  const productMap = Object.fromEntries(products.map((p) => [p.id, p]));

  const recipients = [userEmail];
  if (updated.supplier.email) recipients.push(updated.supplier.email);

  for (const to of [...new Set(recipients.filter(Boolean))]) {
    await enqueueEmailJob({
      type: 'PURCHASE_ORDER_CONFIRM',
      to,
      payload: {
        poNumber: updated.poNumber,
        supplier: updated.supplier.name,
        lines: updated.lines.map((l) => ({
          sku: productMap[l.productId]?.sku,
          name: productMap[l.productId]?.name,
          quantity: l.quantity,
          unitCost: Number(l.unitCost),
        })),
        totalItems: updated.lines.reduce((s, l) => s + l.quantity, 0),
      },
    });
  }

  return updated;
};

const receivePurchaseOrder = async (tenantId, id) => {
  const po = await getPurchaseOrder(tenantId, id);
  if (po.status !== 'SENT') {
    throw new AppError(`Cannot receive PO in status ${po.status}`, 409);
  }

  return prisma.$transaction(
    async (tx) => {
      for (const line of po.lines) {
        await tx.inventory.upsert({
          where: {
            productId_locationId: { productId: line.productId, locationId: po.locationId },
          },
          update: { quantity: { increment: line.quantity } },
          create: {
            productId: line.productId,
            locationId: po.locationId,
            quantity: line.quantity,
          },
        });
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: { status: 'RECEIVED', receivedAt: new Date() },
        include: { supplier: true, lines: true },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
};

const cancelPurchaseOrder = async (tenantId, id) => {
  const po = await getPurchaseOrder(tenantId, id);
  if (po.status === 'RECEIVED') throw new AppError('Cannot cancel received PO', 409);
  if (po.status === 'CANCELLED') return po;

  return prisma.purchaseOrder.update({
    where: { id },
    data: { status: 'CANCELLED' },
    include: { supplier: true, lines: true },
  });
};

module.exports = {
  createPurchaseOrder,
  listPurchaseOrders,
  getPurchaseOrder,
  sendPurchaseOrder,
  receivePurchaseOrder,
  cancelPurchaseOrder,
};
