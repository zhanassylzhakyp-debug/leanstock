const success = (res, data, statusCode = 200, meta = {}) => {
  return res.status(statusCode).json({ success: true, data, ...meta });
};

const error = (res, message, statusCode = 500, details = null) => {
  const body = { success: false, error: { message } };
  if (details) body.error.details = details;
  return res.status(statusCode).json(body);
};

const paginated = (res, data, cursor, total) => {
  return res.status(200).json({
    success: true,
    data,
    pagination: { nextCursor: cursor, total },
  });
};

module.exports = { success, error, paginated };
