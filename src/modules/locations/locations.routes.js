const { Router } = require('express');
const { prisma } = require('../../config/database');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const tenantScope = require('../../middleware/tenantScope');
const { success, error } = require('../../utils/response');
const { z } = require('zod');

const router = Router();
router.use(authenticate, tenantScope);

const locationSchema = z.object({
  name: z.string().min(1).max(100),
  address: z.string().optional(),
});

const listQuery = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

router.post('/', authorize('ADMIN'), async (req, res, next) => {
  try {
    const data = locationSchema.parse(req.body);
    const location = await prisma.location.create({
      data: { ...data, tenantId: req.tenantId },
    });
    return success(res, { location }, 201);
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const { limit, offset } = listQuery.parse(req.query);
    const [locations, total] = await Promise.all([
      prisma.location.findMany({
        where: { tenantId: req.tenantId },
        include: {
          _count: { select: { inventory: true } },
        },
        orderBy: { name: 'asc' },
        take: limit,
        skip: offset,
      }),
      prisma.location.count({ where: { tenantId: req.tenantId } }),
    ]);
    return res.status(200).json({
      success: true,
      data: locations,
      pagination: { limit, offset, total },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const location = await prisma.location.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
      include: { _count: { select: { inventory: true } } },
    });
    if (!location) return error(res, 'Location not found', 404);
    return success(res, { location });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
