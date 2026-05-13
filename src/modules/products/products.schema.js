const { z } = require('zod');

const createProductSchema = z.object({
  sku: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  price: z.number().positive('Price must be positive'),
  costPrice: z.number().positive('Cost price must be positive'),
});

const updateProductSchema = createProductSchema.partial();

const listProductsSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
});

module.exports = { createProductSchema, updateProductSchema, listProductsSchema };
