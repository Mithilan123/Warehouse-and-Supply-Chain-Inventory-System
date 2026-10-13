const express = require('express');
const router = express.Router();

const productController = require('../controllers/productController');
const warehouseController = require('../controllers/warehouseController');
const inventoryController = require('../controllers/inventoryController');
const procurementController = require('../controllers/procurementController');
const transferController = require('../controllers/transferController');
const shipmentController = require('../controllers/shipmentController');
const notificationController = require('../controllers/notificationController');
const dashboardController = require('../controllers/dashboardController');

// System Health & Dashboard
router.get('/health', dashboardController.getHealth);
router.get('/dashboard/stats', dashboardController.getDashboardStats);

// Auth / Role endpoint
router.get('/auth/me', (req, res) => {
  res.json({
    success: true,
    user: req.user,
    availableRoles: ['Admin', 'Inventory Manager', 'Warehouse Supervisor', 'Procurement Specialist'],
  });
});

// Products (Module B)
router.get('/products', productController.getProducts);
router.get('/products/:id', productController.getProduct);
router.post('/products', productController.createProduct);
router.put('/products/:id', productController.updateProduct);

// Warehouses (Module C)
router.get('/warehouses', warehouseController.getWarehouses);
router.post('/warehouses', warehouseController.createWarehouse);
router.get('/warehouses/:id/stock', warehouseController.getWarehouseStock);

// Inventory (Module D)
router.get('/stock', inventoryController.getStock);
router.post('/receipts', inventoryController.receiveStock);
router.post('/stock/adjustments', inventoryController.adjustStock);
router.post('/stock/reservations', inventoryController.modifyReservation);
router.get('/stock/movements', inventoryController.getMovements);

// Procurement & Suppliers (Module E)
router.get('/suppliers', procurementController.getSuppliers);
router.post('/suppliers', procurementController.createSupplier);
router.get('/purchase-orders', procurementController.getPurchaseOrders);
router.post('/purchase-orders', procurementController.createPurchaseOrder);
router.post('/purchase-orders/:id/approve', procurementController.approvePurchaseOrder);
router.post('/purchase-orders/:id/receive', procurementController.receivePurchaseOrder);
router.post('/procurement/simulate-supplier-update', procurementController.simulateSupplierUpdate);

// Warehouse Transfers (Module F)
router.get('/transfers', transferController.getTransfers);
router.post('/transfers', transferController.createTransfer);
router.post('/transfers/:id/dispatch', transferController.dispatchTransfer);
router.post('/transfers/:id/receive', transferController.receiveTransfer);
router.post('/transfers/:id/cancel', transferController.cancelTransfer);

// Shipments (Module G)
router.get('/shipments', shipmentController.getShipments);
router.post('/shipments', shipmentController.createShipment);
router.post('/shipments/:id/pick', shipmentController.pickShipment);
router.post('/shipments/:id/pack', shipmentController.packShipment);
router.post('/shipments/:id/dispatch', shipmentController.dispatchShipment);

// Notifications (Module H)
router.get('/notifications', notificationController.getNotifications);
router.put('/notifications/mark-read', notificationController.markNotificationsRead);

// Demo helper: Reset seed data
router.post('/demo/reset-seed', async (req, res, next) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const db = require('../config/db');
    const seedPath = path.resolve(__dirname, '../../../sql/seed.sql');
    const seedSql = fs.readFileSync(seedPath, 'utf8');
    await db.query(seedSql);
    res.json({ success: true, message: 'Database reset to initial demo seed baseline successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
