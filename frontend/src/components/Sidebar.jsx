import React from 'react';
import {
  LayoutDashboard,
  Package,
  Warehouse,
  Boxes,
  Truck,
  FileText,
  ArrowLeftRight,
  Send,
  Bell,
  History,
} from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'warehouses', label: 'Warehouses', icon: Warehouse },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'suppliers', label: 'Suppliers', icon: Truck },
  { id: 'orders', label: 'Purchase Orders', icon: FileText },
  { id: 'transfers', label: 'Transfers', icon: ArrowLeftRight },
  { id: 'shipments', label: 'Shipments', icon: Send },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'movements', label: 'Stock Movements', icon: History },
];

export default function Sidebar({ activeTab, setActiveTab, unreadCount = 0 }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div style={{ background: '#2563eb', padding: '7px', borderRadius: '8px', color: '#fff', display: 'flex' }}>
          <Boxes size={22} />
        </div>
        <div>
          <h1>SupplyChain OS</h1>
          <span>Inventory & Logistics</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
              {item.id === 'notifications' && unreadCount > 0 && (
                <span className="nav-badge">{unreadCount}</span>
              )}
            </button>
          );
        })}
      </nav>

      <div style={{ padding: '16px 20px', borderTop: '1px solid #1e293b', fontSize: '11px', color: '#64748b' }}>
        <p><strong>Local Prototype</strong></p>
        <p style={{ marginTop: '2px' }}>PostgreSQL 18 • RabbitMQ 4</p>
      </div>
    </aside>
  );
}
