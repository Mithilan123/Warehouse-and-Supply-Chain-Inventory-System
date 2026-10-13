import React from 'react';
import { Bell, RefreshCw, Server, UserCheck } from 'lucide-react';

export default function Navbar({
  pageTitle,
  currentRole,
  onRoleChange,
  unreadCount,
  onOpenNotifications,
  onResetSeed,
  isResetting,
  healthStatus,
}) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <h2 className="page-title">{pageTitle}</h2>
      </div>

      <div className="topbar-right">
        {/* System Health Status Indicator */}
        <div className="system-status-indicator" title="Local Service Topology">
          <span className="status-dot" style={{ backgroundColor: healthStatus === 'HEALTHY' ? '#10b981' : '#f59e0b' }} />
          <span>PostgreSQL & RabbitMQ {healthStatus === 'HEALTHY' ? 'Active' : 'Checking...'}</span>
        </div>

        {/* Demo Role Switcher */}
        <div className="role-selector-wrap">
          <UserCheck size={16} color="#64748b" />
          <select
            className="role-select"
            value={currentRole}
            onChange={(e) => onRoleChange(e.target.value)}
          >
            <option value="Admin">Role: Admin</option>
            <option value="Inventory Manager">Role: Inventory Manager</option>
            <option value="Warehouse Supervisor">Role: Warehouse Supervisor</option>
            <option value="Procurement Specialist">Role: Procurement Specialist</option>
          </select>
        </div>

        {/* Reset Demo Baseline */}
        <button
          className="btn btn-secondary btn-sm"
          onClick={onResetSeed}
          disabled={isResetting}
          title="Reset database to initial demo baseline"
        >
          <RefreshCw size={13} className={isResetting ? 'spin' : ''} />
          <span>{isResetting ? 'Resetting...' : 'Reset Demo'}</span>
        </button>

        {/* Notification Bell */}
        <button
          className="btn btn-secondary btn-sm"
          onClick={onOpenNotifications}
          style={{ position: 'relative' }}
          title="RabbitMQ Notification Center"
        >
          <Bell size={15} />
          {unreadCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                background: '#ef4444',
                color: '#fff',
                borderRadius: '50%',
                width: '18px',
                height: '18px',
                fontSize: '10px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {unreadCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
