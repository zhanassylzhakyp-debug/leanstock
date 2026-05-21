const crypto = require('crypto');
const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { prisma } = require('../../config/database');
const env = require('../../config/env');
const { AppError } = require('../../middleware/errorHandler');
const { enqueueEmailJob } = require('../../queues/email.queue');

const hashToken = (plain) => crypto.createHash('sha256').update(plain).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('hex');

const hashPassword = (password) => argon2.hash(password);
const verifyPassword = (hash, password) => argon2.verify(hash, password);

const refreshExpiresMs = () => {
  const m = /^(\d+)([dhms])$/.exec(env.JWT_REFRESH_EXPIRES_IN || '7d');
  if (!m) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  const u = m[2];
  const mult = u === 'd' ? 86400000 : u === 'h' ? 3600000 : u === 'm' ? 60000 : 1000;
  return n * mult;
};

const generateTokens = (user) => {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    emailVerified: Boolean(user.emailVerifiedAt),
  };

  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  });

  const refreshToken = uuidv4();

  return { accessToken, refreshToken };
};

const shouldSkipEmailVerification = () =>
  env.NODE_ENV === 'test' || env.SKIP_EMAIL_VERIFICATION === 'true';

const register = async ({ email, username, password, tenantId, role }) => {
  let tenant;
  if (tenantId) {
    tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new AppError('Tenant not found', 404);
  } else {
    const slug = username.toLowerCase().replace(/[^a-z0-9]/g, '-') + '-' + Date.now();
    tenant = await prisma.tenant.create({
      data: { name: `${username}'s Organization`, slug },
    });
  }

  const allowedRoles = ['USER', 'MANAGER'];
  const userRole = allowedRoles.includes(role) ? role : 'USER';

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      username,
      passwordHash,
      tenantId,
      role: 'UserRole',
      ...(shouldSkipEmailVerification() ? { emailVerifiedAt: new Date() } : {}),
    },
    select: {
      id: true,
      email: true,
      username: true,
      role: true,
      tenantId: true,
      emailVerifiedAt: true,
      createdAt: true,
    },
  });

  if (!shouldSkipEmailVerification()) {
    const plain = randomToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.emailVerification.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(plain),
        expiresAt,
      },
    });
    const link = `${env.APP_PUBLIC_URL}/api/v1/auth/verify-email?token=${encodeURIComponent(plain)}`;
    await enqueueEmailJob({
      type: 'VERIFY_EMAIL',
      to: user.email,
      payload: { username: user.username, link },
    });
  }

  return {
    ...user,
    message: shouldSkipEmailVerification()
      ? 'Account ready (verification skipped in this environment).'
      : 'Check your inbox to verify your email before logging in.',
  };
};

const login = async ({ email, password }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive) {
    throw new AppError('Invalid credentials', 401);
  }

  if (!user.emailVerifiedAt) {
    throw new AppError('Email not verified. Please check your inbox or request a new link.', 403);
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) throw new AppError('Invalid credentials', 401);

  const { accessToken, refreshToken } = generateTokens(user);

  const expiresAt = new Date(Date.now() + refreshExpiresMs());

  await prisma.refreshToken.create({
    data: { token: refreshToken, userId: user.id, expiresAt },
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      emailVerified: true,
    },
  };
};

const refresh = async (refreshToken) => {
  const stored = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: true },
  });

  if (!stored) throw new AppError('Invalid refresh token', 401);
  if (stored.revokedAt) throw new AppError('Refresh token has been revoked', 401);
  if (stored.expiresAt < new Date()) throw new AppError('Refresh token expired', 401);
  if (!stored.user.isActive) throw new AppError('User account is disabled', 403);
  if (!stored.user.emailVerifiedAt) throw new AppError('Email not verified', 403);

  const { accessToken, refreshToken: newRefreshToken } = generateTokens(stored.user);

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    }),
    prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        userId: stored.user.id,
        expiresAt: new Date(Date.now() + refreshExpiresMs()),
      },
    }),
  ]);

  return { accessToken, refreshToken: newRefreshToken };
};

const logout = async (refreshToken) => {
  const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
  if (!stored) throw new AppError('Invalid refresh token', 400);
  if (stored.revokedAt) throw new AppError('Already logged out', 400);

  await prisma.refreshToken.update({
    where: { token: refreshToken },
    data: { revokedAt: new Date() },
  });
};

const verifyEmail = async (plainToken) => {
  if (!plainToken) throw new AppError('Token is required', 400);
  const tokenHash = hashToken(plainToken);
  const row = await prisma.emailVerification.findFirst({
    where: { tokenHash, expiresAt: { gt: new Date() } },
    include: { user: true },
  });
  if (!row) throw new AppError('Invalid or expired verification link', 400);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { emailVerifiedAt: new Date() },
    }),
    prisma.emailVerification.deleteMany({ where: { userId: row.userId } }),
  ]);

  return { email: row.user.email };
};

const resendVerification = async ({ email }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { ok: true };
  }
  if (user.emailVerifiedAt) {
    return { ok: true };
  }

  await prisma.emailVerification.deleteMany({ where: { userId: user.id } });
  const plain = randomToken();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.emailVerification.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(plain),
      expiresAt,
    },
  });
  const link = `${env.APP_PUBLIC_URL}/api/v1/auth/verify-email?token=${encodeURIComponent(plain)}`;
  await enqueueEmailJob({
    type: 'VERIFY_EMAIL',
    to: user.email,
    payload: { username: user.username, link },
  });
  return { ok: true };
};

const requestPasswordReset = async ({ email }) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return { ok: true };
  }

  const plain = randomToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(plain),
      expiresAt,
    },
  });

  const link = `${env.APP_PUBLIC_URL}/api/v1/auth/reset-password?token=${encodeURIComponent(plain)}`;
  await enqueueEmailJob({
    type: 'PASSWORD_RESET',
    to: user.email,
    payload: { username: user.username, link },
  });

  return { ok: true };
};

const resetPassword = async ({ token, password }) => {
  const tokenHash = hashToken(token);
  const row = await prisma.passwordResetToken.findFirst({
    where: { tokenHash, expiresAt: { gt: new Date() }, usedAt: null },
  });
  if (!row) throw new AppError('Invalid or expired reset link', 400);

  const passwordHash = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: row.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  return { ok: true };
};

module.exports = {
  register,
  login,
  refresh,
  logout,
  verifyEmail,
  resendVerification,
  requestPasswordReset,
  resetPassword,
};
