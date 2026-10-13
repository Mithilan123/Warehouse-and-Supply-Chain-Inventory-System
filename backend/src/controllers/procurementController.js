const procurementService = require('../services/procurementService');

async function getSuppliers(req, res, next) {
  try {
    const suppliers = await procurementService.getAllSuppliers();
    res.json({ success: true, data: suppliers });
  } catch (err) {
    next(err);
  }
}

async function createSupplier(req, res, next) {
  try {
    const supplier = await procurementService.createSupplier(req.body);
    res.status(201).json({ success: true, data: supplier });
  } catch (err) {
    next(err);
  }
}

async function getPurchaseOrders(req, res, next) {
  try {
    const orders = await procurementService.getAllPurchaseOrders();
    res.json({ success: true, data: orders });
  } catch (err) {
    next(err);
  }
}

async function createPurchaseOrder(req, res, next) {
  try {
    const order = await procurementService.createPurchaseOrder(req.body);
    res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
}

async function approvePurchaseOrder(req, res, next) {
  try {
    const order = await procurementService.approvePurchaseOrder(req.params.id);
    res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
}

async function receivePurchaseOrder(req, res, next) {
  try {
    const result = await procurementService.receivePurchaseOrderItems(req.params.id, req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function simulateSupplierUpdate(req, res, next) {
  try {
    const result = await procurementService.simulateSupplierUpdate(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSuppliers,
  createSupplier,
  getPurchaseOrders,
  createPurchaseOrder,
  approvePurchaseOrder,
  receivePurchaseOrder,
  simulateSupplierUpdate,
};
