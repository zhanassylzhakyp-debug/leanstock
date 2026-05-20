const request = require('supertest');
const app = require('../../src/app');
const { prisma } = require('../../src/config/database');

let tenantId;
let token;
let productId;
let locationId;

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { name: `Res Tenant ${Date.now()}`, slug: `res-${Date.now()}` },
  });
  tenantId = tenant.id;

  const reg = await request(app).post('/api/v1/auth/register').send({
    email: `res_user_${Date.now()}@test.com`,
    username: `res_user_${Date.now()}`,
    password: 'ResUser123',
    tenantId,
  });
  const login = await request(app).post('/api/v1/auth/login').send({
    email: reg.body.data.user.email,
    password: 'ResUser123',
  });
  token = login.body.data.accessToken;

  const loc = await prisma.location.create({ data: { name: 'Store A', tenantId } });
  locationId = loc.id;
  const product = await prisma.product.create({
    data: { sku: `R-${Date.now()}`, name: 'Reserve Item', price: 5, costPrice: 2, tenantId },
  });
  productId = product.id;
  await prisma.inventory.create({
    data: { productId, locationId, quantity: 20, minQuantity: 2 },
  });
});

afterAll(async () => {
  await prisma.reservation.deleteMany({ where: { tenantId } });
  await prisma.inventory.deleteMany({ where: { product: { tenantId } } });
  await prisma.product.deleteMany({ where: { tenantId } });
  await prisma.location.deleteMany({ where: { tenantId } });
  await prisma.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('POST /api/v1/reservations', () => {
  it('holds stock and confirms reservation', async () => {
    const create = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, locationId, quantity: 5 });
    expect(create.status).toBe(201);
    const reservationId = create.body.data.reservation.id;

    const invAfter = await prisma.inventory.findUnique({
      where: { productId_locationId: { productId, locationId } },
    });
    expect(invAfter.quantity).toBe(15);

    const confirm = await request(app)
      .post(`/api/v1/reservations/${reservationId}/confirm`)
      .set('Authorization', `Bearer ${token}`);
    expect(confirm.status).toBe(200);
    expect(confirm.body.data.reservation.status).toBe('CONFIRMED');
  });

  it('rejects reservation when insufficient stock', async () => {
    const res = await request(app)
      .post('/api/v1/reservations')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId, locationId, quantity: 999 });
    expect(res.status).toBe(409);
  });
});

describe('GET /api/v1/inventory/forecast RBAC', () => {
  it('rejects USER role with 403', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/forecast?limit=5')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});
