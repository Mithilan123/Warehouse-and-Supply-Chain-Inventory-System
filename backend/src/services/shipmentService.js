const db = require('../config/db');

async function getAllShipments() {
  const result = await db.query(
    `SELECT 
       s.id,
       s.shipment_number,
       s.warehouse_id,
       w.name AS warehouse_name,
       s.status,
       s.customer_name,
       s.destination_address,
       s.notes,
       s.created_at,
       s.updated_at,
       json_agg(
         json_build_object(
           'item_id', si.id,
           'product_id', p.id,
           'sku', p.sku,
           'product_name', p.name,
           'quantity', si.quantity
         )
       ) AS items
     FROM shipments s
     JOIN warehouses w ON s.warehouse_id = w.id
     JOIN shipment_items si ON s.id = si.shipment_id
     JOIN products p ON si.product_id = p.id
     GROUP BY s.id, w.name
     ORDER BY s.created_at DESC`
  );
  return result.rows;
}

/**
 * Create Shipment and Reserve Stock
 */
async function createShipment({ warehouseId, items, customerName = '', destinationAddress = '', notes = '' }) {
  if (!warehouseId) {
    const error = new Error('Warehouse ID is required');
    error.status = 400;
    throw error;
  }
  if (!Array.isArray(items) || items.length === 0) {
    const error = new Error('At least one shipment item is required');
    error.status = 400;
    throw error;
  }

  return await db.withTransaction(async (client) => {
    // Generate Shipment Number
    const countRes = await client.query('SELECT COUNT(*) FROM shipments');
    const shipmentNumber = `SHP-${new Date().getFullYear()}-${String(parseInt(countRes.rows[0].count, 10) + 1).padStart(3, '0')}`;

    const shpRes = await client.query(
      `INSERT INTO shipments (shipment_number, warehouse_id, customer_name, destination_address, status, notes)
       VALUES ($1, $2, $3, $4, 'CREATED', $5)
       RETURNING *`,
      [shipmentNumber, warehouseId, customerName, destinationAddress, notes]
    );
    const shipment = shpRes.rows[0];

    for (const item of items) {
      const qty = parseInt(item.quantity, 10);
      if (isNaN(qty) || qty <= 0) {
        const error = new Error(`Invalid quantity for product ${item.productId}`);
        error.status = 400;
        throw error;
      }

      // Check available stock with lock
      const stockRes = await client.query(
        `SELECT id, on_hand, reserved FROM stock_records
         WHERE product_id = $1 AND warehouse_id = $2
         FOR UPDATE`,
        [item.productId, warehouseId]
      );

      if (stockRes.rows.length === 0) {
        const error = new Error(`No stock found for product ${item.productId} in warehouse ${warehouseId}`);
        error.status = 409;
        throw error;
      }

      const stock = stockRes.rows[0];
      const available = stock.on_hand - stock.reserved;
      if (available < qty) {
        const error = new Error(`Insufficient available stock for product ${item.productId}. Available: ${available}, Requested: ${qty}`);
        error.status = 409;
        throw error;
      }

      // Reserve stock
      const newReserved = stock.reserved + qty;
      await client.query(
        `UPDATE stock_records
         SET reserved = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [newReserved, stock.id]
      );

      await client.query(
        `INSERT INTO shipment_items (shipment_id, product_id, quantity)
         VALUES ($1, $2, $3)`,
        [shipment.id, item.productId, qty]
      );

      // Record Reservation Movement
      await client.query(
        `INSERT INTO stock_movements (
           product_id, warehouse_id, movement_type, quantity,
           previous_on_hand, new_on_hand, previous_reserved, new_reserved,
           reference_type, reference_id, reason
         ) VALUES ($1, $2, 'RESERVATION_HOLD', $3, $4, $4, $5, $6, 'SHIPMENT', $7, $8)`,
        [
          item.productId,
          warehouseId,
          qty,
          stock.on_hand,
          stock.reserved,
          newReserved,
          shipmentNumber,
          `Stock reserved for customer shipment ${shipmentNumber}`,
        ]
      );
    }

    return shipment;
  });
}

async function pickShipment(shipmentId) {
  const result = await db.query(
    `UPDATE shipments
     SET status = 'PICKED', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'CREATED'
     RETURNING *`,
    [shipmentId]
  );
  if (result.rows.length === 0) {
    const error = new Error('Shipment not found or not in CREATED state');
    error.status = 400;
    throw error;
  }
  return result.rows[0];
}

async function packShipment(shipmentId) {
  const result = await db.query(
    `UPDATE shipments
     SET status = 'PACKED', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'PICKED'
     RETURNING *`,
    [shipmentId]
  );
  if (result.rows.length === 0) {
    const error = new Error('Shipment not found or not in PICKED state');
    error.status = 400;
    throw error;
  }
  return result.rows[0];
}

async function dispatchShipment(shipmentId) {
  return await db.withTransaction(async (client) => {
    const shpRes = await client.query(
      `SELECT * FROM shipments WHERE id = $1 FOR UPDATE`,
      [shipmentId]
    );
    if (shpRes.rows.length === 0) {
      const error = new Error('Shipment not found');
      error.status = 404;
      throw error;
    }
    const shipment = shpRes.rows[0];

    if (shipment.status === 'DISPATCHED') {
      const error = new Error('Shipment has already been dispatched');
      error.status = 400;
      throw error;
    }

    const itemsRes = await client.query(
      `SELECT si.product_id, si.quantity, p.sku, p.name AS product_name
       FROM shipment_items si
       JOIN products p ON si.product_id = p.id
       WHERE si.shipment_id = $1`,
      [shipmentId]
    );

    for (const item of itemsRes.rows) {
      const stockRes = await client.query(
        `SELECT id, on_hand, reserved FROM stock_records
         WHERE product_id = $1 AND warehouse_id = $2
         FOR UPDATE`,
        [item.product_id, shipment.warehouse_id]
      );
      const stock = stockRes.rows[0];

      const prevOnHand = stock.on_hand;
      const prevReserved = stock.reserved;
      const newOnHand = prevOnHand - item.quantity;
      const newReserved = prevReserved - item.quantity;

      if (newOnHand < 0 || newReserved < 0) {
        const error = new Error(`Stock error: Cannot dispatch item ${item.product_name}. Not enough stock.`);
        error.status = 409;
        throw error;
      }

      await client.query(
        `UPDATE stock_records
         SET on_hand = $1, reserved = $2, updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [newOnHand, newReserved, stock.id]
      );

      // Movement
      await client.query(
        `INSERT INTO stock_movements (
           product_id, warehouse_id, movement_type, quantity,
           previous_on_hand, new_on_hand, previous_reserved, new_reserved,
           reference_type, reference_id, reason
         ) VALUES ($1, $2, 'SHIPMENT_DISPATCH', $3, $4, $5, $6, $7, 'SHIPMENT', $8, $9)`,
        [
          item.product_id,
          shipment.warehouse_id,
          -item.quantity,
          prevOnHand,
          newOnHand,
          prevReserved,
          newReserved,
          shipment.shipment_number,
          `Dispatched customer order ${shipment.shipment_number}`,
        ]
      );
    }

    await client.query(
      `UPDATE shipments
       SET status = 'DISPATCHED', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [shipmentId]
    );

    // Outbox Event: shipment.dispatched
    await client.query(
      `INSERT INTO outbox_events (event_type, routing_key, payload, status)
       VALUES ('SHIPMENT_DISPATCHED', 'shipment.dispatched', $1, 'PENDING')`,
      [
        JSON.stringify({
          shipment_id: shipment.id,
          shipment_number: shipment.shipment_number,
          warehouse_id: shipment.warehouse_id,
          customer_name: shipment.customer_name,
          status: 'DISPATCHED',
          timestamp: new Date().toISOString(),
        }),
      ]
    );

    return {
      success: true,
      shipmentNumber: shipment.shipment_number,
      status: 'DISPATCHED',
    };
  });
}

module.exports = {
  getAllShipments,
  createShipment,
  pickShipment,
  packShipment,
  dispatchShipment,
};
