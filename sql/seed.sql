-- Seed Data for Warehouse and Supply Chain Inventory System
-- Safe idempotency with ON CONFLICT DO NOTHING

-- 1. Warehouses
INSERT INTO warehouses (id, code, name, location, address, status)
VALUES 
    ('WH01', 'WH01', 'Main Central Warehouse', 'Sector 4, Industrial Zone, New Delhi', 'Building A-12, Logistics Park', 'ACTIVE'),
    ('WH02', 'WH02', 'Secondary Regional Depot', 'Phase 2, Tech Corridor, Bengaluru', 'Plot 45, Warehousing Enclave', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- 2. Products
INSERT INTO products (id, sku, name, description, unit, reorder_level, status)
VALUES
    ('a0000000-0000-0000-0000-000000000001', 'LAP001', 'High-Performance Laptop', '15-inch, 16GB RAM, 512GB SSD enterprise workstation', 'units', 10, 'ACTIVE'),
    ('a0000000-0000-0000-0000-000000000002', 'MOU001', 'Ergonomic Optical Mouse', 'Wireless dual-mode 2.4GHz / Bluetooth mouse', 'units', 20, 'ACTIVE'),
    ('a0000000-0000-0000-0000-000000000003', 'KEY001', 'Mechanical Keyboard', 'Compact 75% hot-swappable mechanical keyboard', 'units', 15, 'ACTIVE')
ON CONFLICT (sku) DO NOTHING;

-- 3. Initial Stock Records
-- Laptop: WH01 = 50, WH02 = 15
-- Mouse: WH01 = 100, WH02 = 25
-- Keyboard: WH01 = 30, WH02 = 10 (Available 10 <= Reorder 15 -> LOW STOCK alert)
INSERT INTO stock_records (product_id, warehouse_id, on_hand, reserved)
VALUES
    ('a0000000-0000-0000-0000-000000000001', 'WH01', 50, 0),
    ('a0000000-0000-0000-0000-000000000001', 'WH02', 15, 0),
    ('a0000000-0000-0000-0000-000000000002', 'WH01', 100, 0),
    ('a0000000-0000-0000-0000-000000000002', 'WH02', 25, 0),
    ('a0000000-0000-0000-0000-000000000003', 'WH01', 30, 0),
    ('a0000000-0000-0000-0000-000000000003', 'WH02', 10, 0)
ON CONFLICT (product_id, warehouse_id) DO UPDATE 
SET on_hand = EXCLUDED.on_hand, reserved = EXCLUDED.reserved;

-- 4. Initial Stock Movements (Audit Records)
INSERT INTO stock_movements (product_id, warehouse_id, movement_type, quantity, previous_on_hand, new_on_hand, previous_reserved, new_reserved, reference_type, reference_id, reason)
VALUES
    ('a0000000-0000-0000-0000-000000000001', 'WH01', 'RECEIPT', 50, 0, 50, 0, 0, 'INITIAL_SEED', 'SEED-001', 'Initial warehouse inventory baseline'),
    ('a0000000-0000-0000-0000-000000000001', 'WH02', 'RECEIPT', 15, 0, 15, 0, 0, 'INITIAL_SEED', 'SEED-002', 'Initial warehouse inventory baseline'),
    ('a0000000-0000-0000-0000-000000000002', 'WH01', 'RECEIPT', 100, 0, 100, 0, 0, 'INITIAL_SEED', 'SEED-003', 'Initial warehouse inventory baseline'),
    ('a0000000-0000-0000-0000-000000000002', 'WH02', 'RECEIPT', 25, 0, 25, 0, 0, 'INITIAL_SEED', 'SEED-004', 'Initial warehouse inventory baseline'),
    ('a0000000-0000-0000-0000-000000000003', 'WH01', 'RECEIPT', 30, 0, 30, 0, 0, 'INITIAL_SEED', 'SEED-005', 'Initial warehouse inventory baseline'),
    ('a0000000-0000-0000-0000-000000000003', 'WH02', 'RECEIPT', 10, 0, 10, 0, 0, 'INITIAL_SEED', 'SEED-006', 'Initial warehouse inventory baseline - Low Stock Trigger')
ON CONFLICT DO NOTHING;

-- 5. Suppliers
INSERT INTO suppliers (id, name, contact_info, status)
VALUES
    ('b0000000-0000-0000-0000-000000000001', 'Apex Electronics Ltd.', 'sales@apexelectronics.example.com | +91 98765 43210', 'ACTIVE'),
    ('b0000000-0000-0000-0000-000000000002', 'Global Peripheral Systems', 'orders@globalperipherals.example.com | +91 91234 56789', 'ACTIVE')
ON CONFLICT DO NOTHING;

-- 6. Sample Purchase Orders
INSERT INTO purchase_orders (id, po_number, supplier_id, status, notes)
VALUES
    ('c0000000-0000-0000-0000-000000000001', 'PO-2026-001', 'b0000000-0000-0000-0000-000000000001', 'APPROVED', 'Urgent replenishment for Q4'),
    ('c0000000-0000-0000-0000-000000000002', 'PO-2026-002', 'b0000000-0000-0000-0000-000000000002', 'PARTIALLY_RECEIVED', 'Standing order for accessories')
ON CONFLICT (po_number) DO NOTHING;

INSERT INTO purchase_order_items (id, po_id, product_id, quantity_ordered, quantity_received)
VALUES
    ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 20, 0),
    ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 15, 0),
    ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 50, 20)
ON CONFLICT DO NOTHING;

-- 7. Seed Low-Stock Outbox Notification for Demonstrating RabbitMQ Delivery
INSERT INTO outbox_events (id, event_type, routing_key, payload, status)
VALUES (
    gen_random_uuid(),
    'LOW_STOCK_DETECTED',
    'stock.low',
    jsonb_build_object(
        'product_id', 'a0000000-0000-0000-0000-000000000003',
        'product_name', 'Mechanical Keyboard',
        'sku', 'KEY001',
        'warehouse_id', 'WH02',
        'on_hand', 10,
        'reserved', 0,
        'available', 10,
        'reorder_level', 15,
        'alert', 'Available stock (10) is below reorder level (15) at warehouse WH02',
        'timestamp', CURRENT_TIMESTAMP
    ),
    'PENDING'
);
