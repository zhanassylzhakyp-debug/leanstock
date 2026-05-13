const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { error } = require('../utils/response');

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return error(res, 'Access token required', 401);
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
    if (payload.emailVerified === false) {
      return error(res, 'Подтвердите email перед доступом к API', 403);
    }
    req.user = payload;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return error(res, 'Access token expired', 401);
    }
    return error(res, 'Invalid access token', 401);
  }
};

module.exports = authenticate;
