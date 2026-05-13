const { Router } = require('express');
const { prisma } = require('../../config/database');
const { success } = require('../../utils/response');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const { z } = require('zod');

const router = Router();

const createTenantSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, hyphens'),
});

const listTenantsQuery = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

router.post('/', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const data = createTenantSchema.parse(req.body);
    const tenant = await prisma.tenant.create({ data });
    return success(res, { tenant }, 201);
  } catch (err) {
    next(err);
  }
});

router.get('/', authenticate, authorize('ADMIN'), async (req, res, next) => {
  try {
    const { limit, offset } = listTenantsQuery.parse(req.query);
    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        select: { id: true, name: true, slug: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.tenant.count(),
    ]);
    return res.status(200).json({
      success: true,
      data: tenants,
      pagination: { limit, offset, total },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
