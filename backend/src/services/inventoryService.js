const db = require('../config/db');

/**
 * Get comprehensive inventory matrix:
 * Product | Warehouse | On-hand | Reserved | Available | Reorder Level | Status
 */
async function getStockMatrix(filters = {}) {
  const { warehouseId, productId, lowStockOnly } = filters;

  let queryText = `
    SELECT 
      s.id AS stock_id,
      p.id AS product_id,
      p.sku,
      p.name AS product_name,
      p.unit,
      p.reorder_level,
      w.id AS warehouse_id,
      w.name AS warehouse_name,
      s.on_hand,
      s.reserved,
      (s.on_hand - s.reserved) AS available,
      CASE 
        WHEN (s.on_hand - s.reserved) <= p.reorder_level THEN 'LOW_STOCK'
        ELSE 'HEALTHY'
      END AS status,
      s.updated_at
    FROM stock_records s
    JOIN products p ON s.product_id = p.id
    JOIN warehouses w ON s.warehouse_id = w.id
    WHERE 1=1
  `;
  const params = [];

  if (warehouseId) {
    params.push(warehouseId);
    queryText += ` AND s.warehouse_id = $${params.length}`;
  }
  if (productId) {
    params.push(productId);
    queryText += ` AND s.product_id = $${params.length}`;
  }
  if (lowStockOnly === true || lowStockOnly === 'true') {
    queryText += ` AND (s.on_hand - s.reserved) <= p.reorder_level`;
  }

  queryText += ` ORDER BY p.name ASC, w.id ASC`;

  const result = await db.query(queryText, params);
  return result.rows;
}

/**
 * Atomic stock receipt:
 * Increments on_hand, creates stock_movements, emits outbox event, checks low-stock alert
 */
