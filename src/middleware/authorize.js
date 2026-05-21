const { error } = require('../utils/response');

/**
 * RBAC middleware - enforces role restrictions
 * SUPER_ADMIN bypasses all role checks
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return error(res, 'Authentication required', 401);
    }
    // SUPER_ADMIN has access to everything
    if (req.user.role === 'SUPER_ADMIN') {
      return next();
    }
    if (!roles.includes(req.user.role)) {
      return error(
        res,
        `Access denied. Required roles: ${roles.join(', ')}. Your role: ${req.user.role}`,
        403
      );
    }
    next();
  };
};

module.exports = authorize;