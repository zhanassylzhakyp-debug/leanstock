const request = require('supertest');
const argon2 = require('argon2');
const app = require('../../src/app');
const { prisma } = require('../../src/config/database');

let tenantId;
let adminToken;
let productId;
let locationAId;
let locationBId;

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { name: `InvTenant ${Date.now()}`, slug: `inv-${Date.now()}` },
  });
  tenantId = tenant.id;

  const adminEmail = `admin_${Date.now()}@test.com`;
  await prisma.user.create({
    data: {
      email: adminEmail,
      username: `admin_${Date.now()}`,
      passwordHash: await argon2.hash('Admin1234'),
      role: 'ADMIN',
      tenantId,
      emailVerifiedAt: new Date(),
    },
  });

  const loginRes = await request(app).post('/api/v1/auth/login').send({
    email: adminEmail,
    password: 'Admin1234',
  });
  adminToken = loginRes.body.data.accessToken;

  const locA = await request(app)
    .post('/api/v1/locations')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Warehouse A' });
  const locB = await request(app)
    .post('/api/v1/locations')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Warehouse B' });
  locationAId = locA.body.data.location.id;
  locationBId = locB.body.data.location.id;

  const prod = await request(app)
    .post('/api/v1/products')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ sku: `SKU-${Date.now()}`, name: 'Test Widget', price: 10.99, costPrice: 5.0 });
  productId = prod.body.data.product.id;

  await request(app)
    .post('/api/v1/inventory/set')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ productId, locationId: locationAId, quantity: 50 });
});

afterAll(async () => {
  if (!tenantId) {
    await prisma.$disconnect().catch(() => {});
    return;
  }
  await prisma.transferLog.deleteMany({ where: { tenantId } });
  await prisma.inventory.deleteMany({ where: { product: { tenantId } } });
  await prisma.product.deleteMany({ where: { tenantId } });
  await prisma.location.deleteMany({ where: { tenantId } });
  await prisma.emailVerification.deleteMany({ where: { user: { tenantId } } });
  await prisma.passwordResetToken.deleteMany({ where: { user: { tenantId } } });
  await prisma.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('POST /api/v1/inventory/transfer', () => {
  it('transfers inventory atomically between locations', async () => {
    const res = await request(app)
      .post('/api/v1/inventory/transfer')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, fromLocationId: locationAId, toLocationId: locationBId, quantity: 10 });

    expect(res.status).toBe(200);
    expect(res.body.data.from.quantityAfter).toBe(40);
    expect(res.body.data.to.quantityAdded).toBe(10);
  });

  it('prevents overselling — rejects transfer exceeding available stock', async () => {
    const res = await request(app)
      .post('/api/v1/inventory/transfer')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, fromLocationId: locationAId, toLocationId: locationBId, quantity: 9999 });

    expect(res.status).toBe(409);
    expect(res.body.error.message).toContain('Insufficient stock');
  });

  it('rejects same source and destination', async () => {
    const res = await request(app)
      .post('/api/v1/inventory/transfer')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, fromLocationId: locationAId, toLocationId: locationAId, quantity: 5 });

    expect(res.status).toBe(400);
  });

  it('rejects unauthenticated transfer with 401', async () => {
    const res = await request(app)
      .post('/api/v1/inventory/transfer')
      .send({ productId, fromLocationId: locationAId, toLocationId: locationBId, quantity: 1 });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/inventory/sale', () => {
  it('records sale and updates lastSoldAt', async () => {
    const res = await request(app)
      .post('/api/v1/inventory/sale')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ productId, locationId: locationAId, quantity: 5 });
    expect(res.status).toBe(200);
    expect(res.body.data.quantitySold).toBe(5);
    expect(res.body.data.lastSoldAt).toBeDefined();
  });
});