async function receiveStock({
  productId,
  warehouseId,
  quantity,
  referenceType = 'RECEIPT',
  referenceId = null,
  notes = '',
  idempotencyKey = null,
  supplierEventId = null,
  poId = null,
}) {
  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty <= 0) {
    const error = new Error('Receipt quantity must be a positive integer');
    error.status = 400;
    throw error;
  }

  return await db.withTransaction(async (client) => {
    // 1. Idempotency Check for idempotencyKey and supplierEventId
    if (idempotencyKey) {
      const existingReceipt = await client.query(
        'SELECT id FROM stock_receipts WHERE idempotency_key = $1',
        [idempotencyKey]
      );
      if (existingReceipt.rows.length > 0) {
        console.log(`[Inventory] Idempotency key '${idempotencyKey}' already processed.`);
        return { message: 'Stock receipt already processed (idempotent)', receiptId: existingReceipt.rows[0].id };
      }
    }

    if (supplierEventId) {
      const existingEvent = await client.query(
        'SELECT id FROM stock_receipts WHERE supplier_event_id = $1',
        [supplierEventId]
      );
      if (existingEvent.rows.length > 0) {
        console.log(`[Inventory] Supplier event ID '${supplierEventId}' already processed.`);
        return { message: 'Supplier event already processed (idempotent)', receiptId: existingEvent.rows[0].id };
      }
    }

    // 2. Verify Product & Warehouse exist
    const prodRes = await client.query('SELECT id, sku, name, reorder_level FROM products WHERE id = $1', [productId]);
    if (prodRes.rows.length === 0) {
      const error = new Error('Product not found');
      error.status = 404;
      throw error;
    }
    const product = prodRes.rows[0];

    const whRes = await client.query('SELECT id FROM warehouses WHERE id = $1', [warehouseId]);
    if (whRes.rows.length === 0) {
      const error = new Error(`Warehouse '${warehouseId}' not found`);
      error.status = 404;
      throw error;
    }

    // 3. Ensure stock record exists with Row Lock
    await client.query(
      `INSERT INTO stock_records (product_id, warehouse_id, on_hand, reserved)
       VALUES ($1, $2, 0, 0)
       ON CONFLICT (product_id, warehouse_id) DO NOTHING`,
      [productId, warehouseId]
    );

    const stockRes = await client.query(
      `SELECT id, on_hand, reserved FROM stock_records
       WHERE product_id = $1 AND warehouse_id = $2
       FOR UPDATE`,
      [productId, warehouseId]
    );
    const currentStock = stockRes.rows[0];
    const prevOnHand = currentStock.on_hand;
    const prevReserved = currentStock.reserved;
    const newOnHand = prevOnHand + qty;

    // 4. Update stock record
    await client.query(
      `UPDATE stock_records
       SET on_hand = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newOnHand, currentStock.id]
    );

    // 5. Create stock receipt record
    const receiptRes = await client.query(
      `INSERT INTO stock_receipts (po_id, warehouse_id, supplier_event_id, idempotency_key, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [poId, warehouseId, supplierEventId, idempotencyKey, notes]
    );
    const receiptId = receiptRes.rows[0].id;

    await client.query(
      `INSERT INTO stock_receipt_items (receipt_id, product_id, quantity_received)
       VALUES ($1, $2, $3)`,
      [receiptId, productId, qty]
    );

    // 6. Record Stock Movement
    await client.query(
      `INSERT INTO stock_movements (
         product_id, warehouse_id, movement_type, quantity,
         previous_on_hand, new_on_hand, previous_reserved, new_reserved,
         reference_type, reference_id, reason
       ) VALUES ($1, $2, 'RECEIPT', $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        productId,
        warehouseId,
        qty,
        prevOnHand,
        newOnHand,
        prevReserved,
        prevReserved,
        referenceType,
        referenceId || receiptId,
        notes || `Received +${qty} units via ${referenceType}`,
      ]
    );

    // 7. Add Outbox Event: stock.received
    const outboxPayload = {
      product_id: productId,
      sku: product.sku,
      product_name: product.name,
      warehouse_id: warehouseId,
      quantity: qty,
      new_on_hand: newOnHand,
      available: newOnHand - prevReserved,
      reference_type: referenceType,
      reference_id: referenceId || receiptId,
      timestamp: new Date().toISOString(),
    };

    await client.query(
      `INSERT INTO outbox_events (event_type, routing_key, payload, status)
       VALUES ('STOCK_RECEIVED', 'stock.received', $1, 'PENDING')`,
      [JSON.stringify(outboxPayload)]
    );

    // 8. Low Stock Condition Check
    const newAvailable = newOnHand - prevReserved;
    if (newAvailable <= product.reorder_level) {
      await client.query(
        `INSERT INTO outbox_events (event_type, routing_key, payload, status)
         VALUES ('LOW_STOCK_DETECTED', 'stock.low', $1, 'PENDING')`,
        [
          JSON.stringify({
            product_id: productId,
            sku: product.sku,
            product_name: product.name,
            warehouse_id: warehouseId,
            available: newAvailable,
            reorder_level: product.reorder_level,
            on_hand: newOnHand,
            timestamp: new Date().toISOString(),
          }),
        ]
      );
    }

    return {
      success: true,
      receiptId,
      on_hand: newOnHand,
      reserved: prevReserved,
      available: newAvailable,
    };
  });
}

/**
 * Stock adjustment with mandatory reason:
 * Prevents negative stock or on_hand < reserved
 */
async function adjustStock({ productId, warehouseId, quantityDelta, reason }) {
  const delta = parseInt(quantityDelta, 10);
  if (isNaN(delta) || delta === 0) {
    const error = new Error('Adjustment quantityDelta must be a non-zero integer');
    error.status = 400;
    throw error;
  }
  if (!reason || !reason.trim()) {
    const error = new Error('Mandatory adjustment reason must be provided');
    error.status = 400;
    throw error;
  }

  return await db.withTransaction(async (client) => {
    // 1. Verify Product
    const prodRes = await client.query('SELECT id, sku, name, reorder_level FROM products WHERE id = $1', [productId]);
    if (prodRes.rows.length === 0) {
      const error = new Error('Product not found');
      error.status = 404;
      throw error;
    }
    const product = prodRes.rows[0];

    // 2. Fetch Stock with Lock
    const stockRes = await client.query(
      `SELECT id, on_hand, reserved FROM stock_records
       WHERE product_id = $1 AND warehouse_id = $2
       FOR UPDATE`,
      [productId, warehouseId]
    );

    if (stockRes.rows.length === 0) {
      const error = new Error(`No inventory record found for product in warehouse '${warehouseId}'`);
      error.status = 404;
      throw error;
    }

    const currentStock = stockRes.rows[0];
    const prevOnHand = currentStock.on_hand;
    const prevReserved = currentStock.reserved;
    const newOnHand = prevOnHand + delta;

    // 3. Invariant checks: on_hand >= 0 and reserved <= on_hand
    if (newOnHand < 0) {
      const error = new Error(`Cannot adjust stock below 0. Current on-hand is ${prevOnHand}, adjustment requested: ${delta}`);
      error.status = 409;
      throw error;
    }
    if (newOnHand < prevReserved) {
      const error = new Error(`Adjustment violates reserved stock constraint: On-hand (${newOnHand}) cannot be less than Reserved (${prevReserved})`);
      error.status = 409;
      throw error;
    }

    // 4. Update Stock Record
    await client.query(
      `UPDATE stock_records
       SET on_hand = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newOnHand, currentStock.id]
    );

    // 5. Record Movement
    await client.query(
      `INSERT INTO stock_movements (
         product_id, warehouse_id, movement_type, quantity,
         previous_on_hand, new_on_hand, previous_reserved, new_reserved,
         reference_type, reference_id, reason
       ) VALUES ($1, $2, 'ADJUSTMENT', $3, $4, $5, $6, $7, 'ADJUSTMENT', gen_random_uuid(), $8)`,
      [productId, warehouseId, delta, prevOnHand, newOnHand, prevReserved, prevReserved, reason.trim()]
    );

    const newAvailable = newOnHand - prevReserved;

    // 6. Outbox Event: stock.adjusted
    await client.query(
      `INSERT INTO outbox_events (event_type, routing_key, payload, status)
       VALUES ('STOCK_ADJUSTED', 'stock.adjusted', $1, 'PENDING')`,
      [
        JSON.stringify({
          product_id: productId,
          sku: product.sku,
          product_name: product.name,
          warehouse_id: warehouseId,
          delta,
          new_on_hand: newOnHand,
          available: newAvailable,
          reason: reason.trim(),
          timestamp: new Date().toISOString(),
        }),
      ]
    );

    // 7. Low stock trigger
    if (newAvailable <= product.reorder_level) {
      await client.query(
        `INSERT INTO outbox_events (event_type, routing_key, payload, status)
         VALUES ('LOW_STOCK_DETECTED', 'stock.low', $1, 'PENDING')`,
        [
          JSON.stringify({
            product_id: productId,
            sku: product.sku,
            product_name: product.name,
            warehouse_id: warehouseId,
            available: newAvailable,
            reorder_level: product.reorder_level,
            on_hand: newOnHand,
            timestamp: new Date().toISOString(),
          }),
        ]
      );
    }

    return {
      success: true,
      on_hand: newOnHand,
      reserved: prevReserved,
      available: newAvailable,
    };
  });
}

