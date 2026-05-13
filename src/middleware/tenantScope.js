const { error } = require('../utils/response');

/**
 * Injects tenantId from JWT into req for all downstream queries.
 * Every DB query must filter by tenantId — enforced here.
 */
const tenantScope = (req, res, next) => {
  if (!req.user || !req.user.tenantId) {
    return error(res, 'Tenant context missing', 403);
  }
  req.tenantId = req.user.tenantId;
  next();
};

module.exports = tenantScope;
