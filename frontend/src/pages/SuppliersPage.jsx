import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import { Truck, Plus, Mail } from 'lucide-react';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    contact_info: '',
  });

  async function loadSuppliers() {
    try {
      setLoading(true);
      const res = await api.getSuppliers();
      setSuppliers(res.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSuppliers();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);
    try {
      await api.createSupplier(formData);
      setIsModalOpen(false);
      setFormData({ name: '', contact_info: '' });
      loadSuppliers();
    } catch (err) {
      setFormError(err.message);
    }
  }

  return (
    <div className="page-body">
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <Truck size={18} color="#2563eb" />
            <span>Procurement Suppliers Directory</span>
            <span style={{ fontSize: '13px', fontWeight: '500', color: '#64748b' }}>
              ({suppliers.length} active vendors)
            </span>
          </div>

          <div className="card-actions">
            <button className="btn btn-primary" onClick={() => { setFormError(null); setIsModalOpen(true); }}>
              <Plus size={16} />
              <span>Add Supplier</span>
            </button>
          </div>
        </div>

        {error && <div className="alert-box danger" style={{ margin: '16px' }}>{error}</div>}

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Supplier ID</th>
                <th>Supplier Name</th>
                <th>Contact Information</th>
                <th>Status</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              {loading && suppliers.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', color: '#64748b' }}>Loading vendor list...</td>
                </tr>
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ textAlign: 'center', color: '#64748b' }}>No suppliers registered</td>
                </tr>
              ) : (
                suppliers.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <span className="font-mono" style={{ fontSize: '12px', color: '#64748b' }}>
                        {s.id.slice(0, 8)}...
                      </span>
                    </td>
                    <td><strong>{s.name}</strong></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#475569' }}>
                        <Mail size={13} color="#94a3b8" />
                        <span>{s.contact_info || 'No contact details'}</span>
                      </div>
                    </td>
                    <td><StatusBadge status={s.status} /></td>
                    <td style={{ fontSize: '12px', color: '#64748b' }}>
                      {new Date(s.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Register New Supplier"
      >
        {formError && <div className="alert-box danger">{formError}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Supplier / Vendor Name *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Apex Hardware Distributing Co."
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Contact Information</label>
            <textarea
              className="form-textarea"
              rows="3"
              placeholder="Email, telephone, representative name, address..."
              value={formData.contact_info}
              onChange={(e) => setFormData({ ...formData, contact_info: e.target.value })}
            />
          </div>

          <div className="modal-footer" style={{ margin: '16px -24px -24px', padding: '16px 24px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Register Supplier
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
