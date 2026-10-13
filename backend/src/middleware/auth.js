/**
 * Simple demo authentication middleware
 * Supports role switching for college demonstration
 */

const VALID_ROLES = ['Admin', 'Inventory Manager', 'Warehouse Supervisor', 'Procurement Specialist'];

function authMiddleware(req, res, next) {
  // Check header or query or default to 'Inventory Manager'
  const roleHeader = req.headers['x-user-role'] || req.query.role || 'Inventory Manager';

  req.user = {
    id: 'demo-user-001',
    name: 'Demo Operator',
    role: VALID_ROLES.includes(roleHeader) ? roleHeader : 'Inventory Manager',
  };

  next();
}

function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role) && req.user.role !== 'Admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Your current role '${req.user.role}' lacks permission for this operation. Requires one of: ${allowedRoles.join(', ')}`,
      });
    }
    next();
  };
}

module.exports = {
  authMiddleware,
  requireRole,
  VALID_ROLES,
};
