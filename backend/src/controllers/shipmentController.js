const shipmentService = require('../services/shipmentService');

async function getShipments(req, res, next) {
  try {
    const shipments = await shipmentService.getAllShipments();
    res.json({ success: true, data: shipments });
  } catch (err) {
    next(err);
  }
}

async function createShipment(req, res, next) {
  try {
    const shipment = await shipmentService.createShipment(req.body);
    res.status(201).json({ success: true, data: shipment });
  } catch (err) {
    next(err);
  }
}

async function pickShipment(req, res, next) {
  try {
    const result = await shipmentService.pickShipment(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function packShipment(req, res, next) {
  try {
    const result = await shipmentService.packShipment(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function dispatchShipment(req, res, next) {
  try {
    const result = await shipmentService.dispatchShipment(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getShipments,
  createShipment,
  pickShipment,
  packShipment,
  dispatchShipment,
};
