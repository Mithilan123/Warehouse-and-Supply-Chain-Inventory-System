import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Bell, CheckCheck, RefreshCw, Radio, Terminal, AlertTriangle } from 'lucide-react';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedPayloads, setExpandedPayloads] = useState({});

  async function loadNotifications() {
    try {
      const res = await api.getNotifications(50);
      setNotifications(res.data);
      setUnreadCount(res.unreadCount);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 2000); // 2s live polling for instant notification updates
    return () => clearInterval(interval);
  }, []);

  async function handleMarkAllRead() {
    try {
      await api.markNotificationsRead();
      loadNotifications();
    } catch (err) {
      alert(err.message);
    }
  }

  function togglePayload(id) {
    setExpandedPayloads((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  return (
    <div className="page-body">
      {/* Real AMQP Broker Information Banner */}
      <div className="alert-box info" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Radio size={20} color="#2563eb" className="spin" />
          <div>
            <strong>RabbitMQ Live Stream:</strong> Exchange: <code>inventory.events</code> (Durable Topic) • Queue: <code>stock-notifications</code> (Manual ACK).
            Messages arrive persistently from the Transactional Outbox.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary btn-sm" onClick={handleMarkAllRead}>
            <CheckCheck size={14} />
            <span>Mark All Read</span>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={loadNotifications} title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <Bell size={18} color="#f59e0b" />
            <span>Event Notifications Center</span>
            {unreadCount > 0 && (
              <span className="badge badge-danger">
                {unreadCount} Unread Alerts
              </span>
            )}
          </div>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            Streaming latest 50 events
          </span>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {loading && notifications.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#64748b', padding: '32px 0' }}>
              Subscribing to RabbitMQ consumer telemetry...
            </p>
          ) : notifications.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#64748b', padding: '40px 0' }}>
              <Radio size={32} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
              <strong>No notifications logged yet</strong>
              <p style={{ fontSize: '13px', marginTop: '4px' }}>
                Perform an adjustment, transfer, or receipt to publish events to RabbitMQ!
              </p>
            </div>
          ) : (
            notifications.map((n) => {
              const isLowStock = n.routing_key === 'stock.low';
              const isExpanded = !!expandedPayloads[n.id];
              return (
                <div
                  key={n.id}
                  style={{
                    padding: '16px 20px',
                    borderRadius: '8px',
                    backgroundColor: isLowStock ? '#fef2f2' : n.is_read ? '#ffffff' : '#f8fafc',
                    border: `1px solid ${isLowStock ? '#fca5a5' : n.is_read ? '#e2e8f0' : '#cbd5e1'}`,
                    boxShadow: n.is_read ? 'none' : '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {isLowStock && <AlertTriangle size={16} color="#dc2626" />}
                      <span style={{ fontSize: '14.5px', fontWeight: '700', color: isLowStock ? '#991b1b' : '#0f172a' }}>
                        {n.title}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span
                        className="font-mono"
                        style={{
                          fontSize: '11px',
                          fontWeight: '600',
                          backgroundColor: isLowStock ? '#fee2e2' : '#eff6ff',
                          color: isLowStock ? '#991b1b' : '#1e40af',
                          padding: '3px 8px',
                          borderRadius: '4px',
                          border: `1px solid ${isLowStock ? '#fca5a5' : '#bfdbfe'}`,
                        }}
                      >
                        amqp://{n.routing_key}
                      </span>
                      <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                        {new Date(n.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>

                  <p style={{ fontSize: '13px', color: '#334155', lineHeight: '1.5' }}>
                    {n.message}
                  </p>

                  <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="font-mono" style={{ fontSize: '11px', color: '#94a3b8' }}>
                      Event ID: {n.event_id || n.id}
                    </span>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => togglePayload(n.id)}
                      style={{ fontSize: '11px', padding: '3px 8px' }}
                    >
                      <Terminal size={12} />
                      <span>{isExpanded ? 'Hide AMQP Payload' : 'Inspect AMQP Payload'}</span>
                    </button>
                  </div>

                  {isExpanded && n.payload && (
                    <div
                      style={{
                        marginTop: '12px',
                        background: '#0f172a',
                        color: '#38bdf8',
                        padding: '12px',
                        borderRadius: '6px',
                        fontSize: '11.5px',
                        overflowX: 'auto',
                      }}
                      className="font-mono"
                    >
                      <pre>{JSON.stringify(typeof n.payload === 'string' ? JSON.parse(n.payload) : n.payload, null, 2)}</pre>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
