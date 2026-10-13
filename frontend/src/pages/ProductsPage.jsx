import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import { Plus, Search, Edit2 } from 'lucide-react';

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formError, setFormError] = useState(null);
  const [formData, setFormData] = useState({
    sku: '',
    name: '',
    description: '',
    unit: 'units',
    reorder_level: 10,
  });

  async function loadProducts() {
    try {
      setLoading(true);
      const res = await api.getProducts(search);
      setProducts(res.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProducts();
  }, [search]);

  function handleOpenAdd() {
    setEditingProduct(null);
    setFormData({ sku: '', name: '', description: '', unit: 'units', reorder_level: 10 });
    setFormError(null);
    setIsModalOpen(true);
  }

  function handleOpenEdit(product) {
    setEditingProduct(product);
    setFormData({
      sku: product.sku,
      name: product.name,
      description: product.description || '',
      unit: product.unit || 'units',
      reorder_level: product.reorder_level,
    });
    setFormError(null);
    setIsModalOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);
    try {
      if (editingProduct) {
        await api.updateProduct(editingProduct.id, {
          name: formData.name,
          description: formData.description,
          unit: formData.unit,
          reorder_level: formData.reorder_level,
        });
      } else {
        await api.createProduct(formData);
      }
      setIsModalOpen(false);
      loadProducts();
    } catch (err) {
      setFormError(err.message);
    }
  }

  return (
    <div className="page-body">
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <span>Product Catalog</span>
            <span style={{ fontSize: '13px', fontWeight: '500', color: '#64748b' }}>
              ({products.length} products)
            </span>
          </div>

          <div className="card-actions">
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', color: '#94a3b8' }} />
              <input
                type="text"
                className="search-input"
                style={{ paddingLeft: '32px' }}
                placeholder="Search by SKU or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <button className="btn btn-primary" onClick={handleOpenAdd}>
              <Plus size={16} />
              <span>Add Product</span>
            </button>
          </div>
        </div>

        {error && <div className="alert-box danger" style={{ margin: '16px' }}>{error}</div>}

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product Name</th>
                <th>Description</th>
                <th>Unit</th>
                <th>Reorder Level</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && products.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', color: '#64748b' }}>Loading products...</td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', color: '#64748b' }}>No products found</td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="font-mono" style={{ fontWeight: '700', color: '#2563eb' }}>
                        {p.sku}
                      </span>
                    </td>
                    <td><strong>{p.name}</strong></td>
                    <td style={{ color: '#64748b', fontSize: '12.5px', maxWidth: '280px' }}>
                      {p.description || '—'}
                    </td>
                    <td>{p.unit}</td>
                    <td>
                      <span style={{ fontWeight: '600' }}>{p.reorder_level}</span>
                    </td>
                    <td><StatusBadge status={p.status} /></td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleOpenEdit(p)}
                        title="Edit product details"
                      >
                        <Edit2 size={13} />
                        <span>Edit</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingProduct ? `Edit Product: ${editingProduct.sku}` : 'Add New Product'}
      >
        {formError && <div className="alert-box danger">{formError}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">SKU (Unique Stock Keeping Unit) *</label>
            <input
              type="text"
              className="form-input font-mono"
              placeholder="e.g. LAP001"
              required
              disabled={!!editingProduct}
              value={formData.sku}
              onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
            />
            {editingProduct && (
              <small style={{ color: '#64748b' }}>SKU cannot be altered after creation.</small>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Product Name *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Wireless Mouse"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-textarea"
              rows="3"
              placeholder="Specifications, model number, dimensions..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Unit of Measure</label>
              <input
                type="text"
                className="form-input"
                placeholder="units, boxes, pcs"
                value={formData.unit}
                onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Reorder Level *</label>
              <input
                type="number"
                className="form-input"
                min="0"
                required
                value={formData.reorder_level}
                onChange={(e) => setFormData({ ...formData, reorder_level: parseInt(e.target.value, 10) || 0 })}
              />
            </div>
          </div>

          <div className="modal-footer" style={{ margin: '16px -24px -24px', padding: '16px 24px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editingProduct ? 'Save Changes' : 'Create Product'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
