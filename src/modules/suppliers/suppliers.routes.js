const { Router } = require('express');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const tenantScope = require('../../middleware/tenantScope');
const suppliersService = require('./suppliers.service');
const { z } = require('zod');

const router = Router();
router.use(authenticate, tenantScope);

const createSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
});

const updateSchema = createSchema.partial();

const listSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
});

router.post('/', authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const supplier = await suppliersService.createSupplier(req.tenantId, data);
    return res.status(201).json({ success: true, data: { supplier } });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const q = listSchema.parse(req.query);
    const { data, nextCursor, total } = await suppliersService.listSuppliers(req.tenantId, q);
    return res.status(200).json({ success: true, data, pagination: { nextCursor, total } });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const supplier = await suppliersService.getSupplier(req.tenantId, req.params.id);
    return res.status(200).json({ success: true, data: { supplier } });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authorize('ADMIN', 'MANAGER'), async (req, res, next) => {
  try {
    const data = updateSchema.parse(req.body);
    const supplier = await suppliersService.updateSupplier(req.tenantId, req.params.id, data);
    return res.status(200).json({ success: true, data: { supplier } });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    const supplier = await suppliersService.deactivateSupplier(req.tenantId, req.params.id);
    return res.status(200).json({ success: true, data: { supplier } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
