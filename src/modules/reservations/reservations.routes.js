const { Router } = require('express');
const authenticate = require('../../middleware/authenticate');
const tenantScope = require('../../middleware/tenantScope');
const reservationsService = require('./reservations.service');
const { z } = require('zod');

const router = Router();
router.use(authenticate, tenantScope);

const createSchema = z.object({
  productId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantity: z.number().int().positive(),
  ttlSeconds: z.number().int().min(60).max(3600).optional(),
});

const listSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'CONFIRMED', 'RELEASED', 'EXPIRED']).optional(),
});

/**
 * @swagger
 * /reservations:
 *   post:
 *     tags: [Reservations]
 *     summary: Create checkout reservation with Redis lock + TTL
 */
router.post('/', async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const reservation = await reservationsService.createReservation({
      ...data,
      userId: req.user.sub,
      tenantId: req.tenantId,
    });
    return res.status(201).json({ success: true, data: { reservation } });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const q = listSchema.parse(req.query);
    const { data, nextCursor, total } = await reservationsService.listReservations(
      req.tenantId,
      q
    );
    return res.status(200).json({
      success: true,
      data,
      pagination: { nextCursor, total },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/confirm', async (req, res, next) => {
  try {
    const reservation = await reservationsService.confirmReservation(
      req.params.id,
      req.user.sub,
      req.tenantId
    );
    return res.status(200).json({ success: true, data: { reservation } });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const reservation = await reservationsService.releaseReservation(
      req.params.id,
      req.user.sub,
      req.tenantId
    );
    return res.status(200).json({ success: true, data: { reservation } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
