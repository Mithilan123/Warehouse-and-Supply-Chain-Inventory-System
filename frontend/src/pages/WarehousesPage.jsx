import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import { Plus, Warehouse, Eye, MapPin, Building } from 'lucide-react';

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState('WH01');
  const [warehouseStock, setWarehouseStock] = useState(null);
  const [loading, setLoading] = useState(true);
  const [stockLoading, setStockLoading] = useState(false);
  const [error, setError] = useState(null);

  // Add Warehouse Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    location: '',
    address: '',
  });

  async function loadWarehouses() {
    try {
      setLoading(true);
      const res = await api.getWarehouses();
      setWarehouses(res.data);
      if (res.data.length > 0 && !selectedWarehouseId) {
        setSelectedWarehouseId(res.data[0].id);
      }
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function loadWarehouseStock(whId) {
    if (!whId) return;
    try {
      setStockLoading(true);
      const res = await api.getWarehouseStock(whId);
      setWarehouseStock(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setStockLoading(false);
    }
  }

  useEffect(() => {
    loadWarehouses();
  }, []);

  useEffect(() => {
    if (selectedWarehouseId) {
      loadWarehouseStock(selectedWarehouseId);
    }
  }, [selectedWarehouseId]);

  async function handleCreateWarehouse(e) {
    e.preventDefault();
    setFormError(null);
    try {
      await api.createWarehouse(formData);
      setIsModalOpen(false);
      setFormData({ id: '', name: '', location: '', address: '' });
      loadWarehouses();
    } catch (err) {
      setFormError(err.message);
    }
  }

  return (
    <div className="page-body">
      {/* Warehouses Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '28px' }}>
        {warehouses.map((wh) => {
          const isSelected = selectedWarehouseId === wh.id;
          return (
            <div
              key={wh.id}
              className="card"
              style={{
                borderColor: isSelected ? '#2563eb' : '#e2e8f0',
                boxShadow: isSelected ? '0 0 0 2px rgba(37, 99, 235, 0.2)' : 'var(--shadow-sm)',
                cursor: 'pointer',
                marginBottom: 0,
              }}
              onClick={() => setSelectedWarehouseId(wh.id)}
            >
              <div style={{ padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ background: isSelected ? '#eff6ff' : '#f1f5f9', color: isSelected ? '#2563eb' : '#64748b', padding: '8px', borderRadius: '8px' }}>
                      <Warehouse size={20} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '16px', fontWeight: '700' }}>{wh.name}</h3>
                      <span className="font-mono" style={{ fontSize: '12px', color: '#2563eb', fontWeight: '700' }}>
                        ID: {wh.id}
                      </span>
                    </div>
                  </div>
                  <StatusBadge status={wh.status} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', color: '#64748b', marginTop: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={14} />
                    <span>{wh.location || 'Location not specified'}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Building size={14} />
                    <span>{wh.address || 'Address not specified'}</span>
                  </div>
                </div>

                <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: isSelected ? '#2563eb' : '#64748b' }}>
                    {isSelected ? '● Currently Inspecting' : 'Click to inspect inventory'}
                  </span>
                  <button className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); setSelectedWarehouseId(wh.id); }}>
                    <Eye size={13} />
                    <span>View Stock</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Add Warehouse Card */}
        <div
          className="card"
          style={{
            borderStyle: 'dashed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '180px',
            cursor: 'pointer',
            backgroundColor: '#ffffff',
            marginBottom: 0,
          }}
          onClick={() => { setFormError(null); setIsModalOpen(true); }}
        >
          <div style={{ textAlign: 'center', padding: '24px' }}>
            <div style={{ background: '#f1f5f9', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', color: '#2563eb' }}>
              <Plus size={20} />
            </div>
            <strong style={{ fontSize: '14px', color: '#0f172a' }}>Register New Warehouse</strong>
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Add WH03 or regional depots</p>
          </div>
        </div>
      </div>

      {/* Selected Warehouse Inventory Breakdown */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <Warehouse size={18} color="#2563eb" />
            <span>Stock Available at {warehouseStock?.warehouse?.name || selectedWarehouseId}</span>
          </div>
          <span className="font-mono" style={{ fontSize: '12px', color: '#64748b' }}>
            Warehouse Code: {selectedWarehouseId}
          </span>
        </div>

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product Name</th>
                <th>On-Hand</th>
                <th>Reserved</th>
                <th>Available Stock</th>
                <th>Reorder Level</th>
                <th>Inventory Status</th>
              </tr>
            </thead>
            <tbody>
              {stockLoading ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', color: '#64748b' }}>Loading inventory telemetry...</td>
                </tr>
              ) : !warehouseStock || warehouseStock?.stock?.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', color: '#64748b' }}>No stock records for this warehouse</td>
                </tr>
              ) : (
                warehouseStock?.stock?.map((item) => (
                  <tr key={item.product_id}>
                    <td>
                      <span className="font-mono" style={{ fontWeight: '700', color: '#2563eb' }}>
                        {item.sku}
                      </span>
                    </td>
                    <td><strong>{item.product_name}</strong></td>
                    <td style={{ fontWeight: '600' }}>{item.on_hand} {item.unit}</td>
                    <td style={{ color: item.reserved > 0 ? '#f59e0b' : '#64748b', fontWeight: '600' }}>
                      {item.reserved} {item.unit}
                    </td>
                    <td style={{ fontWeight: '700', fontSize: '14px', color: item.available <= item.reorder_level ? '#dc2626' : '#10b981' }}>
                      {item.available} {item.unit}
                    </td>
                    <td>{item.reorder_level} {item.unit}</td>
                    <td><StatusBadge status={item.stock_status} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Register Warehouse Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Register New Warehouse"
      >
        {formError && <div className="alert-box danger">{formError}</div>}
        <form onSubmit={handleCreateWarehouse}>
          <div className="form-group">
            <label className="form-label">Warehouse Code / ID *</label>
            <input
              type="text"
              className="form-input font-mono"
              placeholder="e.g. WH03"
              required
              value={formData.id}
              onChange={(e) => setFormData({ ...formData, id: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Warehouse Name *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Western Coastal Hub"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Location / City</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Mumbai, Maharashtra"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Address</label>
            <textarea
              className="form-textarea"
              rows="2"
              placeholder="Street, logistics zone, plot number..."
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </div>

          <div className="modal-footer" style={{ margin: '16px -24px -24px', padding: '16px 24px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Register Warehouse
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
