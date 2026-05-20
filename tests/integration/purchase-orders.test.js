const request = require('supertest');
const argon2 = require('argon2');
const app = require('../../src/app');
const { prisma } = require('../../src/config/database');
const { enqueueEmailJob } = require('../../src/queues/email.queue');

jest.mock('../../src/queues/email.queue', () => {
  const actual = jest.requireActual('../../src/queues/email.queue');
  return {
    ...actual,
    enqueueEmailJob: jest.fn().mockResolvedValue({ id: 'mock-job-1' }),
    getEmailQueue: jest.fn(),
  };
});

let tenantId;
let adminToken;
let productId;
let locationId;
let supplierId;

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { name: `PO Tenant ${Date.now()}`, slug: `po-${Date.now()}` },
  });
  tenantId = tenant.id;

  const adminEmail = `po_admin_${Date.now()}@test.com`;
  await prisma.user.create({
    data: {
      email: adminEmail,
      username: `po_admin_${Date.now()}`,
      passwordHash: await argon2.hash('AdminPass1'),
      role: 'ADMIN',
      tenantId,
      emailVerifiedAt: new Date(),
    },
  });
  const login = await request(app).post('/api/v1/auth/login').send({
    email: adminEmail,
    password: 'AdminPass1',
  });
  adminToken = login.body.data.accessToken;

  const loc = await prisma.location.create({
    data: { name: 'Main WH', tenantId },
  });
  locationId = loc.id;

  const product = await prisma.product.create({
    data: {
      sku: `SKU-${Date.now()}`,
      name: 'Test Widget',
      price: 10,
      costPrice: 5,
      tenantId,
    },
  });
  productId = product.id;

  await prisma.inventory.create({
    data: { productId, locationId, quantity: 50, minQuantity: 5 },
  });

  const sup = await prisma.supplier.create({
    data: { name: 'ACME Supply', email: 'acme@test.com', tenantId },
  });
  supplierId = sup.id;
});

afterAll(async () => {
  await prisma.purchaseOrderLine.deleteMany({ where: { purchaseOrder: { tenantId } } });
  await prisma.purchaseOrder.deleteMany({ where: { tenantId } });
  await prisma.supplier.deleteMany({ where: { tenantId } });
  await prisma.inventory.deleteMany({ where: { product: { tenantId } } });
  await prisma.product.deleteMany({ where: { tenantId } });
  await prisma.location.deleteMany({ where: { tenantId } });
  await prisma.emailVerification.deleteMany({ where: { user: { tenantId } } });
  await prisma.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('Purchase order workflow', () => {
  it('creates, sends (emails queued), and receives PO atomically', async () => {
    enqueueEmailJob.mockClear();

    const create = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierId,
        locationId,
        lines: [{ productId, quantity: 10, unitCost: 4.5 }],
      });
    expect(create.status).toBe(201);
    const poId = create.body.data.purchaseOrder.id;

    const send = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/send`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(send.status).toBe(200);
    expect(send.body.data.purchaseOrder.status).toBe('SENT');
    expect(enqueueEmailJob).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'PURCHASE_ORDER_CONFIRM' })
    );

    const receive = await request(app)
      .post(`/api/v1/purchase-orders/${poId}/receive`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(receive.status).toBe(200);
    expect(receive.body.data.purchaseOrder.status).toBe('RECEIVED');

    const inv = await prisma.inventory.findUnique({
      where: { productId_locationId: { productId, locationId } },
    });
    expect(inv.quantity).toBe(60);
  });
});
