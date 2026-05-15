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
 
/**
 * @swagger
 * /locations:
 *   post:
 *     tags: [Locations]
 *     summary: Create location (ADMIN only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: "Warehouse A" }
 *               address: { type: string, example: "Main Street 1" }
 *     responses:
 *       201: { description: Created }
 *       403: { description: Forbidden }
 */
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
 
/**
 * @swagger
 * /locations:
 *   get:
 *     tags: [Locations]
 *     summary: List all locations (offset pagination)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, default: 0 }
 *     responses:
 *       200: { description: OK }
 */
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
 
/**
 * @swagger
 * /locations/{id}:
 *   get:
 *     tags: [Locations]
 *     summary: Get location by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Not found }
 */
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