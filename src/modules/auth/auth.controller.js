const authService = require('./auth.service');
const {
  registerSchema,
  loginSchema,
  refreshSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require('./auth.schema');
const { success } = require('../../utils/response');

const register = async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const user = await authService.register(data);
    return success(res, { user }, 201);
  } catch (err) {
    next(err);
  }
};

const login = async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const result = await authService.login(data);
    return success(res, result);
  } catch (err) {
    next(err);
  }
};

const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    const tokens = await authService.refresh(refreshToken);
    return success(res, tokens);
  } catch (err) {
    next(err);
  }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken } = refreshSchema.parse(req.body);
    await authService.logout(refreshToken);
    return success(res, { message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
};

const me = (req, res) => {
  return success(res, { user: req.user });
};

const verifyEmail = async (req, res, next) => {
  try {
    const token = req.query.token;
    const result = await authService.verifyEmail(token);
    return success(res, { message: 'Email verified', ...result });
  } catch (err) {
    next(err);
  }
};

const resendVerification = async (req, res, next) => {
  try {
    const data = resendVerificationSchema.parse(req.body);
    await authService.resendVerification(data);
    return success(res, { message: 'If the account exists, a verification email was sent.' });
  } catch (err) {
    next(err);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const data = forgotPasswordSchema.parse(req.body);
    await authService.requestPasswordReset(data);
    return success(res, { message: 'If the account exists, a reset link was sent.' });
  } catch (err) {
    next(err);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const data = resetPasswordSchema.parse(req.body);
    await authService.resetPassword(data);
    return success(res, { message: 'Password updated. Please log in again.' });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  register,
  login,
  refreshToken,
  logout,
  me,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
};
