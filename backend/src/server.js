require('dotenv').config();
const app = require('./app');
const db = require('./config/db');
const { connectRabbitMQ } = require('./messaging/rabbitmq');
const { startOutboxPublisher, stopOutboxPublisher } = require('./services/outboxPublisher');
const { startNotificationConsumer } = require('./services/notificationConsumer');

const PORT = parseInt(process.env.PORT || '5000', 10);

async function startServer() {
  console.log('====================================================');
  console.log('Warehouse & Supply Chain Inventory System Backend');
  console.log('====================================================');

  // 1. Verify PostgreSQL Database Connection
  try {
    const dbTest = await db.query('SELECT version(), CURRENT_TIMESTAMP AS now');
    console.log('[PostgreSQL] Connected successfully to PostgreSQL 18:');
    console.log(`  Database time: ${dbTest.rows[0].now}`);
  } catch (err) {
    console.error('[PostgreSQL] Failed to connect to database:', err.message);
    process.exit(1);
  }

  // 2. Initialize RabbitMQ Topology (Topic Exchange, Queues, Bindings)
  try {
    await connectRabbitMQ();
    console.log('[RabbitMQ] Broker topology initialized successfully.');
  } catch (err) {
    console.warn('[RabbitMQ] Notice: RabbitMQ connection failed initially. Outbox publisher will retry automatically:', err.message);
  }

  // 3. Start Background Workers
  startOutboxPublisher(1000); // Check outbox every 1 second
  startNotificationConsumer(); // Consume from stock-notifications

  // 4. Start HTTP Server
  const server = app.listen(PORT, () => {
    console.log(`[HTTP Server] Listening on http://localhost:${PORT}`);
    console.log(`[REST Endpoints] Base URL: http://localhost:${PORT}/api/v1`);
    console.log('====================================================');
  });

  // Graceful Shutdown
  const gracefulShutdown = () => {
    console.log('\n[Server] Shutting down gracefully...');
    stopOutboxPublisher();
    server.close(() => {
      console.log('[Server] HTTP server closed.');
      db.pool.end(() => {
        console.log('[PostgreSQL] Database pool closed.');
        process.exit(0);
      });
    });
  };

  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}

startServer().catch((err) => {
  console.error('[Fatal Error] Failed to start server:', err);
  process.exit(1);
});
