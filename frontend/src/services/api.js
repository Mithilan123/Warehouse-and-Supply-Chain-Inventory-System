const BASE_URL = 'http://localhost:5000/api/v1';

let currentRole = localStorage.getItem('user_role') || 'Inventory Manager';

export function setRole(role) {
  currentRole = role;
  localStorage.setItem('user_role', role);
}

export function getRole() {
  return currentRole;
}

async function request(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'x-user-role': currentRole,
    ...options.headers,
  };

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const error = new Error(data.message || `Request failed with status ${res.status}`);
      error.status = res.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (err) {
    console.error(`API Error on [${options.method || 'GET'}] ${endpoint}:`, err);
    throw err;
  }
}

export const api = {
  // Health & Dashboard
  getHealth: () => request('/health'),
  getDashboardStats: () => request('/dashboard/stats'),
  getAuthMe: () => request('/auth/me'),

  // Products
  getProducts: (search = '') => request(`/products${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  createProduct: (data) => request('/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id, data) => request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  // Warehouses
  getWarehouses: () => request('/warehouses'),
  createWarehouse: (data) => request('/warehouses', { method: 'POST', body: JSON.stringify(data) }),
  getWarehouseStock: (id) => request(`/warehouses/${id}/stock`),

  // Inventory
  getStock: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/stock${query ? `?${query}` : ''}`);
  },
  receiveStock: (data) => request('/receipts', { method: 'POST', body: JSON.stringify(data) }),
  adjustStock: (data) => request('/stock/adjustments', { method: 'POST', body: JSON.stringify(data) }),
  modifyReservation: (data) => request('/stock/reservations', { method: 'POST', body: JSON.stringify(data) }),
  getMovements: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return request(`/stock/movements${query ? `?${query}` : ''}`);
  },

  // Procurement
  getSuppliers: () => request('/suppliers'),
  createSupplier: (data) => request('/suppliers', { method: 'POST', body: JSON.stringify(data) }),
  getPurchaseOrders: () => request('/purchase-orders'),
  createPurchaseOrder: (data) => request('/purchase-orders', { method: 'POST', body: JSON.stringify(data) }),
  approvePurchaseOrder: (id) => request(`/purchase-orders/${id}/approve`, { method: 'POST' }),
  receivePurchaseOrder: (id, data) => request(`/purchase-orders/${id}/receive`, { method: 'POST', body: JSON.stringify(data) }),
  simulateSupplierUpdate: (data) => request('/procurement/simulate-supplier-update', { method: 'POST', body: JSON.stringify(data) }),

  // Transfers
  getTransfers: () => request('/transfers'),
  createTransfer: (data) => request('/transfers', { method: 'POST', body: JSON.stringify(data) }),
  dispatchTransfer: (id) => request(`/transfers/${id}/dispatch`, { method: 'POST' }),
  receiveTransfer: (id) => request(`/transfers/${id}/receive`, { method: 'POST' }),
  cancelTransfer: (id) => request(`/transfers/${id}/cancel`, { method: 'POST' }),

  // Shipments
  getShipments: () => request('/shipments'),
  createShipment: (data) => request('/shipments', { method: 'POST', body: JSON.stringify(data) }),
  pickShipment: (id) => request(`/shipments/${id}/pick`, { method: 'POST' }),
  packShipment: (id) => request(`/shipments/${id}/pack`, { method: 'POST' }),
  dispatchShipment: (id) => request(`/shipments/${id}/dispatch`, { method: 'POST' }),

  // Notifications
  getNotifications: (limit = 50) => request(`/notifications?limit=${limit}`),
  markNotificationsRead: (id = null) => request('/notifications/mark-read', { method: 'PUT', body: JSON.stringify({ id }) }),

  // Demo helpers
  resetSeed: () => request('/demo/reset-seed', { method: 'POST' }),
};
