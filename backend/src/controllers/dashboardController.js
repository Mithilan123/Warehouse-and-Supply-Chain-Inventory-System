const db = require('../config/db');

async function getDashboardStats(req, res, next) {
  try {
    // 1. Total products
    const prodCount = await db.query("SELECT COUNT(*) FROM products WHERE status = 'ACTIVE'");

    // 2. Total warehouses
    const whCount = await db.query("SELECT COUNT(*) FROM warehouses WHERE status = 'ACTIVE'");

    // 3. Total on-hand and available stock
    const stockStats = await db.query(`
      SELECT 
        COALESCE(SUM(on_hand), 0) AS total_on_hand,
        COALESCE(SUM(reserved), 0) AS total_reserved,
        COALESCE(SUM(on_hand - reserved), 0) AS total_available
      FROM stock_records
    `);

    // 4. Low stock count (where available <= reorder_level)
    const lowStockCount = await db.query(`
      SELECT COUNT(*)
      FROM stock_records s
      JOIN products p ON s.product_id = p.id
      WHERE (s.on_hand - s.reserved) <= p.reorder_level
    `);

    // 5. Pending transfers (CREATED or IN_TRANSIT)
    const pendingTransfers = await db.query(`
      SELECT COUNT(*)
      FROM warehouse_transfers
      WHERE status IN ('CREATED', 'DISPATCHED', 'IN_TRANSIT')
    `);

    // 6. Recent stock movements (last 5)
    const recentMovements = await db.query(`
      SELECT 
        m.id, m.movement_type, m.quantity, (m.new_on_hand - m.new_reserved) AS new_available,
        m.reference_type, m.reference_id, m.reason, m.created_at,
        p.sku, p.name AS product_name, w.name AS warehouse_name
      FROM stock_movements m
      JOIN products p ON m.product_id = p.id
      JOIN warehouses w ON m.warehouse_id = w.id
      ORDER BY m.created_at DESC
      LIMIT 5
    `);

    // 7. Recent notifications (last 5)
    const recentNotifications = await db.query(`
      SELECT id, routing_key, title, message, is_read, created_at
      FROM notifications
      ORDER BY created_at DESC
      LIMIT 5
    `);

    res.json({
      success: true,
      data: {
        totalProducts: parseInt(prodCount.rows[0].count, 10),
        totalWarehouses: parseInt(whCount.rows[0].count, 10),
        totalOnHand: parseInt(stockStats.rows[0].total_on_hand, 10),
        totalReserved: parseInt(stockStats.rows[0].total_reserved, 10),
        totalAvailable: parseInt(stockStats.rows[0].total_available, 10),
        lowStockCount: parseInt(lowStockCount.rows[0].count, 10),
        pendingTransfersCount: parseInt(pendingTransfers.rows[0].count, 10),
        recentMovements: recentMovements.rows,
        recentNotifications: recentNotifications.rows,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getHealth(req, res) {
  let dbStatus = 'DISCONNECTED';
  let rabbitmqStatus = 'DISCONNECTED';

  try {
    await db.query('SELECT 1');
    dbStatus = 'CONNECTED';
  } catch (err) {
    dbStatus = `ERROR: ${err.message}`;
  }

  const { connectRabbitMQ } = require('../messaging/rabbitmq');
  try {
    await connectRabbitMQ();
    rabbitmqStatus = 'CONNECTED';
  } catch (err) {
    rabbitmqStatus = `ERROR: ${err.message}`;
  }

  const isHealthy = dbStatus === 'CONNECTED' && rabbitmqStatus === 'CONNECTED';
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'HEALTHY' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    services: {
      database: dbStatus,
      rabbitmq: rabbitmqStatus,
    },
  });
}

module.exports = {
  getDashboardStats,
  getHealth,
};
