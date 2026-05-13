const { Router } = require('express');
const { prisma } = require('../../config/database');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const tenantScope = require('../../middleware/tenantScope');
const { success, error, paginated } = require('../../utils/response');
const { createProductSchema, updateProductSchema, listProductsSchema } = require('./products.schema');

const router = Router();

// All product routes require auth + tenant scope
router.use(authenticate, tenantScope);

/**
 * @swagger
 * /products:
 *   post:
 *     tags: [Products]
 *     summary: Create a product (ADMIN only)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sku, name, price, costPrice]
 *             properties:
 *               sku: { type: string, example: "PROD-001" }
 *               name: { type: string, example: "Widget A" }
 *               price: { type: number, example: 29.99 }
 *               costPrice: { type: number, example: 15.00 }
 *     responses:
 *       201:
 *         description: Product created
 *       403:
 *         description: ADMIN role required
 *       409:
 *         description: SKU already exists in this tenant
 */
router.post('/', authorize('ADMIN'), async (req, res, next) => {
  try {
    const data = createProductSchema.parse(req.body);
    const product = await prisma.product.create({
      data: { ...data, tenantId: req.tenantId },
    });
    return success(res, { product }, 201);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /products:
 *   get:
 *     tags: [Products]
 *     summary: List products with cursor-based pagination
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: cursor
 *         schema: { type: string }
 *         description: Cursor for pagination (product ID)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated product list
 */
router.get('/', async (req, res, next) => {
  try {
    const { cursor, limit, search } = listProductsSchema.parse(req.query);

    const where = {
      tenantId: req.tenantId, // TENANT ISOLATION
      isActive: true,
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { sku: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const products = await prisma.product.findMany({
      where,
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      include: { inventory: { include: { location: true } } },
    });

    const hasMore = products.length > limit;
    const data = hasMore ? products.slice(0, limit) : products;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    const total = await prisma.product.count({ where });
    return paginated(res, data, nextCursor, total);
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /products/{id}:
 *   get:
 *     tags: [Products]
 *     summary: Get a single product
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product details
 *       404:
 *         description: Product not found
 */
router.get('/:id', async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId }, // TENANT ISOLATION
      include: { inventory: { include: { location: true } } },
    });

    if (!product) return error(res, 'Product not found', 404);
    return success(res, { product });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /products/{id}:
 *   patch:
 *     tags: [Products]
 *     summary: Update a product (ADMIN only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated product
 *       403:
 *         description: ADMIN role required
 *       404:
 *         description: Not found
 */
router.patch('/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    const data = updateProductSchema.parse(req.body);
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
    });
    if (!existing) return error(res, 'Product not found', 404);

    const product = await prisma.product.update({
      where: { id: req.params.id },
      data,
    });
    return success(res, { product });
  } catch (err) {
    next(err);
  }
});

/**
 * @swagger
 * /products/{id}:
 *   delete:
 *     tags: [Products]
 *     summary: Soft-delete a product (ADMIN only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Product deactivated
 */
router.delete('/:id', authorize('ADMIN'), async (req, res, next) => {
  try {
    const existing = await prisma.product.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
    });
    if (!existing) return error(res, 'Product not found', 404);

    await prisma.product.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    return success(res, { message: 'Product deactivated' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
