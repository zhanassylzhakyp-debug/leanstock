const { Router } = require('express');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const tenantScope = require('../../middleware/tenantScope');
const { success } = require('../../utils/response');
const inventoryService = require('./inventory.service');
const { z } = require('zod');

const router = Router();
router.use(authenticate, tenantScope);

const transferSchema = z.object({
  productId: z.string().uuid(),
  fromLocationId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

const saleSchema = z.object({
  productId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantity: z.number().int().positive(),
});

const setInventorySchema = z.object({
  productId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantity: z.number().int().min(0),
});

const reportQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

/**
 * @swagger
 * /inventory/transfer:
 *   post:
 *     tags: [Inventory]
 *     summary: Atomic transfer (ADMIN or MANAGER)
 */
router.post('/transfer', authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const data = transferSchema.parse(req.body);
    const result = await inventoryService.transferInventory({
      ...data,
      userId: req.user.sub,
      tenantId: req.tenantId,
    });
    return success(res, result);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /inventory/sale:
 *   post:
 *     tags: [Inventory]
 *     summary: Sale / outbound (updates lastSoldAt for lean dead-stock)
 */
router.post('/sale', authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const data = saleSchema.parse(req.body);
    const result = await inventoryService.recordSale({
      ...data,
      tenantId: req.tenantId,
    });
    return success(res, result);
  } catch (err) {
    next(err);
  }
});

router.post('/set', authorize('ADMIN'), async (req, res, next) => {
  try {
    const data = setInventorySchema.parse(req.body);
    const inv = await inventoryService.setInventory({ ...data, tenantId: req.tenantId });
    return success(res, { inventory: inv });
  } catch (err) {
    next(err);
  }
});

router.get('/report', async (req, res, next) => {
  try {
    const q = reportQuerySchema.parse(req.query);
    const { data, nextCursor, total } = await inventoryService.getInventoryReport(req.tenantId, {
      cursor: q.cursor,
      limit: q.limit,
    });
    return res.status(200).json({
      success: true,
      data,
      pagination: { nextCursor, total },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
