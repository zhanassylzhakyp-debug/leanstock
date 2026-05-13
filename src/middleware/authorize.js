const { error } = require('../utils/response');

/**
 * RBAC middleware - enforces role restrictions
 * Returns 403 Forbidden (not 401) for wrong role
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return error(res, 'Authentication required', 401);
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
