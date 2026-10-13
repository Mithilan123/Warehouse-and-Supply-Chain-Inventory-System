const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { authMiddleware } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const routes = require('./routes');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(authMiddleware);

// Mount API routes
app.use('/api/v1', routes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'NotFound',
    status: 404,
    message: `API endpoint '${req.method} ${req.originalUrl}' not found`,
  });
});

// Global Error Handler
app.use(errorHandler);

module.exports = app;
