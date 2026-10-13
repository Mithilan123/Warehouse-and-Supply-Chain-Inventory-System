const inventoryService = require('../services/inventoryService');

async function getStock(req, res, next) {
  try {
    const stock = await inventoryService.getStockMatrix({
      warehouseId: req.query.warehouse_id,
      productId: req.query.product_id,
      lowStockOnly: req.query.low_stock,
    });
    res.json({ success: true, data: stock });
  } catch (err) {
    next(err);
  }
}

async function receiveStock(req, res, next) {
  try {
    const { productId, warehouseId, quantity, notes, idempotencyKey, supplierEventId } = req.body;
    const result = await inventoryService.receiveStock({
      productId,
      warehouseId,
      quantity,
      notes,
      idempotencyKey,
      supplierEventId,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function adjustStock(req, res, next) {
  try {
    const { productId, warehouseId, quantityDelta, reason } = req.body;
    const result = await inventoryService.adjustStock({
      productId,
      warehouseId,
      quantityDelta,
      reason,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function modifyReservation(req, res, next) {
  try {
    const { productId, warehouseId, quantity, action, reason } = req.body;
    const result = await inventoryService.modifyReservation({
      productId,
      warehouseId,
      quantity,
      action: action || 'RESERVE',
      reason,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function getMovements(req, res, next) {
  try {
    const movements = await inventoryService.getStockMovements({
      warehouseId: req.query.warehouse_id,
      productId: req.query.product_id,
      limit: req.query.limit,
    });
    res.json({ success: true, data: movements });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStock,
  receiveStock,
  adjustStock,
  modifyReservation,
  getMovements,
};
