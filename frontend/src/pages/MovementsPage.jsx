import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import StatusBadge from '../components/StatusBadge';
import { History, RefreshCw, Filter } from 'lucide-react';

export default function MovementsPage() {
  const [movements, setMovements] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadMovements() {
    try {
      setLoading(true);
      const [movRes, whRes] = await Promise.all([
        api.getMovements({
          warehouse_id: selectedWarehouse || undefined,
          limit: 100,
        }),
        api.getWarehouses(),
      ]);
      setMovements(movRes.data);
      setWarehouses(whRes.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMovements();
  }, [selectedWarehouse]);

  return (
    <div className="page-body">
      <div className="alert-box info">
        <strong>Immutable Audit Ledger:</strong> Every inventory adjustment, receipt, reservation, transfer, and shipment dispatch commits an immutable stock movement entry.
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <History size={18} color="#2563eb" />
            <span>Stock Movements & Audit Ledger</span>
            <span style={{ fontSize: '12px', color: '#64748b' }}>
              ({movements.length} records)
            </span>
          </div>

          <div className="card-actions">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Filter size={15} color="#64748b" />
              <select
                className="role-select"
                value={selectedWarehouse}
                onChange={(e) => setSelectedWarehouse(e.target.value)}
              >
                <option value="">All Warehouses</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.id} - {w.name}</option>
                ))}
              </select>
            </div>

            <button className="btn btn-secondary btn-sm" onClick={loadMovements} title="Refresh">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {error && <div className="alert-box danger" style={{ margin: '16px' }}>{error}</div>}

        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Product</th>
                <th>Warehouse</th>
                <th>Movement Type</th>
                <th>Quantity</th>
                <th>On-Hand (Prev → New)</th>
                <th>Reserved (Prev → New)</th>
                <th>Available</th>
                <th>Reason / Reference</th>
              </tr>
            </thead>
            <tbody>
              {loading && movements.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', color: '#64748b' }}>Querying audit records...</td>
                </tr>
              ) : movements.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', color: '#64748b' }}>No movements recorded</td>
                </tr>
              ) : (
                movements.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontSize: '11.5px', color: '#64748b' }} className="font-mono">
                      {new Date(m.created_at).toLocaleString()}
                    </td>
                    <td>
                      <strong>{m.product_name}</strong>
                      <div className="font-mono" style={{ fontSize: '11px', color: '#2563eb' }}>{m.sku}</div>
                    </td>
                    <td>
                      <strong>{m.warehouse_id}</strong>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{m.warehouse_name}</div>
                    </td>
                    <td><StatusBadge status={m.movement_type} /></td>
                    <td style={{ fontWeight: '700', color: m.quantity > 0 ? '#10b981' : '#ef4444' }}>
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </td>
                    <td style={{ fontSize: '12.5px' }}>
                      <span style={{ color: '#64748b' }}>{m.previous_on_hand}</span> → <strong>{m.new_on_hand}</strong>
                    </td>
                    <td style={{ fontSize: '12.5px' }}>
                      <span style={{ color: '#64748b' }}>{m.previous_reserved}</span> → <strong>{m.new_reserved}</strong>
                    </td>
                    <td style={{ fontWeight: '700', color: '#0f172a' }}>
                      {m.new_available}
                    </td>
                    <td style={{ fontSize: '12.5px', maxWidth: '280px' }}>
                      <div style={{ fontWeight: '500' }}>{m.reason}</div>
                      {m.reference_id && (
                        <div className="font-mono" style={{ fontSize: '11px', color: '#64748b' }}>
                          Ref: {m.reference_id} ({m.reference_type})
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
