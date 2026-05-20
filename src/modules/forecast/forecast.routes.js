const { Router } = require('express');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const tenantScope = require('../../middleware/tenantScope');
const forecastService = require('./forecast.service');
const { z } = require('zod');

const router = Router();
router.use(authenticate, tenantScope, authorize('ADMIN', 'MANAGER'));

const querySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(50).default(20),
  windowDays: z.coerce.number().min(7).max(365).default(30),
  leadTimeDays: z.coerce.number().min(1).max(90).default(7),
});

/**
 * @swagger
 * /inventory/forecast:
 *   get:
 *     tags: [Forecast]
 *     summary: Predictive reorder suggestions (moving average)
 */
router.get('/', async (req, res, next) => {
  try {
    const q = querySchema.parse(req.query);
    const { data, nextCursor, total } = await forecastService.getTenantForecast(req.tenantId, q);
    return res.status(200).json({
      success: true,
      data,
      pagination: { nextCursor, total },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /inventory/forecast/{productId}:
 *   get:
 *     tags: [Forecast]
 *     summary: Reorder forecast for a single product
 */
router.get('/:productId', async (req, res, next) => {
  try {
    const q = querySchema.parse(req.query);
    const forecast = await forecastService.getProductForecast(req.tenantId, req.params.productId, q);
    return res.status(200).json({ success: true, data: forecast });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
