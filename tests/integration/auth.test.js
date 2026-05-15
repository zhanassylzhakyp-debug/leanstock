const request = require('supertest');
const app = require('../../src/app');
const { prisma } = require('../../src/config/database');

let tenantId;
let accessToken;
let refreshToken;

beforeAll(async () => {
  // Create a test tenant
  const tenant = await prisma.tenant.create({
    data: { name: `Test Tenant ${Date.now()}`, slug: `test-${Date.now()}` },
  });
  tenantId = tenant.id;
});

afterAll(async () => {
  if (!tenantId) {
    await prisma.$disconnect().catch(() => {});
    return;
  }
  await prisma.emailVerification.deleteMany({ where: { user: { tenantId } } });
  await prisma.passwordResetToken.deleteMany({ where: { user: { tenantId } } });
  await prisma.refreshToken.deleteMany({ where: { user: { tenantId } } });
  await prisma.user.deleteMany({ where: { tenantId } });
  await prisma.tenant.delete({ where: { id: tenantId } });
  await prisma.$disconnect();
});

describe('POST /api/v1/auth/register', () => {
  it('creates a new user successfully', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: `user_${Date.now()}@test.com`,
      username: `user_${Date.now()}`,
      password: 'Secure123',
      tenantId,
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBeDefined();
    expect(res.body.data.user.emailVerifiedAt).toBeTruthy();
  });

  it('rejects duplicate email with 409', async () => {
    const email = `dup_${Date.now()}@test.com`;
    await request(app).post('/api/v1/auth/register').send({
      email,
      username: `dup_${Date.now()}`,
      password: 'Secure123',
      tenantId,
    });
    const res = await request(app).post('/api/v1/auth/register').send({
      email,
      username: `other_${Date.now()}`,
      password: 'Secure123',
      tenantId,
    });
    expect(res.status).toBe(409);
  });

  it('rejects weak password with 422', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      email: `weak_${Date.now()}@test.com`,
      username: `weak_${Date.now()}`,
      password: 'weak',
      tenantId,
    });
    expect(res.status).toBe(422);
  });
});

describe('POST /api/v1/auth/login', () => {
  const email = `login_${Date.now()}@test.com`;
  const password = 'LoginSecure1';

  beforeAll(async () => {
    await request(app).post('/api/v1/auth/register').send({
      email,
      username: `login_${Date.now()}`,
      password,
      tenantId,
    });
  });

  it('returns access and refresh tokens on valid credentials', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  it('rejects wrong password with 401', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'WrongPass1' });
    expect(res.status).toBe(401);
  });
});

describe('Protected endpoints — auth enforcement', () => {
  it('rejects request without token with 401', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('rejects request with invalid token with 401', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });

  it('allows request with valid token', async () => {
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });
});

describe('RBAC — role enforcement', () => {
  it('rejects USER from ADMIN endpoint with 403', async () => {
    // accessToken is USER role by default
    const res = await request(app)
      .post('/api/v1/tenants')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'New Tenant', slug: 'new-tenant' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('issues new access token with valid refresh token', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    // ⬇️ Сохраняем новый токен после ротации
    refreshToken = res.body.data.refreshToken;
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('revokes the refresh token', async () => {
    // теперь используем обновлённый refreshToken
    const res = await request(app).post('/api/v1/auth/logout').send({ refreshToken });
    expect(res.status).toBe(200);

    const refreshRes = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(refreshRes.status).toBe(401);
  });
});