const logger = require('../config/logger');

const errorHandler = (err, req, res, next) => {
  logger.error(err.message, { stack: err.stack, path: req.path });

  if (err.name === 'ZodError') {
    return res.status(422).json({
      success: false,
      error: { message: 'Validation failed', details: err.errors },
    });
  }

  if (err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      error: { message: 'Resource already exists (unique constraint violated)' },
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      error: { message: 'Resource not found' },
    });
  }

  const statusCode = err.statusCode || 500;
  return res.status(statusCode).json({
    success: false,
    error: { message: err.message || 'Internal server error' },
  });
};

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}

module.exports = { errorHandler, AppError };
