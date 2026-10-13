import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import { Send, Plus, CheckSquare, PackageCheck, Truck } from 'lucide-react';

export default function ShipmentsPage() {
  const [shipments, setShipments] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Create Shipment Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formData, setFormData] = useState({
    warehouseId: 'WH01',
    productId: '',
    quantity: '',
    customerName: '',
    destinationAddress: '',
    notes: '',
  });

  async function loadData() {
    try {
      setLoading(true);
      const [shpRes, whRes, prodRes] = await Promise.all([
        api.getShipments(),
        api.getWarehouses(),
        api.getProducts(),
      ]);
      setShipments(shpRes.data);
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

  async function handleCreateShipment(e) {
    e.preventDefault();
    setFormError(null);
    try {
      await api.createShipment({
        warehouseId: formData.warehouseId,
        customerName: formData.customerName,
        destinationAddress: formData.destinationAddress,
        notes: formData.notes,
        items: [{ productId: formData.productId, quantity: parseInt(formData.quantity, 10) }],
      });
      setIsModalOpen(false);
      setFormData((prev) => ({ ...prev, quantity: '', customerName: '', destinationAddress: '', notes: '' }));
      loadData();
    } catch (err) {
      setFormError(err.message);
    }
  }

  async function handlePick(id) {
    try {
      await api.pickShipment(id);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handlePack(id) {
    try {
      await api.packShipment(id);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleDispatch(id) {
    if (!window.confirm('Dispatch this shipment? Stock will be officially deducted from warehouse.')) return;
    try {
      await api.dispatchShipment(id);
      loadData();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="page-body">
      <div className="alert-box info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <strong>Outbound Shipment Workflow:</strong> <code>CREATED (Stock Reserved) → PICKED → PACKED → DISPATCHED (Stock Deducted)</code>.
          Dispatches publish <code>shipment.dispatched</code> to RabbitMQ.
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            setFormError(null);
            setIsModalOpen(true);
          }}
        >
          <Plus size={14} />
          <span>Create Shipment</span>
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <Send size={18} color="#2563eb" />
            <span>Customer Outbound Shipments</span>
          </div>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            {shipments.length} shipments logged
          </span>
        </div>

        {error && <div className="alert-box danger" style={{ margin: '16px' }}>{error}</div>}

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Shipment #</th>
                <th>Origin Warehouse</th>
                <th>Customer & Address</th>
                <th>Items & Quantity</th>
                <th>Fulfillment Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && shipments.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', color: '#64748b' }}>Loading outbound shipments...</td>
                </tr>
              ) : shipments.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', color: '#64748b' }}>No customer shipments created yet</td>
                </tr>
              ) : (
                shipments.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className="font-mono" style={{ fontWeight: '700', color: '#2563eb' }}>
                        {s.shipment_number}
                      </span>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>
                        {new Date(s.created_at).toLocaleDateString()}
                      </div>
                    </td>
                    <td>
                      <strong>{s.warehouse_id}</strong>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{s.warehouse_name}</div>
                    </td>
                    <td>
                      <strong>{s.customer_name || 'Retail Client'}</strong>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{s.destination_address || 'Standard Delivery'}</div>
                    </td>
                    <td>
                      {s.items.map((item, idx) => (
                        <div key={idx} style={{ fontSize: '12.5px' }}>
                          • <strong>{item.product_name}</strong>: {item.quantity} units
                        </div>
                      ))}
                    </td>
                    <td><StatusBadge status={s.status} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {s.status === 'CREATED' && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handlePick(s.id)}
                            title="Mark items as picked from warehouse shelf"
                          >
                            <CheckSquare size={12} color="#2563eb" />
                            <span>Pick Items</span>
                          </button>
                        )}

                        {s.status === 'PICKED' && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handlePack(s.id)}
                            title="Pack into parcel carton"
                          >
                            <PackageCheck size={12} color="#7c3aed" />
                            <span>Pack Items</span>
                          </button>
                        )}

                        {s.status === 'PACKED' && (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => handleDispatch(s.id)}
                            title="Dispatch and deduct warehouse stock"
                          >
                            <Truck size={12} />
                            <span>Dispatch</span>
                          </button>
                        )}

                        {s.status === 'DISPATCHED' && (
                          <span style={{ fontSize: '12px', color: '#10b981', fontWeight: '600' }}>
                            ✓ Dispatched
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

      {/* Modal: Create Shipment */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Create Outbound Shipment"
      >
        {formError && <div className="alert-box danger">{formError}</div>}
        <form onSubmit={handleCreateShipment}>
          <div className="form-group">
            <label className="form-label">Origin Warehouse *</label>
            <select
              className="form-select"
              required
              value={formData.warehouseId}
              onChange={(e) => setFormData({ ...formData, warehouseId: e.target.value })}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.id} — {w.name}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Product to Ship *</label>
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
            <label className="form-label">Shipment Quantity *</label>
            <input
              type="number"
              className="form-input"
              min="1"
              required
              placeholder="e.g. 5"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
            />
            <small style={{ color: '#64748b' }}>Stock will be reserved at the warehouse immediately upon shipment creation.</small>
          </div>

          <div className="form-group">
            <label className="form-label">Customer Name</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. ACME Systems Inc."
              value={formData.customerName}
              onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Destination Address</label>
            <textarea
              className="form-textarea"
              rows="2"
              placeholder="Delivery address..."
              value={formData.destinationAddress}
              onChange={(e) => setFormData({ ...formData, destinationAddress: e.target.value })}
            />
          </div>

          <div className="modal-footer" style={{ margin: '16px -24px -24px', padding: '16px 24px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create Shipment & Reserve Stock
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
