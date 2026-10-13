const db = require('../config/db');

async function getAllTransfers() {
  const result = await db.query(
    `SELECT 
       t.id,
       t.transfer_number,
       t.source_warehouse_id,
       sw.name AS source_warehouse_name,
       t.destination_warehouse_id,
       dw.name AS destination_warehouse_name,
       t.status,
       t.notes,
       t.created_at,
       t.updated_at,
       json_agg(
         json_build_object(
           'item_id', ti.id,
           'product_id', p.id,
           'sku', p.sku,
           'product_name', p.name,
           'quantity', ti.quantity
         )
       ) AS items
     FROM warehouse_transfers t
     JOIN warehouses sw ON t.source_warehouse_id = sw.id
     JOIN warehouses dw ON t.destination_warehouse_id = dw.id
     JOIN transfer_items ti ON t.id = ti.transfer_id
     JOIN products p ON ti.product_id = p.id
     GROUP BY t.id, sw.name, dw.name
     ORDER BY t.created_at DESC`
  );
  return result.rows;
}

/**
 * Step 1-5: Create Transfer and Reserve Stock at Source Warehouse
 */
async function createTransfer({ sourceWarehouseId, destinationWarehouseId, productId, quantity, notes = '' }) {
  const qty = parseInt(quantity, 10);
  if (isNaN(qty) || qty <= 0) {
    const error = new Error('Transfer quantity must be a positive integer');
    error.status = 400;
    throw error;
  }

  // 1 & 2. Validation: source != destination
  if (sourceWarehouseId === destinationWarehouseId) {
    const error = new Error('Source and destination warehouses cannot be the same');
    error.status = 400;
    throw error;
  }

  return await db.withTransaction(async (client) => {
    // Validate source and destination warehouses exist
    const swRes = await client.query('SELECT id, name FROM warehouses WHERE id = $1', [sourceWarehouseId]);
    if (swRes.rows.length === 0) {
      const error = new Error(`Source warehouse '${sourceWarehouseId}' not found`);
      error.status = 404;
      throw error;
    }

    const dwRes = await client.query('SELECT id, name FROM warehouses WHERE id = $1', [destinationWarehouseId]);
    if (dwRes.rows.length === 0) {
      const error = new Error(`Destination warehouse '${destinationWarehouseId}' not found`);
      error.status = 404;
      throw error;
    }

    // Validate product exists
    const prodRes = await client.query('SELECT id, sku, name FROM products WHERE id = $1', [productId]);
    if (prodRes.rows.length === 0) {
      const error = new Error('Product not found');
      error.status = 404;
      throw error;
    }
    const product = prodRes.rows[0];

    // 3. Lock source stock record and verify available stock
    const stockRes = await client.query(
      `SELECT id, on_hand, reserved FROM stock_records
       WHERE product_id = $1 AND warehouse_id = $2
       FOR UPDATE`,
      [productId, sourceWarehouseId]
    );

    if (stockRes.rows.length === 0) {
      const error = new Error(`No stock found for product in source warehouse ${sourceWarehouseId}`);
      error.status = 409;
      throw error;
    }

    const sourceStock = stockRes.rows[0];
    const available = sourceStock.on_hand - sourceStock.reserved;
    if (available < qty) {
      const error = new Error(`Insufficient available stock at source warehouse. Available: ${available}, Requested: ${qty}`);
      error.status = 409;
      throw error;
    }

    // 4. Create transfer record
    const countRes = await client.query('SELECT COUNT(*) FROM warehouse_transfers');
    const transferNumber = `TRF-${new Date().getFullYear()}-${String(parseInt(countRes.rows[0].count, 10) + 1).padStart(3, '0')}`;

    const trfRes = await client.query(
      `INSERT INTO warehouse_transfers (transfer_number, source_warehouse_id, destination_warehouse_id, status, notes)
       VALUES ($1, $2, $3, 'CREATED', $4)
       RETURNING *`,
      [transferNumber, sourceWarehouseId, destinationWarehouseId, notes]
    );
    const transfer = trfRes.rows[0];

    await client.query(
      `INSERT INTO transfer_items (transfer_id, product_id, quantity)
       VALUES ($1, $2, $3)`,
      [transfer.id, productId, qty]
    );

    // 5. Reserve requested quantity at source warehouse
    const newReserved = sourceStock.reserved + qty;
    await client.query(
      `UPDATE stock_records
       SET reserved = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newReserved, sourceStock.id]
    );

    // Record stock movement (Reservation Hold)
    await client.query(
      `INSERT INTO stock_movements (
         product_id, warehouse_id, movement_type, quantity,
         previous_on_hand, new_on_hand, previous_reserved, new_reserved,
         reference_type, reference_id, reason
       ) VALUES ($1, $2, 'RESERVATION_HOLD', $3, $4, $4, $5, $6, 'TRANSFER', $7, $8)`,
      [
        productId,
        sourceWarehouseId,
        qty,
        sourceStock.on_hand,
        sourceStock.reserved,
        newReserved,
        transferNumber,
        `Stock reserved for transfer ${transferNumber} to ${destinationWarehouseId}`,
      ]
    );

    return {
      ...transfer,
      productId,
      productName: product.name,
      quantity: qty,
    };
  });
}

/**
 * Step 6: Dispatch Transfer
 * Deduce source on_hand and reserved stock, mark goods as IN_TRANSIT, publish RabbitMQ event
 */
async function dispatchTransfer(transferId) {
  return await db.withTransaction(async (client) => {
    const trfRes = await client.query(
      `SELECT * FROM warehouse_transfers WHERE id = $1 FOR UPDATE`,
      [transferId]
    );
    if (trfRes.rows.length === 0) {
      const error = new Error('Transfer record not found');
      error.status = 404;
      throw error;
    }
    const transfer = trfRes.rows[0];

    if (transfer.status !== 'CREATED') {
      const error = new Error(`Cannot dispatch transfer in status '${transfer.status}'. Must be in CREATED state.`);
      error.status = 400;
      throw error;
    }

    // Get item
    const itemRes = await client.query(
      `SELECT ti.product_id, ti.quantity, p.sku, p.name AS product_name
       FROM transfer_items ti
       JOIN products p ON ti.product_id = p.id
       WHERE ti.transfer_id = $1`,
      [transferId]
    );
    const item = itemRes.rows[0];

    // Lock source stock record
    const stockRes = await client.query(
      `SELECT id, on_hand, reserved FROM stock_records
       WHERE product_id = $1 AND warehouse_id = $2
       FOR UPDATE`,
      [item.product_id, transfer.source_warehouse_id]
    );
    const sourceStock = stockRes.rows[0];

    // Deduce source on_hand and reserved
    const prevOnHand = sourceStock.on_hand;
    const prevReserved = sourceStock.reserved;
    const newOnHand = prevOnHand - item.quantity;
    const newReserved = prevReserved - item.quantity;

    if (newOnHand < 0 || newReserved < 0) {
      const error = new Error('Dispatch error: stock deduction would result in negative quantity');
      error.status = 409;
      throw error;
    }

    await client.query(
      `UPDATE stock_records
       SET on_hand = $1, reserved = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [newOnHand, newReserved, sourceStock.id]
    );

    // Record Stock Movement
    await client.query(
      `INSERT INTO stock_movements (
         product_id, warehouse_id, movement_type, quantity,
         previous_on_hand, new_on_hand, previous_reserved, new_reserved,
         reference_type, reference_id, reason
       ) VALUES ($1, $2, 'TRANSFER_DISPATCH', $3, $4, $5, $6, $7, 'TRANSFER', $8, $9)`,
      [
        item.product_id,
        transfer.source_warehouse_id,
        -item.quantity,
        prevOnHand,
        newOnHand,
        prevReserved,
        newReserved,
        transfer.transfer_number,
        `Dispatched ${item.quantity} units to ${transfer.destination_warehouse_id} (Transfer ${transfer.transfer_number})`,
      ]
    );

    // Update status to IN_TRANSIT
    await client.query(
      `UPDATE warehouse_transfers
       SET status = 'IN_TRANSIT', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [transferId]
    );

    // Insert Outbox Event: transfer.dispatched
    await client.query(
      `INSERT INTO outbox_events (event_type, routing_key, payload, status)
       VALUES ('TRANSFER_DISPATCHED', 'transfer.dispatched', $1, 'PENDING')`,
      [
        JSON.stringify({
          transfer_id: transfer.id,
          transfer_number: transfer.transfer_number,
          source_warehouse_id: transfer.source_warehouse_id,
          destination_warehouse_id: transfer.destination_warehouse_id,
          product_id: item.product_id,
          sku: item.sku,
          product_name: item.product_name,
          quantity: item.quantity,
          status: 'IN_TRANSIT',
          timestamp: new Date().toISOString(),
        }),
      ]
    );

    return {
      success: true,
      transferNumber: transfer.transfer_number,
      status: 'IN_TRANSIT',
    };
  });
}

/**
 * Step 7: Receive Transfer
 * Increase destination warehouse on_hand stock, complete transfer, publish RabbitMQ event
 */
async function receiveTransfer(transferId) {
  return await db.withTransaction(async (client) => {
    const trfRes = await client.query(
      `SELECT * FROM warehouse_transfers WHERE id = $1 FOR UPDATE`,
      [transferId]
    );
    if (trfRes.rows.length === 0) {
      const error = new Error('Transfer record not found');
      error.status = 404;
      throw error;
    }
    const transfer = trfRes.rows[0];

    // Never allow a received transfer to be received again!
    if (transfer.status === 'RECEIVED') {
      const error = new Error(`Transfer ${transfer.transfer_number} has already been received! Cannot process again.`);
      error.status = 409;
      throw error;
    }

    if (transfer.status !== 'IN_TRANSIT' && transfer.status !== 'DISPATCHED') {
      const error = new Error(`Cannot receive transfer in status '${transfer.status}'. Must be IN_TRANSIT or DISPATCHED.`);
      error.status = 400;
      throw error;
    }

    // Get item
    const itemRes = await client.query(
      `SELECT ti.product_id, ti.quantity, p.sku, p.name AS product_name
       FROM transfer_items ti
       JOIN products p ON ti.product_id = p.id
       WHERE ti.transfer_id = $1`,
      [transferId]
    );
    const item = itemRes.rows[0];

    // Ensure stock record exists at destination
    await client.query(
      `INSERT INTO stock_records (product_id, warehouse_id, on_hand, reserved)
       VALUES ($1, $2, 0, 0)
       ON CONFLICT (product_id, warehouse_id) DO NOTHING`,
      [item.product_id, transfer.destination_warehouse_id]
    );

    // Lock destination stock record
    const stockRes = await client.query(
      `SELECT id, on_hand, reserved FROM stock_records
       WHERE product_id = $1 AND warehouse_id = $2
       FOR UPDATE`,
      [item.product_id, transfer.destination_warehouse_id]
    );
    const destStock = stockRes.rows[0];

    const prevOnHand = destStock.on_hand;
    const prevReserved = destStock.reserved;
    const newOnHand = prevOnHand + item.quantity;

    await client.query(
      `UPDATE stock_records
       SET on_hand = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newOnHand, destStock.id]
    );

    // Record Stock Movement at Destination
    await client.query(
      `INSERT INTO stock_movements (
         product_id, warehouse_id, movement_type, quantity,
         previous_on_hand, new_on_hand, previous_reserved, new_reserved,
         reference_type, reference_id, reason
       ) VALUES ($1, $2, 'TRANSFER_RECEIPT', $3, $4, $5, $6, $7, 'TRANSFER', $8, $9)`,
      [
        item.product_id,
        transfer.destination_warehouse_id,
        item.quantity,
        prevOnHand,
        newOnHand,
        prevReserved,
        prevReserved,
        transfer.transfer_number,
        `Received ${item.quantity} units from ${transfer.source_warehouse_id} (Transfer ${transfer.transfer_number})`,
      ]
    );

    // Mark transfer as RECEIVED
    await client.query(
      `UPDATE warehouse_transfers
       SET status = 'RECEIVED', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [transferId]
    );

    // Insert Outbox Event: transfer.received
    await client.query(
      `INSERT INTO outbox_events (event_type, routing_key, payload, status)
       VALUES ('TRANSFER_RECEIVED', 'transfer.received', $1, 'PENDING')`,
      [
        JSON.stringify({
          transfer_id: transfer.id,
          transfer_number: transfer.transfer_number,
          source_warehouse_id: transfer.source_warehouse_id,
          destination_warehouse_id: transfer.destination_warehouse_id,
          product_id: item.product_id,
          sku: item.sku,
          product_name: item.product_name,
          quantity: item.quantity,
          status: 'RECEIVED',
          timestamp: new Date().toISOString(),
        }),
      ]
    );

    return {
      success: true,
      transferNumber: transfer.transfer_number,
      status: 'RECEIVED',
    };
  });
}

/**
 * Cancel transfer (only valid before dispatch)
 */
async function cancelTransfer(transferId) {
  return await db.withTransaction(async (client) => {
    const trfRes = await client.query(
      `SELECT * FROM warehouse_transfers WHERE id = $1 FOR UPDATE`,
      [transferId]
    );
    if (trfRes.rows.length === 0) {
      const error = new Error('Transfer not found');
      error.status = 404;
      throw error;
    }
    const transfer = trfRes.rows[0];

    if (transfer.status !== 'CREATED') {
      const error = new Error(`Cannot cancel transfer in status '${transfer.status}'. Only CREATED transfers can be cancelled.`);
      error.status = 400;
      throw error;
    }

    const itemRes = await client.query(
      `SELECT product_id, quantity FROM transfer_items WHERE transfer_id = $1`,
      [transferId]
    );
    const item = itemRes.rows[0];

    // Release reservation at source warehouse
    const stockRes = await client.query(
      `SELECT id, on_hand, reserved FROM stock_records
       WHERE product_id = $1 AND warehouse_id = $2
       FOR UPDATE`,
      [item.product_id, transfer.source_warehouse_id]
    );
    const sourceStock = stockRes.rows[0];
    const newReserved = Math.max(0, sourceStock.reserved - item.quantity);

    await client.query(
      `UPDATE stock_records
       SET reserved = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newReserved, sourceStock.id]
    );

    // Movement: RESERVATION_RELEASE
    await client.query(
      `INSERT INTO stock_movements (
         product_id, warehouse_id, movement_type, quantity,
         previous_on_hand, new_on_hand, previous_reserved, new_reserved,
         reference_type, reference_id, reason
       ) VALUES ($1, $2, 'RESERVATION_RELEASE', $3, $4, $4, $5, $6, 'TRANSFER', $7, $8)`,
      [
        item.product_id,
        transfer.source_warehouse_id,
        item.quantity,
        sourceStock.on_hand,
        sourceStock.reserved,
        newReserved,
        transfer.transfer_number,
        `Released reserved stock due to cancellation of transfer ${transfer.transfer_number}`,
      ]
    );

    await client.query(
      `UPDATE warehouse_transfers
       SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [transferId]
    );

    return {
      success: true,
      transferNumber: transfer.transfer_number,
      status: 'CANCELLED',
    };
  });
}

module.exports = {
  getAllTransfers,
  createTransfer,
  dispatchTransfer,
  receiveTransfer,
  cancelTransfer,
};
