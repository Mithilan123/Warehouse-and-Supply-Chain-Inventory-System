import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import {
  Boxes,
  Plus,
  Sliders,
  BookmarkCheck,
  AlertTriangle,
  RefreshCw,
  Filter,
} from 'lucide-react';

export default function InventoryPage() {
  const [stockList, setStockList] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState('');
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals
  const [activeModal, setActiveModal] = useState(null); // 'RECEIVE' | 'ADJUST' | 'RESERVE'
  const [modalError, setModalError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);

  // Form States
  const [receiveForm, setReceiveForm] = useState({
    productId: '',
    warehouseId: 'WH01',
    quantity: '',
    notes: '',
  });

  const [adjustForm, setAdjustForm] = useState({
    productId: '',
    warehouseId: '',
    quantityDelta: '',
    reason: '',
  });

  const [reserveForm, setReserveForm] = useState({
    productId: '',
    warehouseId: '',
    quantity: '',
    action: 'RESERVE',
    reason: '',
  });

  async function loadData() {
    try {
      setLoading(true);
      const [stockRes, whRes, prodRes] = await Promise.all([
        api.getStock({
          warehouse_id: selectedWarehouseFilter || undefined,
          low_stock: lowStockFilter ? 'true' : undefined,
        }),
        api.getWarehouses(),
        api.getProducts(),
      ]);
      setStockList(stockRes.data);
      setWarehouses(whRes.data);
      setProducts(prodRes.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [selectedWarehouseFilter, lowStockFilter]);

  // Open Receive Modal
  function openReceiveModal(item = null) {
    setSelectedItem(item);
    setReceiveForm({
      productId: item ? item.product_id : (products[0]?.id || ''),
      warehouseId: item ? item.warehouse_id : (warehouses[0]?.id || 'WH01'),
      quantity: '',
      notes: '',
    });
    setModalError(null);
    setActiveModal('RECEIVE');
  }

  // Open Adjust Modal
  function openAdjustModal(item) {
    setSelectedItem(item);
    setAdjustForm({
      productId: item.product_id,
      warehouseId: item.warehouse_id,
      quantityDelta: '',
      reason: '',
    });
    setModalError(null);
    setActiveModal('ADJUST');
  }

  // Open Reserve Modal
  function openReserveModal(item) {
    setSelectedItem(item);
    setReserveForm({
      productId: item.product_id,
      warehouseId: item.warehouse_id,
      quantity: '',
      action: 'RESERVE',
      reason: '',
    });
    setModalError(null);
    setActiveModal('RESERVE');
  }

  // Handle Submit Receive
  async function handleReceiveSubmit(e) {
    e.preventDefault();
    setModalError(null);
    try {
      await api.receiveStock({
        productId: receiveForm.productId,
        warehouseId: receiveForm.warehouseId,
        quantity: parseInt(receiveForm.quantity, 10),
        notes: receiveForm.notes,
      });
      setActiveModal(null);
      loadData();
    } catch (err) {
      setModalError(err.message);
    }
  }

  // Handle Submit Adjust
  async function handleAdjustSubmit(e) {
    e.preventDefault();
    setModalError(null);
    try {
      await api.adjustStock({
        productId: adjustForm.productId,
        warehouseId: adjustForm.warehouseId,
        quantityDelta: parseInt(adjustForm.quantityDelta, 10),
        reason: adjustForm.reason,
      });
      setActiveModal(null);
      loadData();
    } catch (err) {
      setModalError(err.message);
    }
  }

  // Handle Submit Reserve / Release
  async function handleReserveSubmit(e) {
    e.preventDefault();
    setModalError(null);
    try {
      await api.modifyReservation({
        productId: reserveForm.productId,
        warehouseId: reserveForm.warehouseId,
        quantity: parseInt(reserveForm.quantity, 10),
        action: reserveForm.action,
        reason: reserveForm.reason,
      });
      setActiveModal(null);
      loadData();
    } catch (err) {
      setModalError(err.message);
    }
  }

  return (
    <div className="page-body">
      {/* Formula Explanatory Header */}
      <div className="alert-box info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <strong>Authoritative Rules:</strong> <code>Available Stock = On-hand Stock - Reserved Stock</code> • <code>Low Stock = Available Stock ≤ Reorder Level</code>.
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary btn-sm" onClick={() => openReceiveModal()}>
            <Plus size={14} />
            <span>Receive Goods</span>
          </button>
        </div>
      </div>

      <div className="card">
        {/* Filters and Header */}
        <div className="card-header">
          <div className="card-title">
            <Boxes size={18} color="#2563eb" />
            <span>Master Inventory Ledger</span>
          </div>

          <div className="card-actions">
            {/* Warehouse Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Filter size={15} color="#64748b" />
              <select
                className="role-select"
                value={selectedWarehouseFilter}
                onChange={(e) => setSelectedWarehouseFilter(e.target.value)}
              >
                <option value="">All Warehouses</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.id} - {w.name}</option>
                ))}
              </select>
            </div>

            {/* Low Stock Toggle Button */}
            <button
              className={`btn btn-sm ${lowStockFilter ? 'btn-danger' : 'btn-secondary'}`}
              onClick={() => setLowStockFilter(!lowStockFilter)}
            >
              <AlertTriangle size={14} />
              <span>{lowStockFilter ? 'Showing Low Stock Only' : 'Filter Low Stock'}</span>
            </button>

            <button className="btn btn-secondary btn-sm" onClick={loadData} title="Refresh">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {error && <div className="alert-box danger" style={{ margin: '16px' }}>{error}</div>}

        {/* Master Inventory Table */}
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Warehouse</th>
                <th>On-Hand</th>
                <th>Reserved</th>
                <th>Available</th>
                <th>Reorder Level</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && stockList.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', color: '#64748b' }}>Querying authoritative stock records...</td>
                </tr>
              ) : stockList.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', color: '#64748b' }}>No inventory matches filter criteria</td>
                </tr>
              ) : (
                stockList.map((row) => (
                  <tr key={row.stock_id}>
                    <td>
                      <strong>{row.product_name}</strong>
                      <div className="font-mono" style={{ fontSize: '11px', color: '#2563eb', fontWeight: '700' }}>
                        {row.sku}
                      </div>
                    </td>
                    <td>
                      <strong>{row.warehouse_id}</strong>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{row.warehouse_name}</div>
                    </td>
                    <td style={{ fontWeight: '600' }}>
                      {row.on_hand} <span style={{ fontSize: '11px', color: '#64748b' }}>{row.unit}</span>
                    </td>
                    <td style={{ fontWeight: '600', color: row.reserved > 0 ? '#f59e0b' : '#64748b' }}>
                      {row.reserved} <span style={{ fontSize: '11px', color: '#64748b' }}>{row.unit}</span>
                    </td>
                    <td style={{ fontWeight: '700', fontSize: '14px', color: row.status === 'LOW_STOCK' ? '#dc2626' : '#10b981' }}>
                      {row.available} <span style={{ fontSize: '11px' }}>{row.unit}</span>
                    </td>
                    <td>
                      {row.reorder_level} <span style={{ fontSize: '11px', color: '#64748b' }}>{row.unit}</span>
                    </td>
                    <td><StatusBadge status={row.status} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => openReceiveModal(row)}
                          title="Receive additional stock"
                        >
                          <Plus size={12} />
                          <span>Receive</span>
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => openAdjustModal(row)}
                          title="Adjust stock with mandatory reason"
                        >
                          <Sliders size={12} />
                          <span>Adjust</span>
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => openReserveModal(row)}
                          title="Reserve or release stock"
                        >
                          <BookmarkCheck size={12} />
                          <span>Reserve</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 1. Modal: Receive Stock */}
      <Modal
        isOpen={activeModal === 'RECEIVE'}
        onClose={() => setActiveModal(null)}
        title="Receive Inventory (Inbound Stock)"
      >
        {modalError && <div className="alert-box danger">{modalError}</div>}
        <form onSubmit={handleReceiveSubmit}>
          <div className="form-group">
            <label className="form-label">Select Product *</label>
            <select
              className="form-select"
              required
              value={receiveForm.productId}
              onChange={(e) => setReceiveForm({ ...receiveForm, productId: e.target.value })}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Destination Warehouse *</label>
            <select
              className="form-select"
              required
              value={receiveForm.warehouseId}
              onChange={(e) => setReceiveForm({ ...receiveForm, warehouseId: e.target.value })}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.id} — {w.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Quantity to Receive *</label>
            <input
              type="number"
              className="form-input"
              min="1"
              required
              placeholder="e.g. 25"
              value={receiveForm.quantity}
              onChange={(e) => setReceiveForm({ ...receiveForm, quantity: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Notes / Receipt Reference</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Direct supplier delivery consignment"
              value={receiveForm.notes}
              onChange={(e) => setReceiveForm({ ...receiveForm, notes: e.target.value })}
            />
          </div>

          <div className="modal-footer" style={{ margin: '16px -24px -24px', padding: '16px 24px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setActiveModal(null)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Confirm Receipt
            </button>
          </div>
        </form>
      </Modal>

      {/* 2. Modal: Stock Adjustment (with Mandatory Reason) */}
      <Modal
        isOpen={activeModal === 'ADJUST'}
        onClose={() => setActiveModal(null)}
        title={`Adjust Stock: ${selectedItem?.product_name} (${selectedItem?.warehouse_id})`}
      >
        {modalError && <div className="alert-box danger">{modalError}</div>}
        <form onSubmit={handleAdjustSubmit}>
          <div className="alert-box warning">
            Current On-Hand: <strong>{selectedItem?.on_hand}</strong> units | Reserved: <strong>{selectedItem?.reserved}</strong> units.
            Cannot adjust On-Hand below Reserved or below 0.
          </div>

          <div className="form-group">
            <label className="form-label">Quantity Adjustment Delta (+ or -) *</label>
            <input
              type="number"
              className="form-input"
              required
              placeholder="e.g. +5 for found stock, -2 for damaged"
              value={adjustForm.quantityDelta}
              onChange={(e) => setAdjustForm({ ...adjustForm, quantityDelta: e.target.value })}
            />
            <small style={{ color: '#64748b' }}>Enter a positive number to increase or negative number to decrease.</small>
          </div>

          <div className="form-group">
            <label className="form-label">Mandatory Reason *</label>
            <textarea
              className="form-textarea"
              rows="3"
              required
              placeholder="e.g. Physical inventory cycle count variance / Damaged in transit"
              value={adjustForm.reason}
              onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
            />
          </div>

          <div className="modal-footer" style={{ margin: '16px -24px -24px', padding: '16px 24px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setActiveModal(null)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Apply Adjustment
            </button>
          </div>
        </form>
      </Modal>

      {/* 3. Modal: Reserve / Release Stock */}
      <Modal
        isOpen={activeModal === 'RESERVE'}
        onClose={() => setActiveModal(null)}
        title={`Reserve / Release Stock: ${selectedItem?.product_name}`}
      >
        {modalError && <div className="alert-box danger">{modalError}</div>}
        <form onSubmit={handleReserveSubmit}>
          <div className="alert-box info">
            Warehouse: <strong>{selectedItem?.warehouse_id}</strong> | Available to Reserve: <strong>{selectedItem?.available}</strong> | Currently Reserved: <strong>{selectedItem?.reserved}</strong>
          </div>

          <div className="form-group">
            <label className="form-label">Action *</label>
            <div style={{ display: 'flex', gap: '16px', marginTop: '6px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="action"
                  value="RESERVE"
                  checked={reserveForm.action === 'RESERVE'}
                  onChange={() => setReserveForm({ ...reserveForm, action: 'RESERVE' })}
                />
                <span>Hold / Reserve Stock</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="action"
                  value="RELEASE"
                  checked={reserveForm.action === 'RELEASE'}
                  onChange={() => setReserveForm({ ...reserveForm, action: 'RELEASE' })}
                />
                <span>Release Reservation</span>
              </label>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Quantity *</label>
            <input
              type="number"
              className="form-input"
              min="1"
              required
              placeholder="e.g. 5"
              value={reserveForm.quantity}
              onChange={(e) => setReserveForm({ ...reserveForm, quantity: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Reason / Purpose</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Manual allocation for executive sample"
              value={reserveForm.reason}
              onChange={(e) => setReserveForm({ ...reserveForm, reason: e.target.value })}
            />
          </div>

          <div className="modal-footer" style={{ margin: '16px -24px -24px', padding: '16px 24px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setActiveModal(null)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Confirm {reserveForm.action === 'RESERVE' ? 'Hold' : 'Release'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