/**
 * Reserve or release stock
 */
async function modifyReservation({ productId, warehouseId, quantity, action = 'RESERVE', reason = '', referenceType = 'MANUAL', referenceId = null }) {
  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty <= 0) {
    const error = new Error('Reservation quantity must be a positive integer');
    error.status = 400;
    throw error;
  }

  return await db.withTransaction(async (client) => {
    const stockRes = await client.query(
      `SELECT id, on_hand, reserved FROM stock_records
       WHERE product_id = $1 AND warehouse_id = $2
       FOR UPDATE`,
      [productId, warehouseId]
    );

    if (stockRes.rows.length === 0) {
      const error = new Error('Stock record not found');
      error.status = 404;
      throw error;
    }

    const currentStock = stockRes.rows[0];
    const prevOnHand = currentStock.on_hand;
    const prevReserved = currentStock.reserved;
    const prevAvailable = prevOnHand - prevReserved;

    let newReserved;
    let movementType;

    if (action.toUpperCase() === 'RESERVE') {
      if (prevAvailable < qty) {
        const error = new Error(`Insufficient available stock to reserve. Available: ${prevAvailable}, Requested: ${qty}`);
        error.status = 409;
        throw error;
      }
      newReserved = prevReserved + qty;
      movementType = 'RESERVATION_HOLD';
    } else {
      if (prevReserved < qty) {
        const error = new Error(`Cannot release more reserved stock than currently held. Reserved: ${prevReserved}, Requested: ${qty}`);
        error.status = 409;
        throw error;
      }
      newReserved = prevReserved - qty;
      movementType = 'RESERVATION_RELEASE';
    }

    await client.query(
      `UPDATE stock_records
       SET reserved = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newReserved, currentStock.id]
    );

    await client.query(
      `INSERT INTO stock_movements (
         product_id, warehouse_id, movement_type, quantity,
         previous_on_hand, new_on_hand, previous_reserved, new_reserved,
         reference_type, reference_id, reason
       ) VALUES ($1, $2, $3, $4, $5, $5, $6, $7, $8, $9, $10)`,
      [
        productId,
        warehouseId,
        movementType,
        qty,
        prevOnHand,
        prevReserved,
        newReserved,
        referenceType,
        referenceId,
        reason || `${action} ${qty} units`,
      ]
    );

    return {
      success: true,
      on_hand: prevOnHand,
      reserved: newReserved,
      available: prevOnHand - newReserved,
    };
  });
}

/**
 * Get recent stock movements
 */
async function getStockMovements(filters = {}) {
  const { warehouseId, productId, limit = 50 } = filters;

  let queryText = `
    SELECT 
      m.id,
      m.movement_type,
      m.quantity,
      m.previous_on_hand,
      m.new_on_hand,
      m.previous_reserved,
      m.new_reserved,
      (m.new_on_hand - m.new_reserved) AS new_available,
      m.reference_type,
      m.reference_id,
      m.reason,
      m.created_at,
      p.sku,
      p.name AS product_name,
      w.id AS warehouse_id,
      w.name AS warehouse_name
    FROM stock_movements m
    JOIN products p ON m.product_id = p.id
    JOIN warehouses w ON m.warehouse_id = w.id
    WHERE 1=1
  `;
  const params = [];

  if (warehouseId) {
    params.push(warehouseId);
    queryText += ` AND m.warehouse_id = $${params.length}`;
  }
  if (productId) {
    params.push(productId);
    queryText += ` AND m.product_id = $${params.length}`;
  }

  params.push(parseInt(limit, 10) || 50);
  queryText += ` ORDER BY m.created_at DESC LIMIT $${params.length}`;

  const result = await db.query(queryText, params);
  return result.rows;
}

module.exports = {
  getStockMatrix,
  receiveStock,
  adjustStock,
  modifyReservation,
  getStockMovements,
};
