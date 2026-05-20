const { Router } = require('express');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const tenantScope = require('../../middleware/tenantScope');
const poService = require('./purchase-orders.service');
const { prisma } = require('../../config/database');
const { z } = require('zod');

const router = Router();
router.use(authenticate, tenantScope);

const lineSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  unitCost: z.number().positive(),
});

const createSchema = z.object({
  supplierId: z.string().uuid(),
  locationId: z.string().uuid(),
  notes: z.string().max(500).optional(),
  lines: z.array(lineSchema).min(1),
});

const listSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['DRAFT', 'SENT', 'RECEIVED', 'CANCELLED']).optional(),
});

router.post('/', authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const purchaseOrder = await poService.createPurchaseOrder(
      req.tenantId,
      req.user.sub,
      data
    );
    return res.status(201).json({ success: true, data: { purchaseOrder } });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const q = listSchema.parse(req.query);
    const { data, nextCursor, total } = await poService.listPurchaseOrders(req.tenantId, q);
    return res.status(200).json({ success: true, data, pagination: { nextCursor, total } });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const purchaseOrder = await poService.getPurchaseOrder(req.tenantId, req.params.id);
    return res.status(200).json({ success: true, data: { purchaseOrder } });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/send', authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { email: true },
    });
    const purchaseOrder = await poService.sendPurchaseOrder(
      req.tenantId,
      req.params.id,
      user?.email
    );
    return res.status(200).json({ success: true, data: { purchaseOrder } });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/receive', authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const purchaseOrder = await poService.receivePurchaseOrder(req.tenantId, req.params.id);
    return res.status(200).json({ success: true, data: { purchaseOrder } });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/cancel', authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const purchaseOrder = await poService.cancelPurchaseOrder(req.tenantId, req.params.id);
    return res.status(200).json({ success: true, data: { purchaseOrder } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
