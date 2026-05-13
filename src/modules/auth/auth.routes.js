const { Router } = require('express');
const controller = require('./auth.controller');
const authenticate = require('../../middleware/authenticate');
const { authLimiter, strictPublicLimiter } = require('../../middleware/rateLimiter');

const router = Router();

router.post('/register', authLimiter, controller.register);
router.post('/login', authLimiter, controller.login);
router.post('/refresh', authLimiter, controller.refreshToken);
router.post('/logout', controller.logout);
router.get('/me', authenticate, controller.me);

router.get('/verify-email', strictPublicLimiter, controller.verifyEmail);
router.post('/resend-verification', authLimiter, controller.resendVerification);
router.post('/forgot-password', authLimiter, controller.forgotPassword);
router.post('/reset-password', strictPublicLimiter, controller.resetPassword);

module.exports = router;
