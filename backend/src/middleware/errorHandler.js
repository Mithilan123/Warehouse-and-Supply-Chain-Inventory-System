function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';

  if (status >= 500) {
    console.error(`[Server Error] ${req.method} ${req.url}:`, err);
  } else {
    console.warn(`[Client Error ${status}] ${req.method} ${req.url}:`, message);
  }

  res.status(status).json({
    error: err.name || 'Error',
    status,
    message,
    ...(process.env.NODE_ENV === 'development' && status >= 500 ? { stack: err.stack } : {}),
  });
}

module.exports = errorHandler;
