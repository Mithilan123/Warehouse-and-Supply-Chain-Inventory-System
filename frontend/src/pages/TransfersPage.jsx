import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import {
  ArrowLeftRight,
  Plus,
  Truck,
  CheckCircle,
  XCircle,
  AlertCircle,
  Layers,
} from 'lucide-react';

export default function TransfersPage() {
  const [transfers, setTransfers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // New Transfer Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formData, setFormData] = useState({
    sourceWarehouseId: 'WH01',
    destinationWarehouseId: 'WH02',
    productId: '',
    quantity: '',
    notes: '',
  });

  // Action Dialog State
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'DISPATCH'|'RECEIVE'|'CANCEL', transfer: obj }
  const [actionError, setActionError] = useState(null);

  async function loadData() {
    try {
      setLoading(true);
      const [trfRes, whRes, prodRes] = await Promise.all([
        api.getTransfers(),
        api.getWarehouses(),
        api.getProducts(),
      ]);
      setTransfers(trfRes.data);
      setWarehouses(whRes.data);
      setProducts(prodRes.data);
      if (prodRes.data.length > 0 && !formData.productId) {
        setFormData((prev) => ({ ...prev, productId: prodRes.data[0].id }));
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

  async function handleCreateTransfer(e) {
    e.preventDefault();
    setFormError(null);
    if (formData.sourceWarehouseId === formData.destinationWarehouseId) {
      setFormError('Source and destination warehouses cannot be the same!');
      return;
    }
    try {
      await api.createTransfer(formData);
      setIsModalOpen(false);
      setFormData((prev) => ({ ...prev, quantity: '', notes: '' }));
      loadData();
    } catch (err) {
      setFormError(err.message);
    }
  }

  async function handleExecuteAction() {
    if (!confirmAction) return;
    setActionError(null);
    try {
      const { type, transfer } = confirmAction;
      if (type === 'DISPATCH') {
        await api.dispatchTransfer(transfer.id);
      } else if (type === 'RECEIVE') {
        await api.receiveTransfer(transfer.id);
      } else if (type === 'CANCEL') {
        await api.cancelTransfer(transfer.id);
      }
      setConfirmAction(null);
      loadData();
    } catch (err) {
      setActionError(err.message);
    }
  }

  return (
    <div className="page-body">
      {/* Workflow Architecture Explanatory Banner */}
      <div className="alert-box info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <strong>Transfer State Machine:</strong> <code>CREATED (Stock Reserved) → DISPATCHED / IN_TRANSIT (Source Deducted) → RECEIVED (Dest Incremented)</code>.
          Enforces atomic rollback and publishes <code>transfer.dispatched</code> / <code>transfer.received</code> to RabbitMQ.
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            setFormError(null);
            setIsModalOpen(true);
          }}
        >
          <Plus size={14} />
          <span>New Transfer</span>
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <ArrowLeftRight size={18} color="#2563eb" />
            <span>Warehouse Inter-Facility Transfers</span>
          </div>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            {transfers.length} registered transfers
          </span>
        </div>

        {error && <div className="alert-box danger" style={{ margin: '16px' }}>{error}</div>}

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Transfer #</th>
                <th>Source Depot</th>
                <th>Destination</th>
                <th>Product & Qty</th>
                <th>Status</th>
                <th>Timestamps</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && transfers.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', color: '#64748b' }}>Loading transfers ledger...</td>
                </tr>
              ) : transfers.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', color: '#64748b' }}>No warehouse transfers created yet</td>
                </tr>
              ) : (
                transfers.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <span className="font-mono" style={{ fontWeight: '700', color: '#2563eb' }}>
                        {t.transfer_number}
                      </span>
                      {t.notes && (
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{t.notes}</div>
                      )}
                    </td>
                    <td>
                      <strong>{t.source_warehouse_id}</strong>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{t.source_warehouse_name}</div>
                    </td>
                    <td>
                      <strong>{t.destination_warehouse_id}</strong>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{t.destination_warehouse_name}</div>
                    </td>
                    <td>
                      {t.items.map((item, idx) => (
                        <div key={idx} style={{ fontSize: '13px' }}>
                          <strong>{item.product_name}</strong>
                          <span style={{ marginLeft: '6px', fontWeight: '700', color: '#2563eb' }}>
                            ({item.quantity} units)
                          </span>
                        </div>
                      ))}
                    </td>
                    <td><StatusBadge status={t.status} /></td>
                    <td style={{ fontSize: '12px', color: '#64748b' }}>
                      {new Date(t.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {t.status === 'CREATED' && (
                          <>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => { setActionError(null); setConfirmAction({ type: 'DISPATCH', transfer: t }); }}
                              title="Dispatch goods and begin transit"
                            >
                              <Truck size={12} />
                              <span>Dispatch</span>
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => { setActionError(null); setConfirmAction({ type: 'CANCEL', transfer: t }); }}
                              title="Cancel transfer and release reservation"
                            >
                              <XCircle size={12} color="#ef4444" />
                              <span>Cancel</span>
                            </button>
                          </>
                        )}

                        {(t.status === 'DISPATCHED' || t.status === 'IN_TRANSIT') && (
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => { setActionError(null); setConfirmAction({ type: 'RECEIVE', transfer: t }); }}
                            title="Confirm arrival and receive stock into destination"
                          >
                            <CheckCircle size={12} />
                            <span>Confirm Receipt</span>
                          </button>
                        )}

                        {t.status === 'RECEIVED' && (
                          <span style={{ fontSize: '12px', color: '#10b981', fontWeight: '600' }}>
                            ✓ Fulfilled
                          </span>
                        )}

                        {t.status === 'CANCELLED' && (
                          <span style={{ fontSize: '12px', color: '#64748b' }}>
                            Cancelled
                          </span>
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

      {/* Modal: Create Transfer */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Initiate Inter-Warehouse Transfer"
      >
        {formError && <div className="alert-box danger">{formError}</div>}
        <form onSubmit={handleCreateTransfer}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div className="form-group">
              <label className="form-label">Source Warehouse *</label>
              <select
                className="form-select"
                required
                value={formData.sourceWarehouseId}
                onChange={(e) => setFormData({ ...formData, sourceWarehouseId: e.target.value })}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.id} — {w.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Destination Warehouse *</label>
              <select
                className="form-select"
                required
                value={formData.destinationWarehouseId}
                onChange={(e) => setFormData({ ...formData, destinationWarehouseId: e.target.value })}
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.id} — {w.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Product to Transfer *</label>
            <select
              className="form-select"
              required
              value={formData.productId}
              onChange={(e) => setFormData({ ...formData, productId: e.target.value })}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Quantity to Transfer *</label>
            <input
              type="number"
              className="form-input"
              min="1"
              required
              placeholder="e.g. 10"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
            />
            <small style={{ color: '#64748b' }}>Stock will be reserved at the source warehouse upon transfer creation.</small>
          </div>

          <div className="form-group">
            <label className="form-label">Transfer Purpose / Notes</label>
            <textarea
              className="form-textarea"
              rows="2"
              placeholder="e.g. Rebalancing regional stock for upcoming promotion"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <div className="modal-footer" style={{ margin: '16px -24px -24px', padding: '16px 24px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create Transfer & Hold Stock
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirmation Dialog Modal for Dispatch, Receipt, Cancel */}
      <Modal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={
          confirmAction?.type === 'DISPATCH'
            ? `Dispatch Transfer ${confirmAction?.transfer?.transfer_number}`
            : confirmAction?.type === 'RECEIVE'
            ? `Confirm Receipt of ${confirmAction?.transfer?.transfer_number}`
            : `Cancel Transfer ${confirmAction?.transfer?.transfer_number}`
        }
      >
        {actionError && <div className="alert-box danger">{actionError}</div>}

        <div style={{ fontSize: '14px', color: '#334155', marginBottom: '20px' }}>
          {confirmAction?.type === 'DISPATCH' && (
            <p>
              Dispatching will deduct <strong>{confirmAction.transfer.items[0]?.quantity} units</strong> of <strong>{confirmAction.transfer.items[0]?.product_name}</strong> from source warehouse <strong>{confirmAction.transfer.source_warehouse_id}</strong>, mark the transfer as <strong>IN_TRANSIT</strong>, and publish an event to RabbitMQ.
            </p>
          )}
          {confirmAction?.type === 'RECEIVE' && (
            <p>
              Receiving will add <strong>{confirmAction.transfer.items[0]?.quantity} units</strong> to destination warehouse <strong>{confirmAction.transfer.destination_warehouse_id}</strong>, mark the transfer as <strong>RECEIVED</strong>, and notify the system via RabbitMQ.
            </p>
          )}
          {confirmAction?.type === 'CANCEL' && (
            <p>
              Cancelling will release the reserved quantity at source warehouse <strong>{confirmAction.transfer.source_warehouse_id}</strong> and mark this transfer as cancelled.
            </p>
          )}
        </div>

        <div className="modal-footer" style={{ margin: '16px -24px -24px', padding: '16px 24px' }}>
          <button className="btn btn-secondary" onClick={() => setConfirmAction(null)}>
            Go Back
          </button>
          <button
            className={`btn ${confirmAction?.type === 'CANCEL' ? 'btn-danger' : confirmAction?.type === 'RECEIVE' ? 'btn-success' : 'btn-primary'}`}
            onClick={handleExecuteAction}
          >
            Confirm {confirmAction?.type}
          </button>
        </div>
      </Modal>
    </div>
  );
}
