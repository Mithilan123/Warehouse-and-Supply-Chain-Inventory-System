import React from 'react';

export default function StatusBadge({ status }) {
  if (!status) return null;

  const normalized = status.toUpperCase();

  switch (normalized) {
    case 'HEALTHY':
    case 'ACTIVE':
    case 'RECEIVED':
      return <span className="badge badge-success">● {status}</span>;
    case 'LOW_STOCK':
    case 'OUT_OF_STOCK':
    case 'FAILED':
      return <span className="badge badge-danger">⚠️ {status}</span>;
    case 'CREATED':
    case 'PENDING':
      return <span className="badge badge-gray">🕒 {status}</span>;
    case 'APPROVED':
    case 'PARTIALLY_RECEIVED':
      return <span className="badge badge-info">✓ {status}</span>;
    case 'DISPATCHED':
    case 'IN_TRANSIT':
      return <span className="badge badge-warning">🚚 {status}</span>;
    case 'PICKED':
    case 'PACKED':
      return <span className="badge badge-purple">📦 {status}</span>;
    case 'CANCELLED':
    case 'INACTIVE':
      return <span className="badge badge-gray">✕ {status}</span>;
    default:
      return <span className="badge badge-gray">{status}</span>;
  }
}
