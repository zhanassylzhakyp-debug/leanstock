const { prisma } = require('../../config/database');
const { AppError } = require('../../middleware/errorHandler');

const createSupplier = async (tenantId, data) => {
  return prisma.supplier.create({ data: { ...data, tenantId } });
};

const listSuppliers = async (tenantId, { cursor, limit, search }) => {
  const take = limit + 1;
  const where = {
    tenantId,
    isActive: true,
    ...(search && { name: { contains: search, mode: 'insensitive' } }),
  };
  const rows = await prisma.supplier.findMany({
    where,
    take,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    orderBy: { name: 'asc' },
  });
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? data[data.length - 1].id : null;
  const total = await prisma.supplier.count({ where });
  return { data, nextCursor, total };
};

const getSupplier = async (tenantId, id) => {
  const supplier = await prisma.supplier.findFirst({ where: { id, tenantId, isActive: true } });
  if (!supplier) throw new AppError('Supplier not found', 404);
  return supplier;
};

const updateSupplier = async (tenantId, id, data) => {
  await getSupplier(tenantId, id);
  return prisma.supplier.update({ where: { id }, data });
};

const deactivateSupplier = async (tenantId, id) => {
  await getSupplier(tenantId, id);
  return prisma.supplier.update({ where: { id }, data: { isActive: false } });
};

module.exports = {
  createSupplier,
  listSuppliers,
  getSupplier,
  updateSupplier,
  deactivateSupplier,
};
