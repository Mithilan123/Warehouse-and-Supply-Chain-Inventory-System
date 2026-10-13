import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import StatusBadge from '../components/StatusBadge';
import {
  Package,
  Warehouse,
  Boxes,
  CheckCircle,
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  History,
  TrendingUp,
} from 'lucide-react';

export default function DashboardPage({ onNavigate }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadDashboard() {
    try {
      const res = await api.getDashboardStats();
      setStats(res.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
    const interval = setInterval(loadDashboard, 3000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !stats) {
    return <div className="page-body"><p>Loading dashboard telemetry...</p></div>;
  }

  if (error && !stats) {
    return (
      <div className="page-body">
        <div className="alert-box danger">Failed to load dashboard: {error}</div>
      </div>
    );
  }

  return (
    <div className="page-body">
      {/* Top Banner Explaining LLD/HLD Prototype */}
      <div className="alert-box info" style={{ marginBottom: '24px' }}>
        <div>
          <strong>Architecture Active:</strong> Authoritative PostgreSQL 18 with Row-Level Locks • RabbitMQ 4.3.6 Topic Exchange (<code>inventory.events</code>) • Transactional Outbox Pattern with Guaranteed Delivery.
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="stats-grid">
        <div className="stat-card" onClick={() => onNavigate('products')} style={{ cursor: 'pointer' }}>
          <div className="stat-header">
            <span className="stat-title">Total Products</span>
            <div className="stat-icon"><Package size={18} /></div>
          </div>
          <div className="stat-value">{stats?.totalProducts ?? 0}</div>
          <div className="stat-desc">Active catalog items</div>
        </div>

        <div className="stat-card" onClick={() => onNavigate('warehouses')} style={{ cursor: 'pointer' }}>
          <div className="stat-header">
            <span className="stat-title">Warehouses</span>
            <div className="stat-icon"><Warehouse size={18} /></div>
          </div>
          <div className="stat-value">{stats?.totalWarehouses ?? 0}</div>
          <div className="stat-desc">WH01 & WH02 Operational</div>
        </div>

        <div className="stat-card" onClick={() => onNavigate('inventory')} style={{ cursor: 'pointer' }}>
          <div className="stat-header">
            <span className="stat-title">On-Hand Stock</span>
            <div className="stat-icon"><Boxes size={18} /></div>
          </div>
          <div className="stat-value">{stats?.totalOnHand ?? 0}</div>
          <div className="stat-desc">{stats?.totalReserved ?? 0} units reserved</div>
        </div>

        <div className="stat-card" onClick={() => onNavigate('inventory')} style={{ cursor: 'pointer' }}>
          <div className="stat-header">
            <span className="stat-title">Available Stock</span>
            <div className="stat-icon"><CheckCircle size={18} /></div>
          </div>
          <div className="stat-value">{stats?.totalAvailable ?? 0}</div>
          <div className="stat-desc">On-Hand minus Reserved</div>
        </div>

        <div
          className={`stat-card ${stats?.lowStockCount > 0 ? 'alert' : ''}`}
          onClick={() => onNavigate('inventory')}
          style={{ cursor: 'pointer' }}
        >
          <div className="stat-header">
            <span className="stat-title">Low Stock Alerts</span>
            <div className="stat-icon"><AlertTriangle size={18} /></div>
          </div>
          <div className="stat-value">{stats?.lowStockCount ?? 0}</div>
          <div className="stat-desc">Available ≤ Reorder Level</div>
        </div>

        <div className="stat-card" onClick={() => onNavigate('transfers')} style={{ cursor: 'pointer' }}>
          <div className="stat-header">
            <span className="stat-title">Pending Transfers</span>
            <div className="stat-icon"><ArrowLeftRight size={18} /></div>
          </div>
          <div className="stat-value">{stats?.pendingTransfersCount ?? 0}</div>
          <div className="stat-desc">Created or In-Transit</div>
        </div>
      </div>

      {/* Two Column Layout: Recent Movements & Live RabbitMQ Notifications */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '24px' }}>
        {/* Recent Stock Movements Table */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <History size={18} color="#2563eb" />
              <span>Recent Stock Movements</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('movements')}>
              View All
            </button>
          </div>
          <div className="table-responsive">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Warehouse</th>
                  <th>Type</th>
                  <th>Qty</th>
                  <th>Available</th>
                </tr>
              </thead>
              <tbody>
                {stats?.recentMovements?.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', color: '#64748b' }}>No movements recorded yet</td>
                  </tr>
                ) : (
                  stats?.recentMovements?.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.product_name}</strong>
                        <div style={{ fontSize: '11px', color: '#64748b' }} className="font-mono">{m.sku}</div>
                      </td>
                      <td style={{ fontSize: '12.5px' }}>{m.warehouse_name}</td>
                      <td><StatusBadge status={m.movement_type} /></td>
                      <td style={{ fontWeight: '600', color: m.quantity > 0 ? '#10b981' : '#ef4444' }}>
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </td>
                      <td style={{ fontWeight: '600' }}>{m.new_available}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live RabbitMQ Notifications Panel */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <Bell size={18} color="#f59e0b" />
              <span>Live RabbitMQ Notifications</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => onNavigate('notifications')}>
              View All
            </button>
          </div>
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {stats?.recentNotifications?.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#64748b', padding: '24px 0' }}>
                Waiting for broker events on <code>inventory.events</code>...
              </p>
            ) : (
              stats?.recentNotifications?.map((n) => (
                <div
                  key={n.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    backgroundColor: n.routing_key === 'stock.low' ? '#fef2f2' : '#f8fafc',
                    border: `1px solid ${n.routing_key === 'stock.low' ? '#fecaca' : '#e2e8f0'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontSize: '13px', fontWeight: '700', color: n.routing_key === 'stock.low' ? '#991b1b' : '#0f172a' }}>
                      {n.title}
                    </span>
                    <span className="font-mono" style={{ fontSize: '11px', color: '#64748b', backgroundColor: '#ffffff', padding: '2px 6px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                      {n.routing_key}
                    </span>
                  </div>
                  <p style={{ fontSize: '12.5px', color: '#475569' }}>{n.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
