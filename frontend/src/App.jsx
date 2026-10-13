import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import DashboardPage from './pages/DashboardPage';
import ProductsPage from './pages/ProductsPage';
import WarehousesPage from './pages/WarehousesPage';
import InventoryPage from './pages/InventoryPage';
import SuppliersPage from './pages/SuppliersPage';
import PurchaseOrdersPage from './pages/PurchaseOrdersPage';
import TransfersPage from './pages/TransfersPage';
import ShipmentsPage from './pages/ShipmentsPage';
import NotificationsPage from './pages/NotificationsPage';
import MovementsPage from './pages/MovementsPage';
import { api, getRole, setRole } from './services/api';

const PAGE_TITLES = {
  dashboard: 'Executive Dashboard & Telemetry',
  products: 'Product Management',
  warehouses: 'Warehouse Facilities',
  inventory: 'Inventory & Stock Management',
  suppliers: 'Supplier & Vendor Directory',
  orders: 'Procurement & Purchase Orders',
  transfers: 'Warehouse Inter-Facility Transfers',
  shipments: 'Outbound Customer Shipments',
  notifications: 'RabbitMQ Notification Center',
  movements: 'Stock Movement History Ledger',
};

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [currentRole, setCurrentRoleState] = useState(getRole());
  const [unreadCount, setUnreadCount] = useState(0);
  const [isResetting, setIsResetting] = useState(false);
  const [healthStatus, setHealthStatus] = useState('UNKNOWN');

  // Check health and unread notifications count periodically
  async function checkHealthAndAlerts() {
    try {
      const healthRes = await api.getHealth();
      setHealthStatus(healthRes.status);
    } catch {
      setHealthStatus('DEGRADED');
    }

    try {
      const notifRes = await api.getNotifications(1);
      setUnreadCount(notifRes.unreadCount || 0);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    checkHealthAndAlerts();
    const interval = setInterval(checkHealthAndAlerts, 3000);
    return () => clearInterval(interval);
  }, []);

  function handleRoleChange(newRole) {
    setRole(newRole);
    setCurrentRoleState(newRole);
  }

  async function handleResetSeed() {
    if (!window.confirm('Reset the database to the initial college demo baseline? All mock test data will be restored.')) return;
    try {
      setIsResetting(true);
      await api.resetSeed();
      alert('Database restored to initial demo baseline (WH01, WH02, Laptops, Mice, Keyboards with Low Stock trigger)!');
      window.location.reload();
    } catch (err) {
      alert(`Reset failed: ${err.message}`);
    } finally {
      setIsResetting(false);
    }
  }

  function renderPage() {
    switch (activeTab) {
      case 'dashboard':
        return <DashboardPage onNavigate={setActiveTab} />;
      case 'products':
        return <ProductsPage />;
      case 'warehouses':
        return <WarehousesPage />;
      case 'inventory':
        return <InventoryPage />;
      case 'suppliers':
        return <SuppliersPage />;
      case 'orders':
        return <PurchaseOrdersPage />;
      case 'transfers':
        return <TransfersPage />;
      case 'shipments':
        return <ShipmentsPage />;
      case 'notifications':
        return <NotificationsPage />;
      case 'movements':
        return <MovementsPage />;
      default:
        return <DashboardPage onNavigate={setActiveTab} />;
    }
  }

  return (
    <div className="app-container">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        unreadCount={unreadCount}
      />
      <main className="main-content">
        <Navbar
          pageTitle={PAGE_TITLES[activeTab] || 'Inventory System'}
          currentRole={currentRole}
          onRoleChange={handleRoleChange}
          unreadCount={unreadCount}
          onOpenNotifications={() => setActiveTab('notifications')}
          onResetSeed={handleResetSeed}
          isResetting={isResetting}
          healthStatus={healthStatus}
        />
        {renderPage()}
      </main>
    </div>
  );
}
