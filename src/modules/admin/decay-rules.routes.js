const { Router } = require('express');
const authenticate = require('../../middleware/authenticate');
const authorize = require('../../middleware/authorize');
const tenantScope = require('../../middleware/tenantScope');
const { prisma } = require('../../config/database');
const { success } = require('../../utils/response');
const { z } = require('zod');

const router = Router();
router.use(authenticate, tenantScope, authorize('ADMIN'));

const rulesSchema = z.object({
  tier1Days: z.number().int().min(1).optional(),
  tier2Days: z.number().int().min(1).optional(),
  tier3Days: z.number().int().min(1).optional(),
  tier1Discount: z.number().min(0).max(100).optional(),
  tier2Discount: z.number().min(0).max(100).optional(),
  tier3Discount: z.number().min(0).max(100).optional(),
  maxDiscount: z.number().min(0).max(100).optional(),
});

router.get('/decay-rules', async (req, res, next) => {
  try {
    let rules = await prisma.tenantDecayRules.findUnique({
      where: { tenantId: req.tenantId },
    });
    if (!rules) {
      rules = await prisma.tenantDecayRules.create({
        data: { tenantId: req.tenantId },
      });
    }
    return success(res, { rules });
  } catch (err) {
    next(err);
  }
});

router.put('/decay-rules', async (req, res, next) => {
  try {
    const data = rulesSchema.parse(req.body);
    const rules = await prisma.tenantDecayRules.upsert({
      where: { tenantId: req.tenantId },
      update: data,
      create: { tenantId: req.tenantId, ...data },
    });
    return success(res, { rules });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
