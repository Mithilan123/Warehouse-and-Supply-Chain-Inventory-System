const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/config/db');
const productService = require('../src/services/productService');
const warehouseService = require('../src/services/warehouseService');
const inventoryService = require('../src/services/inventoryService');
const procurementService = require('../src/services/procurementService');
const transferService = require('../src/services/transferService');
const { processOutboxBatch } = require('../src/services/outboxPublisher');

test('Warehouse and Supply Chain Inventory System - Core Test Suite', async (t) => {
  let testProductId;
  let testWarehouseA = 'WH01';
  let testWarehouseB = 'WH02';
  let testSupplierId;

  // Setup: Ensure baseline products and suppliers exist
  const products = await productService.getAllProducts();
  testProductId = products[0].id; // Laptop LAP001

  const suppliers = await procurementService.getAllSuppliers();
  testSupplierId = suppliers[0].id;

  // -------------------------------------------------------------
  // Scenario 1: Create a product and prevent duplicate SKU
  // -------------------------------------------------------------
  await t.test('Scenario 1: Create product and prevent duplicate SKU', async () => {
    const testSku = `TEST-SKU-${Date.now()}`;
    const newProd = await productService.createProduct({
      sku: testSku,
      name: 'Test Barcode Scanner',
      description: 'Industrial 2D Barcode Scanner',
      unit: 'pieces',
      reorder_level: 5,
    });
    assert.ok(newProd.id, 'Product created successfully');
    assert.equal(newProd.sku, testSku);

    // Attempt duplicate SKU
    await assert.rejects(
      async () => {
        await productService.createProduct({
          sku: testSku,
          name: 'Another Scanner',
        });
      },
      (err) => {
        assert.equal(err.status, 409, 'Should return 409 Conflict');
        assert.match(err.message, /already exists/i);
        return true;
      }
    );
  });

  // -------------------------------------------------------------
  // Scenario 2: Receive stock against a valid purchase order
  // -------------------------------------------------------------
  let testPoId;
  await t.test('Scenario 2: Receive stock against valid purchase order', async () => {
    // Create new PO
    const po = await procurementService.createPurchaseOrder({
      supplierId: testSupplierId,
      items: [{ productId: testProductId, quantity: 20 }],
      notes: 'Test PO for receipt scenario',
    });
    testPoId = po.id;
    assert.equal(po.status, 'CREATED');

    // Approve PO
    const approvedPo = await procurementService.approvePurchaseOrder(testPoId);
    assert.equal(approvedPo.status, 'APPROVED');

    // Receive first batch: 10 units of 20
    const receiptResult = await procurementService.receivePurchaseOrderItems(testPoId, {
      warehouseId: testWarehouseA,
      items: [{ productId: testProductId, quantity: 10 }],
      notes: 'First batch receipt of 10 units',
    });

    assert.equal(receiptResult.success, true);
    assert.equal(receiptResult.status, 'PARTIALLY_RECEIVED', 'Status should be PARTIALLY_RECEIVED');
  });

  // -------------------------------------------------------------
  // Scenario 3: Reject receipt quantities exceeding remaining order quantity
  // -------------------------------------------------------------
  await t.test('Scenario 3: Reject receipt quantities exceeding remaining order quantity', async () => {
    // Remaining is 10 (20 ordered - 10 received). Attempting to receive 15 must fail!
    await assert.rejects(
      async () => {
        await procurementService.receivePurchaseOrderItems(testPoId, {
          warehouseId: testWarehouseA,
          items: [{ productId: testProductId, quantity: 15 }],
        });
      },
      (err) => {
        assert.equal(err.status, 400, 'Should return 400 Bad Request');
        assert.match(err.message, /exceeds remaining ordered quantity/i);
        return true;
      }
    );
  });

  // -------------------------------------------------------------
  // Scenario 4: Transfer stock between two warehouses
  // -------------------------------------------------------------
  await t.test('Scenario 4: Transfer stock between two warehouses (CREATED -> DISPATCHED -> IN_TRANSIT -> RECEIVED)', async () => {
    const transferQty = 5;

    // Source WH initial stock
    const initialSourceStock = await db.query(
      'SELECT on_hand, reserved FROM stock_records WHERE product_id = $1 AND warehouse_id = $2',
      [testProductId, testWarehouseA]
    );
    const sourceOnHandStart = initialSourceStock.rows[0].on_hand;
    const sourceReservedStart = initialSourceStock.rows[0].reserved;

    // Dest WH initial stock
    const initialDestStock = await db.query(
      'SELECT on_hand, reserved FROM stock_records WHERE product_id = $1 AND warehouse_id = $2',
      [testProductId, testWarehouseB]
    );
    const destOnHandStart = initialDestStock.rows[0].on_hand;

    // 1. Create transfer -> reserves stock
    const transfer = await transferService.createTransfer({
      sourceWarehouseId: testWarehouseA,
      destinationWarehouseId: testWarehouseB,
      productId: testProductId,
      quantity: transferQty,
      notes: 'Automated test transfer',
    });
    assert.equal(transfer.status, 'CREATED');

    // Verify source reserved increased
    const sourceStockReserved = await db.query(
      'SELECT reserved FROM stock_records WHERE product_id = $1 AND warehouse_id = $2',
      [testProductId, testWarehouseA]
    );
    assert.equal(sourceStockReserved.rows[0].reserved, sourceReservedStart + transferQty);

    // 2. Dispatch transfer -> goods in transit, source on-hand & reserved deducted
    const dispatched = await transferService.dispatchTransfer(transfer.id);
    assert.equal(dispatched.status, 'IN_TRANSIT');

    const sourceStockDispatched = await db.query(
      'SELECT on_hand, reserved FROM stock_records WHERE product_id = $1 AND warehouse_id = $2',
      [testProductId, testWarehouseA]
    );
    assert.equal(sourceStockDispatched.rows[0].on_hand, sourceOnHandStart - transferQty);
    assert.equal(sourceStockDispatched.rows[0].reserved, sourceReservedStart);

    // 3. Receive transfer -> completed, destination on-hand increased
    const received = await transferService.receiveTransfer(transfer.id);
    assert.equal(received.status, 'RECEIVED');

    const destStockReceived = await db.query(
      'SELECT on_hand FROM stock_records WHERE product_id = $1 AND warehouse_id = $2',
      [testProductId, testWarehouseB]
    );
    assert.equal(destStockReceived.rows[0].on_hand, destOnHandStart + transferQty);
  });

  // -------------------------------------------------------------
  // Scenario 5: Reject transfers with insufficient available stock
  // -------------------------------------------------------------
  await t.test('Scenario 5: Reject transfers with insufficient available stock', async () => {
    const hugeQty = 999999;
    await assert.rejects(
      async () => {
        await transferService.createTransfer({
          sourceWarehouseId: testWarehouseA,
          destinationWarehouseId: testWarehouseB,
          productId: testProductId,
          quantity: hugeQty,
        });
      },
      (err) => {
        assert.equal(err.status, 409, 'Should return 409 Conflict');
        assert.match(err.message, /insufficient available stock/i);
        return true;
      }
    );
  });

  // -------------------------------------------------------------
  // Scenario 6: Reject transfers to the same warehouse
  // -------------------------------------------------------------
  await t.test('Scenario 6: Reject transfers where source equals destination', async () => {
    await assert.rejects(
      async () => {
        await transferService.createTransfer({
          sourceWarehouseId: testWarehouseA,
          destinationWarehouseId: testWarehouseA,
          productId: testProductId,
          quantity: 2,
        });
      },
      (err) => {
        assert.equal(err.status, 400, 'Should return 400 Bad Request');
        assert.match(err.message, /cannot be the same/i);
        return true;
      }
    );
  });

  // -------------------------------------------------------------
  // Scenario 7: Prevent negative stock and duplicate receipts
  // -------------------------------------------------------------
  await t.test('Scenario 7: Prevent negative stock and duplicate receipts', async () => {
    // 1. Negative stock prevention via adjustment
    await assert.rejects(
      async () => {
        await inventoryService.adjustStock({
          productId: testProductId,
          warehouseId: testWarehouseA,
          quantityDelta: -99999,
          reason: 'Attempting invalid deduction',
        });
      },
      (err) => {
        assert.equal(err.status, 409, 'Should return 409 Conflict on negative stock attempt');
        assert.match(err.message, /cannot adjust stock below 0/i);
        return true;
      }
    );

    // 2. Duplicate receipt idempotency
    const idempotencyKey = `IDEM-TEST-${Date.now()}`;
    const firstReceipt = await inventoryService.receiveStock({
      productId: testProductId,
      warehouseId: testWarehouseA,
      quantity: 5,
      idempotencyKey,
      notes: 'First receipt with idempotency key',
    });
    assert.ok(firstReceipt.receiptId);

    // Stock before second call
    const stockBefore = await db.query(
      'SELECT on_hand FROM stock_records WHERE product_id = $1 AND warehouse_id = $2',
      [testProductId, testWarehouseA]
    );

    // Second call with same idempotency key must not increment stock
    const secondReceipt = await inventoryService.receiveStock({
      productId: testProductId,
      warehouseId: testWarehouseA,
      quantity: 5,
      idempotencyKey,
      notes: 'Duplicate receipt attempt',
    });
    assert.match(secondReceipt.message, /already processed/i);

    const stockAfter = await db.query(
      'SELECT on_hand FROM stock_records WHERE product_id = $1 AND warehouse_id = $2',
      [testProductId, testWarehouseA]
    );
    assert.equal(stockAfter.rows[0].on_hand, stockBefore.rows[0].on_hand, 'Stock must not double increment');
  });

  // -------------------------------------------------------------
  // Scenario 8: Verify successful stock changes create stock movements
  // -------------------------------------------------------------
  await t.test('Scenario 8: Verify stock movements created for every stock change', async () => {
    const adjustReason = `Audit test adjustment ${Date.now()}`;
    await inventoryService.adjustStock({
      productId: testProductId,
      warehouseId: testWarehouseA,
      quantityDelta: 3,
      reason: adjustReason,
    });

    const movements = await inventoryService.getStockMovements({
      warehouseId: testWarehouseA,
      productId: testProductId,
      limit: 5,
    });

    const found = movements.find((m) => m.reason === adjustReason);
    assert.ok(found, 'Corresponding stock movement record was persisted');
    assert.equal(found.movement_type, 'ADJUSTMENT');
    assert.equal(found.quantity, 3);
  });

  // -------------------------------------------------------------
  // Scenario 9: Verify low-stock events reach notification consumer
  // -------------------------------------------------------------
  await t.test('Scenario 9: Verify low-stock events create notifications', async () => {
    // WH02 Keyboard has available 10 <= reorder 15, which was inserted during seed
    // Let's verify a low-stock notification is present in notifications table
    const notifications = await db.query(
      `SELECT * FROM notifications WHERE routing_key = 'stock.low'`
    );
    assert.ok(notifications.rows.length > 0, 'Low-stock notification exists and was processed by consumer');
    assert.match(notifications.rows[0].title, /low stock/i);
  });

  // -------------------------------------------------------------
  // Scenario 10: Verify repeated supplier event does not duplicate effect
  // -------------------------------------------------------------
  await t.test('Scenario 10: Verify repeated supplier event does not duplicate stock', async () => {
    const supplierEventId = `SUPP-EVT-${Date.now()}`;
    const initialStock = await db.query(
      'SELECT on_hand FROM stock_records WHERE product_id = $1 AND warehouse_id = $2',
      [testProductId, testWarehouseA]
    );
    const startOnHand = initialStock.rows[0].on_hand;

    // 1st simulation
    const firstUpdate = await procurementService.simulateSupplierUpdate({
      supplierEventId,
      productId: testProductId,
      warehouseId: testWarehouseA,
      quantity: 8,
    });
    assert.equal(firstUpdate.status, 'PROCESSED');

    const stockAfterFirst = await db.query(
      'SELECT on_hand FROM stock_records WHERE product_id = $1 AND warehouse_id = $2',
      [testProductId, testWarehouseA]
    );
    assert.equal(stockAfterFirst.rows[0].on_hand, startOnHand + 8);

    // 2nd simulation with identical supplierEventId
    const secondUpdate = await procurementService.simulateSupplierUpdate({
      supplierEventId,
      productId: testProductId,
      warehouseId: testWarehouseA,
      quantity: 8,
    });
    assert.equal(secondUpdate.status, 'IGNORED_DUPLICATE');

    const stockAfterSecond = await db.query(
      'SELECT on_hand FROM stock_records WHERE product_id = $1 AND warehouse_id = $2',
      [testProductId, testWarehouseA]
    );
    assert.equal(stockAfterSecond.rows[0].on_hand, startOnHand + 8, 'Stock must not increase on duplicate event');
  });

  // -------------------------------------------------------------
  // Scenario 11: Verify failed database transaction leaves no partial stock changes
  // -------------------------------------------------------------
  await t.test('Scenario 11: Failed database transaction leaves zero partial changes (atomic rollback)', async () => {
    const stockBefore = await db.query(
      'SELECT on_hand FROM stock_records WHERE product_id = $1 AND warehouse_id = $2',
      [testProductId, testWarehouseA]
    );
    const onHandBefore = stockBefore.rows[0].on_hand;

    // Execute transaction that updates stock but fails on subsequent step
    try {
      await db.withTransaction(async (client) => {
        await client.query(
          'UPDATE stock_records SET on_hand = on_hand + 50 WHERE product_id = $1 AND warehouse_id = $2',
          [testProductId, testWarehouseA]
        );
        // Force an error
        throw new Error('Forced mid-transaction explosion to test rollback');
      });
    } catch (err) {
      assert.match(err.message, /forced mid-transaction explosion/i);
    }

    // Verify stock was rolled back completely
    const stockAfter = await db.query(
      'SELECT on_hand FROM stock_records WHERE product_id = $1 AND warehouse_id = $2',
      [testProductId, testWarehouseA]
    );
    assert.equal(stockAfter.rows[0].on_hand, onHandBefore, 'Stock must be identical to pre-transaction value');
  });

  // -------------------------------------------------------------
  // Scenario 12: Verify transactional outbox retries pending events
  // -------------------------------------------------------------
  await t.test('Scenario 12: Transactional outbox processes pending events', async () => {
    // Insert a pending outbox event directly
    const testOutboxId = (
      await db.query(
        `INSERT INTO outbox_events (event_type, routing_key, payload, status)
         VALUES ('TEST_EVENT', 'stock.received', '{"test": true}', 'PENDING')
         RETURNING id`
      )
    ).rows[0].id;

    // Trigger outbox processor batch
    await processOutboxBatch();

    // Verify status updated to PUBLISHED
    const checkOutbox = await db.query(
      'SELECT status FROM outbox_events WHERE id = $1',
      [testOutboxId]
    );
    assert.equal(checkOutbox.rows[0].status, 'PUBLISHED', 'Pending outbox event was published by worker');
  });
});
