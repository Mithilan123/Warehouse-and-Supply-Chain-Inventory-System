const transferService = require('../services/transferService');

async function getTransfers(req, res, next) {
  try {
    const transfers = await transferService.getAllTransfers();
    res.json({ success: true, data: transfers });
  } catch (err) {
    next(err);
  }
}

async function createTransfer(req, res, next) {
  try {
    const transfer = await transferService.createTransfer(req.body);
    res.status(201).json({ success: true, data: transfer });
  } catch (err) {
    next(err);
  }
}

async function dispatchTransfer(req, res, next) {
  try {
    const result = await transferService.dispatchTransfer(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function receiveTransfer(req, res, next) {
  try {
    const result = await transferService.receiveTransfer(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

async function cancelTransfer(req, res, next) {
  try {
    const result = await transferService.cancelTransfer(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getTransfers,
  createTransfer,
  dispatchTransfer,
  receiveTransfer,
  cancelTransfer,
};
