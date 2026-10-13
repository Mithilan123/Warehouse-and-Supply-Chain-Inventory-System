const db = require('../config/db');

async function getAllWarehouses() {
  const result = await db.query(
    `SELECT id, code, name, location, address, status, created_at, updated_at
     FROM warehouses
     ORDER BY id ASC`
  );
  return result.rows;
}

async function getWarehouseById(id) {
  const result = await db.query(
    `SELECT id, code, name, location, address, status, created_at, updated_at
     FROM warehouses
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function createWarehouse(warehouseData) {
  const { id, code, name, location = '', address = '' } = warehouseData;

  const whId = (id || code || '').trim().toUpperCase();
  if (!whId) {
    const error = new Error('Warehouse ID/code is required (e.g. WH01)');
    error.status = 400;
    throw error;
  }
  if (!name || !name.trim()) {
    const error = new Error('Warehouse name is required');
    error.status = 400;
    throw error;
  }

  const existing = await getWarehouseById(whId);
  if (existing) {
    const error = new Error(`Warehouse with ID '${whId}' already exists`);
    error.status = 409;
    throw error;
  }

  const result = await db.query(
    `INSERT INTO warehouses (id, code, name, location, address, status)
     VALUES ($1, $1, $2, $3, $4, 'ACTIVE')
     RETURNING *`,
    [whId, name.trim(), location.trim(), address.trim()]
  );
  return result.rows[0];
}

async function getWarehouseStock(warehouseId) {
  const warehouse = await getWarehouseById(warehouseId);
  if (!warehouse) {
    const error = new Error(`Warehouse '${warehouseId}' not found`);
    error.status = 404;
    throw error;
  }

  const result = await db.query(
    `SELECT 
       p.id AS product_id,
       p.sku,
       p.name AS product_name,
       p.unit,
       p.reorder_level,
       COALESCE(s.on_hand, 0) AS on_hand,
       COALESCE(s.reserved, 0) AS reserved,
       (COALESCE(s.on_hand, 0) - COALESCE(s.reserved, 0)) AS available,
       CASE 
         WHEN (COALESCE(s.on_hand, 0) - COALESCE(s.reserved, 0)) <= p.reorder_level THEN 'LOW_STOCK'
         ELSE 'HEALTHY'
       END AS stock_status
     FROM products p
     LEFT JOIN stock_records s ON p.id = s.product_id AND s.warehouse_id = $1
     WHERE p.status = 'ACTIVE'
     ORDER BY p.name ASC`,
    [warehouseId]
  );

  return {
    warehouse,
    stock: result.rows,
  };
}

module.exports = {
  getAllWarehouses,
  getWarehouseById,
  createWarehouse,
  getWarehouseStock,
};
