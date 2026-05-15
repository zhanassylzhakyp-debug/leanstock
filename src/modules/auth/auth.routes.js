const { Router } = require('express');
const controller = require('./auth.controller');
const authenticate = require('../../middleware/authenticate');
const { authLimiter, strictPublicLimiter } = require('../../middleware/rateLimiter');

const router = Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register new user (sends verification email)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, username, password, tenantId]
 *             properties:
 *               email: { type: string, example: "user@acme.com" }
 *               username: { type: string, example: "acme_user" }
 *               password: { type: string, example: "Secure123" }
 *               tenantId: { type: string, format: uuid }
 *     responses:
 *       201: { description: Created }
 *       409: { description: Conflict }
 *       422: { description: Validation error }
 */
router.post('/register', authLimiter, controller.register);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login (only verified users)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, example: "admin@acme.com" }
 *               password: { type: string, example: "Admin1234" }
 *     responses:
 *       200: { description: Tokens }
 *       401: { description: Invalid credentials }
 *       403: { description: Email not verified }
 */
router.post('/login', authLimiter, controller.login);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh token rotation
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: New token pair }
 *       401: { description: Invalid refresh token }
 */
router.post('/refresh', authLimiter, controller.refreshToken);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Revoke refresh token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string }
 *     responses:
 *       200: { description: OK }
 */
router.post('/logout', controller.logout);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200: { description: OK }
 *       401: { description: Unauthorized }
 */
router.get('/me', authenticate, controller.me);

/**
 * @swagger
 * /auth/verify-email:
 *   get:
 *     tags: [Auth]
 *     summary: Verify email by token from email link
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Verified }
 *       400: { description: Invalid token }
 */
router.get('/verify-email', strictPublicLimiter, controller.verifyEmail);

/**
 * @swagger
 * /auth/resend-verification:
 *   post:
 *     tags: [Auth]
 *     summary: Resend verification email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string }
 *     responses:
 *       200: { description: OK }
 */
router.post('/resend-verification', authLimiter, controller.resendVerification);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request password reset email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string }
 *     responses:
 *       200: { description: OK }
 */
router.post('/forgot-password', authLimiter, controller.forgotPassword);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset password with token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token: { type: string }
 *               password: { type: string, example: "NewSecure1" }
 *     responses:
 *       200: { description: OK }
 *       400: { description: Invalid token }
 */
router.post('/reset-password', strictPublicLimiter, controller.resetPassword);

module.exports = router;