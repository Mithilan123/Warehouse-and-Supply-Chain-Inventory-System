const db = require('../config/db');
const inventoryService = require('./inventoryService');

async function getAllSuppliers() {
  const result = await db.query(
    `SELECT id, name, contact_info, status, created_at, updated_at
     FROM suppliers
     ORDER BY name ASC`
  );
  return result.rows;
}

async function createSupplier({ name, contact_info = '' }) {
  if (!name || !name.trim()) {
    const error = new Error('Supplier name is required');
    error.status = 400;
    throw error;
  }

  const result = await db.query(
    `INSERT INTO suppliers (name, contact_info, status)
     VALUES ($1, $2, 'ACTIVE')
     RETURNING *`,
    [name.trim(), contact_info.trim()]
  );
  return result.rows[0];
}

async function getAllPurchaseOrders() {
  const result = await db.query(
    `SELECT 
       po.id,
       po.po_number,
       po.status,
       po.notes,
       po.created_at,
       po.updated_at,
       s.id AS supplier_id,
       s.name AS supplier_name,
       json_agg(
         json_build_object(
           'item_id', poi.id,
           'product_id', p.id,
           'sku', p.sku,
           'product_name', p.name,
           'quantity_ordered', poi.quantity_ordered,
           'quantity_received', poi.quantity_received,
           'remaining_quantity', (poi.quantity_ordered - poi.quantity_received)
         )
       ) AS items
     FROM purchase_orders po
     JOIN suppliers s ON po.supplier_id = s.id
     JOIN purchase_order_items poi ON po.id = poi.po_id
     JOIN products p ON poi.product_id = p.id
     GROUP BY po.id, s.id
     ORDER BY po.created_at DESC`
  );
  return result.rows;
}

async function createPurchaseOrder({ supplierId, items, notes = '' }) {
  if (!supplierId) {
    const error = new Error('Supplier ID is required');
    error.status = 400;
    throw error;
  }
  if (!Array.isArray(items) || items.length === 0) {
    const error = new Error('At least one line item is required');
    error.status = 400;
    throw error;
  }

  return await db.withTransaction(async (client) => {
    // Generate unique PO number
    const countRes = await client.query('SELECT COUNT(*) FROM purchase_orders');
    const poNumber = `PO-${new Date().getFullYear()}-${String(parseInt(countRes.rows[0].count, 10) + 1).padStart(3, '0')}`;

    const poRes = await client.query(
      `INSERT INTO purchase_orders (po_number, supplier_id, status, notes)
       VALUES ($1, $2, 'CREATED', $3)
       RETURNING *`,
      [poNumber, supplierId, notes]
    );
    const po = poRes.rows[0];

    for (const item of items) {
      const qty = parseInt(item.quantity, 10);
      if (isNaN(qty) || qty <= 0) {
        const error = new Error(`Invalid ordered quantity for product ${item.productId}`);
        error.status = 400;
        throw error;
      }
      await client.query(
        `INSERT INTO purchase_order_items (po_id, product_id, quantity_ordered, quantity_received)
         VALUES ($1, $2, $3, 0)`,
        [po.id, item.productId, qty]
      );
    }

    return po;
  });
}

async function approvePurchaseOrder(poId) {
  const result = await db.query(
    `UPDATE purchase_orders
     SET status = 'APPROVED', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status = 'CREATED'
     RETURNING *`,
    [poId]
  );

  if (result.rows.length === 0) {
    const error = new Error('Purchase order not found or not in CREATED state');
    error.status = 400;
    throw error;
  }
  return result.rows[0];
}

/**
 * Receive items against an approved purchase order (supports multi-batch receipts).
 * Validates that receipt quantities do not exceed remaining quantities!
 */
