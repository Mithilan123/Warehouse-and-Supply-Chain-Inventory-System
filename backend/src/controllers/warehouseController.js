const warehouseService = require('../services/warehouseService');

async function getWarehouses(req, res, next) {
  try {
    const warehouses = await warehouseService.getAllWarehouses();
    res.json({ success: true, data: warehouses });
  } catch (err) {
    next(err);
  }
}

async function createWarehouse(req, res, next) {
  try {
    const warehouse = await warehouseService.createWarehouse(req.body);
    res.status(201).json({ success: true, data: warehouse });
  } catch (err) {
    next(err);
  }
}

async function getWarehouseStock(req, res, next) {
  try {
    const data = await warehouseService.getWarehouseStock(req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getWarehouses,
  createWarehouse,
  getWarehouseStock,
};
