const { Router } = require('express');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const tenantScope = require('../../middleware/tenantScope');
const { prisma } = require('../../config/database');
const { success, error } = require('../../utils/response');
const { authLimiter } = require('../../middleware/rateLimiter');
const { z } = require('zod');
const argon2 = require('argon2');
const { enqueueEmailJob } = require('../../queues/email.queue');
const { enqueueMaintenanceJob } = require('../../queues/maintenance.queue');
const { getEmailQueueCounts } = require('../../queues/email.queue');
const { getMaintenanceQueueCounts } = require('../../queues/maintenance.queue');
const env = require('../../config/env');
 
const router = Router();
router.use(authenticate, tenantScope, authorize('ADMIN'));
 
const createManagerSchema = z.object({
  email: z.string().email(),
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/),
  password: z
    .string()
    .min(8)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
});
 
/**
 * @swagger
 * /admin/users:
 *   post:
 *     tags: [Admin]
 *     summary: Create manager in tenant (ADMIN only, sends welcome email)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, username, password]
 *             properties:
 *               email: { type: string, example: "manager@acme.com" }
 *               username: { type: string, example: "acme_manager" }
 *               password: { type: string, example: "Manager123" }
 *     responses:
 *       201: { description: Created }
 *       409: { description: Conflict }
 */
router.post('/users', authLimiter, async (req, res, next) => {
  try {
    const data = createManagerSchema.parse(req.body);
    const conflict = await prisma.user.findFirst({
      where: {
        tenantId: req.tenantId,
        OR: [{ email: data.email }, { username: data.username }],
      },
    });
    if (conflict) return error(res, 'Пользователь с таким email или username уже есть в организации', 409);
 
    const passwordHash = await argon2.hash(data.password);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        username: data.username,
        passwordHash,
        role: 'MANAGER',
        tenantId: req.tenantId,
        emailVerifiedAt: new Date(),
      },
      select: { id: true, email: true, username: true, role: true, createdAt: true },
    });
 
    await enqueueEmailJob({
      type: 'WELCOME_MANAGER',
      to: user.email,
      payload: {
        username: user.username,
        loginUrl: `${env.APP_PUBLIC_URL}/docs`,
      },
    });
 
    return success(res, { user }, 201);
  } catch (err) {
    next(err);
  }
});
 
/**
 * @swagger
 * /admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: Get all users in tenant (ADMIN only, offset pagination)
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
router.get('/users', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: { tenantId: req.tenantId },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          isActive: true,
          emailVerifiedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.user.count({ where: { tenantId: req.tenantId } }),
    ]);
    return res.status(200).json({
      success: true,
      data: users,
      pagination: { limit, offset, total },
    });
  } catch (err) {
    next(err);
  }
});
 
/**
 * @swagger
 * /admin/jobs/low-stock-scan:
 *   post:
 *     tags: [Admin]
 *     summary: Trigger low stock scan (BullMQ → sends email alert)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: jobId returned }
 */
router.post('/jobs/low-stock-scan', async (req, res, next) => {
  try {
    const job = await enqueueMaintenanceJob('low-stock-scan');
    if (!job) return success(res, { message: 'Очередь отключена (test)', jobId: null });
    return success(res, { jobId: job.id, name: job.name });
  } catch (err) {
    next(err);
  }
});
 
/**
 * @swagger
 * /admin/jobs/dead-stock-decay:
 *   post:
 *     tags: [Admin]
 *     summary: Trigger dead stock decay recalculation (BullMQ)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: jobId returned }
 */
router.post('/jobs/dead-stock-decay', async (req, res, next) => {
  try {
    const job = await enqueueMaintenanceJob('dead-stock-decay');
    if (!job) return success(res, { message: 'Очередь отключена (test)', jobId: null });
    return success(res, { jobId: job.id, name: job.name });
  } catch (err) {
    next(err);
  }
});
 
/**
 * @swagger
 * /admin/jobs/queue-stats:
 *   get:
 *     tags: [Admin]
 *     summary: BullMQ queue stats (waiting/active/completed/failed)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: OK }
 */
router.get('/jobs/queue-stats', async (req, res, next) => {
  try {
    const email = await getEmailQueueCounts();
    const maintenance = await getMaintenanceQueueCounts();
    return success(res, {
      queues: {
        email: email || { disabled: true },
        maintenance: maintenance || { disabled: true },
      },
    });
  } catch (err) {
    next(err);
  }
});
 
module.exports = router;