async function receivePurchaseOrderItems(poId, { warehouseId, items, notes = '', idempotencyKey = null, supplierEventId = null }) {
  if (!warehouseId) {
    const error = new Error('Target warehouseId is required for goods receipt');
    error.status = 400;
    throw error;
  }
  if (!Array.isArray(items) || items.length === 0) {
    const error = new Error('Items array is required');
    error.status = 400;
    throw error;
  }

  return await db.withTransaction(async (client) => {
    // Check PO exists and is in receivable state
    const poRes = await client.query(
      `SELECT id, po_number, status FROM purchase_orders WHERE id = $1 FOR UPDATE`,
      [poId]
    );
    if (poRes.rows.length === 0) {
      const error = new Error('Purchase order not found');
      error.status = 404;
      throw error;
    }
    const po = poRes.rows[0];
    if (po.status !== 'APPROVED' && po.status !== 'PARTIALLY_RECEIVED') {
      const error = new Error(`Cannot receive goods for PO in '${po.status}' status. Must be APPROVED or PARTIALLY_RECEIVED.`);
      error.status = 400;
      throw error;
    }

    // Process each item
    for (const item of items) {
      const qtyReceivedNow = parseInt(item.quantity, 10);
      if (isNaN(qtyReceivedNow) || qtyReceivedNow <= 0) {
        continue;
      }

      // Fetch line item
      const itemRes = await client.query(
        `SELECT id, quantity_ordered, quantity_received
         FROM purchase_order_items
         WHERE po_id = $1 AND product_id = $2
         FOR UPDATE`,
        [poId, item.productId]
      );

      if (itemRes.rows.length === 0) {
        const error = new Error(`Product ${item.productId} does not belong to this purchase order`);
        error.status = 400;
        throw error;
      }

      const poItem = itemRes.rows[0];
      const remaining = poItem.quantity_ordered - poItem.quantity_received;

      // STRICT VALIDATION: Reject receipt quantities exceeding remaining ordered quantity
      if (qtyReceivedNow > remaining) {
        const error = new Error(
          `Receipt quantity (${qtyReceivedNow}) exceeds remaining ordered quantity (${remaining}) for product ${item.productId}`
        );
        error.status = 400;
        throw error;
      }

      // Update PO item received quantity
      const newQtyReceived = poItem.quantity_received + qtyReceivedNow;
      await client.query(
        `UPDATE purchase_order_items
         SET quantity_received = $1
         WHERE id = $2`,
        [newQtyReceived, poItem.id]
      );

      // Delegate stock addition to inventoryService (within same client / transaction logic)
      await inventoryService.receiveStock({
        productId: item.productId,
        warehouseId,
        quantity: qtyReceivedNow,
        referenceType: 'PURCHASE_ORDER',
        referenceId: po.po_number,
        notes: notes || `Batch received against ${po.po_number}`,
        idempotencyKey: idempotencyKey ? `${idempotencyKey}-${item.productId}` : null,
        supplierEventId: supplierEventId ? `${supplierEventId}-${item.productId}` : null,
        poId,
      });
    }

    // Determine overall PO status
    const allItems = await client.query(
      `SELECT quantity_ordered, quantity_received FROM purchase_order_items WHERE po_id = $1`,
      [poId]
    );
    const allCompleted = allItems.rows.every((i) => i.quantity_received >= i.quantity_ordered);
    const newStatus = allCompleted ? 'RECEIVED' : 'PARTIALLY_RECEIVED';

    await client.query(
      `UPDATE purchase_orders
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [newStatus, poId]
    );

    return {
      success: true,
      poNumber: po.po_number,
      status: newStatus,
    };
  });
}

/**
 * Simulate Supplier Update Demo Button:
 * Dispatches an event update with a given supplierEventId.
 * If repeated, idempotently rejects or ignores second execution.
 */
async function simulateSupplierUpdate({ supplierEventId, productId, warehouseId, quantity, poId }) {
  if (!supplierEventId) {
    const error = new Error('supplierEventId is required');
    error.status = 400;
    throw error;
  }

  // Check if supplierEventId was already processed in stock_receipts
  const check = await db.query(
    'SELECT id, created_at FROM stock_receipts WHERE supplier_event_id = $1',
    [supplierEventId]
  );
  if (check.rows.length > 0) {
    return {
      status: 'IGNORED_DUPLICATE',
      message: `Supplier update event '${supplierEventId}' already processed previously at ${check.rows[0].created_at}. Duplicate ignored idempotently.`,
      receiptId: check.rows[0].id,
    };
  }

  // Receive stock with this supplierEventId
  const result = await inventoryService.receiveStock({
    productId,
    warehouseId,
    quantity,
    referenceType: 'SUPPLIER_UPDATE',
    referenceId: supplierEventId,
    notes: `Simulated supplier dispatch event ${supplierEventId}`,
    supplierEventId,
    poId,
  });

  return {
    status: 'PROCESSED',
    message: `Successfully processed supplier update event '${supplierEventId}'. Added +${quantity} units to inventory.`,
    ...result,
  };
}

module.exports = {
  getAllSuppliers,
  createSupplier,
  getAllPurchaseOrders,
  createPurchaseOrder,
  approvePurchaseOrder,
  receivePurchaseOrderItems,
  simulateSupplierUpdate,
};
