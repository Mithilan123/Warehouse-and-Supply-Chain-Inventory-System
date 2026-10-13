import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import { FileText, Plus, Check, PackagePlus, Zap } from 'lucide-react';

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Create PO Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [poForm, setPoForm] = useState({
    supplierId: '',
    productId: '',
    quantity: '',
    notes: '',
  });

  // Receive Items Modal
  const [receiveModalPo, setReceiveModalPo] = useState(null);
  const [receiveWarehouse, setReceiveWarehouse] = useState('WH01');
  const [receiveQuantities, setReceiveQuantities] = useState({});
  const [receiveError, setReceiveError] = useState(null);

  // Simulate Supplier Update Modal
  const [isSimulateOpen, setIsSimulateOpen] = useState(false);
  const [simulateForm, setSimulateForm] = useState({
    supplierEventId: `EVT-SUPP-${Math.floor(1000 + Math.random() * 9000)}`,
    productId: '',
    warehouseId: 'WH01',
    quantity: '10',
  });
  const [simulateResult, setSimulateResult] = useState(null);

  async function loadData() {
    try {
      setLoading(true);
      const [poRes, suppRes, prodRes, whRes] = await Promise.all([
        api.getPurchaseOrders(),
        api.getSuppliers(),
        api.getProducts(),
        api.getWarehouses(),
      ]);
      setOrders(poRes.data);
      setSuppliers(suppRes.data);
      setProducts(prodRes.data);
      setWarehouses(whRes.data);
      if (prodRes.data.length > 0 && !simulateForm.productId) {
        setSimulateForm((prev) => ({ ...prev, productId: prodRes.data[0].id }));
      }
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleCreatePo(e) {
    e.preventDefault();
    setCreateError(null);
    try {
      await api.createPurchaseOrder({
        supplierId: poForm.supplierId,
        items: [{ productId: poForm.productId, quantity: parseInt(poForm.quantity, 10) }],
        notes: poForm.notes,
      });
      setIsCreateOpen(false);
      loadData();
    } catch (err) {
      setCreateError(err.message);
    }
  }

  async function handleApprovePo(id) {
    try {
      await api.approvePurchaseOrder(id);
      loadData();
    } catch (err) {
      alert(`Approval error: ${err.message}`);
    }
  }

  function openReceiveModal(po) {
    setReceiveModalPo(po);
    const initialQtys = {};
    po.items.forEach((item) => {
      initialQtys[item.product_id] = item.remaining_quantity > 0 ? item.remaining_quantity : '';
    });
    setReceiveQuantities(initialQtys);
    setReceiveError(null);
  }

  async function handleReceiveSubmit(e) {
    e.preventDefault();
    setReceiveError(null);
    try {
      const itemsToReceive = [];
      for (const [prodId, qty] of Object.entries(receiveQuantities)) {
        const parsed = parseInt(qty, 10);
        if (!isNaN(parsed) && parsed > 0) {
          itemsToReceive.push({ productId: prodId, quantity: parsed });
        }
      }

      if (itemsToReceive.length === 0) {
        setReceiveError('Please enter a quantity greater than 0 for at least one item');
        return;
      }

      await api.receivePurchaseOrder(receiveModalPo.id, {
        warehouseId: receiveWarehouse,
        items: itemsToReceive,
        notes: `Batch receiving for ${receiveModalPo.po_number}`,
      });

      setReceiveModalPo(null);
      loadData();
    } catch (err) {
      setReceiveError(err.message);
    }
  }

  async function handleSimulateSupplier(e) {
    e.preventDefault();
    try {
      const res = await api.simulateSupplierUpdate({
        supplierEventId: simulateForm.supplierEventId,
        productId: simulateForm.productId,
        warehouseId: simulateForm.warehouseId,
        quantity: parseInt(simulateForm.quantity, 10),
      });
      setSimulateResult(res.data);
      loadData();
    } catch (err) {
      setSimulateResult({ status: 'ERROR', message: err.message });
    }
  }

  return (
    <div className="page-body">
      {/* Simulation & Lifecycle Info Banner */}
      <div className="alert-box info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <strong>Purchase Order Lifecycle:</strong> <code>CREATED → APPROVED → PARTIALLY_RECEIVED → RECEIVED</code>.
          Multi-batch receiving strictly enforces remaining quantity constraints.
        </div>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => {
            setSimulateResult(null);
            setIsSimulateOpen(true);
          }}
          style={{ background: '#fef3c7', borderColor: '#fde68a', color: '#92400e', fontWeight: '700' }}
        >
          <Zap size={14} />
          <span>Simulate Supplier Update</span>
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <FileText size={18} color="#2563eb" />
            <span>Purchase Orders</span>
          </div>

          <div className="card-actions">
            <button
              className="btn btn-primary"
              onClick={() => {
                setPoForm({
                  supplierId: suppliers[0]?.id || '',
                  productId: products[0]?.id || '',
                  quantity: '',
                  notes: '',
                });
                setCreateError(null);
                setIsCreateOpen(true);
              }}
            >
              <Plus size={16} />
              <span>Create Purchase Order</span>
            </button>
          </div>
        </div>

        {error && <div className="alert-box danger" style={{ margin: '16px' }}>{error}</div>}

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>PO Number</th>
                <th>Supplier</th>
                <th>Items Ordered</th>
                <th>Ordered vs Received</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && orders.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', color: '#64748b' }}>Loading purchase orders...</td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', color: '#64748b' }}>No purchase orders recorded</td>
                </tr>
              ) : (
                orders.map((po) => (
                  <tr key={po.id}>
                    <td>
                      <span className="font-mono" style={{ fontWeight: '700', color: '#2563eb' }}>
                        {po.po_number}
                      </span>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                        {new Date(po.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td><strong>{po.supplier_name}</strong></td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {po.items.map((item, idx) => (
                          <div key={idx} style={{ fontSize: '12.5px' }}>
                            • <strong>{item.product_name}</strong> ({item.sku}): {item.quantity_ordered} units
                          </div>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {po.items.map((item, idx) => (
                          <div key={idx} style={{ fontSize: '12px' }}>
                            <span style={{ fontWeight: '600' }}>{item.quantity_received}</span> / {item.quantity_ordered} received
                            {item.remaining_quantity > 0 && (
                              <span style={{ color: '#d97706', marginLeft: '6px' }}>
                                ({item.remaining_quantity} remaining)
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td><StatusBadge status={po.status} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {po.status === 'CREATED' && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleApprovePo(po.id)}
                            title="Approve this purchase order"
                          >
                            <Check size={13} color="#10b981" />
                            <span>Approve</span>
                          </button>
                        )}
                        {(po.status === 'APPROVED' || po.status === 'PARTIALLY_RECEIVED') && (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => openReceiveModal(po)}
                            title="Receive goods batch"
                          >
                            <PackagePlus size={13} />
                            <span>Receive Goods</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Create Purchase Order */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create New Purchase Order"
      >
        {createError && <div className="alert-box danger">{createError}</div>}
        <form onSubmit={handleCreatePo}>
          <div className="form-group">
            <label className="form-label">Supplier *</label>
            <select
              className="form-select"
              required
              value={poForm.supplierId}
              onChange={(e) => setPoForm({ ...poForm, supplierId: e.target.value })}
            >
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Product to Order *</label>
            <select
              className="form-select"
              required
              value={poForm.productId}
              onChange={(e) => setPoForm({ ...poForm, productId: e.target.value })}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Ordered Quantity *</label>
            <input
              type="number"
              className="form-input"
              min="1"
              required
              placeholder="e.g. 50"
              value={poForm.quantity}
              onChange={(e) => setPoForm({ ...poForm, quantity: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Order Notes / Terms</label>
            <textarea
              className="form-textarea"
              rows="2"
              placeholder="Expected delivery date, logistics instructions..."
              value={poForm.notes}
              onChange={(e) => setPoForm({ ...poForm, notes: e.target.value })}
            />
          </div>

          <div className="modal-footer" style={{ margin: '16px -24px -24px', padding: '16px 24px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Generate Purchase Order
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Receive PO Goods (Multi-Batch with strict remaining check) */}
      <Modal
        isOpen={!!receiveModalPo}
        onClose={() => setReceiveModalPo(null)}
        title={`Receive Goods against ${receiveModalPo?.po_number}`}
      >
        {receiveError && <div className="alert-box danger">{receiveError}</div>}
        <form onSubmit={handleReceiveSubmit}>
          <div className="form-group">
            <label className="form-label">Destination Warehouse *</label>
            <select
              className="form-select"
              required
              value={receiveWarehouse}
              onChange={(e) => setReceiveWarehouse(e.target.value)}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.id} — {w.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Batch Quantities to Receive</label>
            {receiveModalPo?.items?.map((item) => (
              <div
                key={item.product_id}
                style={{
                  background: '#f8fafc',
                  padding: '12px',
                  borderRadius: '6px',
                  marginBottom: '10px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <strong>{item.product_name} ({item.sku})</strong>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>
                    Remaining: <strong style={{ color: '#2563eb' }}>{item.remaining_quantity}</strong> units
                  </span>
                </div>
                <input
                  type="number"
                  className="form-input"
                  min="0"
                  max={item.remaining_quantity}
                  disabled={item.remaining_quantity <= 0}
                  placeholder={`Max allowed: ${item.remaining_quantity}`}
                  value={receiveQuantities[item.product_id] ?? ''}
                  onChange={(e) =>
                    setReceiveQuantities({ ...receiveQuantities, [item.product_id]: e.target.value })
                  }
                />
              </div>
            ))}
          </div>

          <div className="modal-footer" style={{ margin: '16px -24px -24px', padding: '16px 24px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setReceiveModalPo(null)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Confirm Batch Receipt
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Simulate Supplier Update */}
      <Modal
        isOpen={isSimulateOpen}
        onClose={() => setIsSimulateOpen(false)}
        title="Simulate Supplier Update (Idempotent Event Testing)"
      >
        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '14px' }}>
          Demonstrates idempotent event handling. Repeating the same <strong>Supplier Event ID</strong> will not duplicate inventory!
        </p>

        {simulateResult && (
          <div className={`alert-box ${simulateResult.status === 'PROCESSED' ? 'success' : simulateResult.status === 'IGNORED_DUPLICATE' ? 'warning' : 'danger'}`}>
            <div>
              <strong>Result: {simulateResult.status}</strong>
              <p style={{ marginTop: '3px' }}>{simulateResult.message}</p>
            </div>
          </div>
        )}

        <form onSubmit={handleSimulateSupplier}>
          <div className="form-group">
            <label className="form-label">Supplier Event ID (Idempotency Key) *</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="form-input font-mono"
                required
                value={simulateForm.supplierEventId}
                onChange={(e) => setSimulateForm({ ...simulateForm, supplierEventId: e.target.value })}
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setSimulateForm({ ...simulateForm, supplierEventId: `EVT-SUPP-${Math.floor(1000 + Math.random() * 9000)}` })}
                title="Generate fresh Event ID"
              >
                New ID
              </button>
            </div>
            <small style={{ color: '#64748b' }}>Click "Simulate Dispatch" once, then click it again without changing the ID to see idempotency in action.</small>
          </div>

          <div className="form-group">
            <label className="form-label">Product *</label>
            <select
              className="form-select"
              value={simulateForm.productId}
              onChange={(e) => setSimulateForm({ ...simulateForm, productId: e.target.value })}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Warehouse *</label>
              <select
                className="form-select"
                value={simulateForm.warehouseId}
                onChange={(e) => setSimulateForm({ ...simulateForm, warehouseId: e.target.value })}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.id} — {w.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Quantity *</label>
              <input
                type="number"
                className="form-input"
                min="1"
                required
                value={simulateForm.quantity}
                onChange={(e) => setSimulateForm({ ...simulateForm, quantity: e.target.value })}
              />
            </div>
          </div>

          <div className="modal-footer" style={{ margin: '16px -24px -24px', padding: '16px 24px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsSimulateOpen(false)}>
              Close
            </button>
            <button type="submit" className="btn btn-primary" style={{ background: '#d97706', borderColor: '#d97706' }}>
              <Zap size={14} />
              <span>Simulate Supplier Dispatch</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
