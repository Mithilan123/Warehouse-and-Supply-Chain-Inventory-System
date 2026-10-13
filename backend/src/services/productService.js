const db = require('../config/db');

async function getAllProducts(search = '') {
  let queryText = `
    SELECT id, sku, name, description, unit, reorder_level, status, created_at, updated_at
    FROM products
  `;
  const params = [];

  if (search && search.trim() !== '') {
    queryText += ` WHERE (sku ILIKE $1 OR name ILIKE $1)`;
    params.push(`%${search.trim()}%`);
  }

  queryText += ` ORDER BY name ASC`;
  const result = await db.query(queryText, params);
  return result.rows;
}

async function getProductById(id) {
  const result = await db.query(
    `SELECT id, sku, name, description, unit, reorder_level, status, created_at, updated_at
     FROM products WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

async function createProduct(productData) {
  const { sku, name, description = '', unit = 'units', reorder_level = 10 } = productData;

  if (!sku || !sku.trim()) {
    const error = new Error('Product SKU is required');
    error.status = 400;
    throw error;
  }
  if (!name || !name.trim()) {
    const error = new Error('Product name is required');
    error.status = 400;
    throw error;
  }

  // Check duplicate SKU
  const existing = await db.query('SELECT id FROM products WHERE sku = $1', [sku.trim()]);
  if (existing.rows.length > 0) {
    const error = new Error(`Product with SKU '${sku.trim()}' already exists`);
    error.status = 409;
    throw error;
  }

  const result = await db.query(
    `INSERT INTO products (sku, name, description, unit, reorder_level, status)
     VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
     RETURNING *`,
    [sku.trim().toUpperCase(), name.trim(), description.trim(), unit.trim(), Math.max(0, parseInt(reorder_level, 10))]
  );
  return result.rows[0];
}

async function updateProduct(id, updateData) {
  const { name, description, unit, reorder_level, status } = updateData;

  const existing = await getProductById(id);
  if (!existing) {
    const error = new Error('Product not found');
    error.status = 404;
    throw error;
  }

  const result = await db.query(
    `UPDATE products
     SET name = COALESCE($1, name),
         description = COALESCE($2, description),
         unit = COALESCE($3, unit),
         reorder_level = COALESCE($4, reorder_level),
         status = COALESCE($5, status),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $6
     RETURNING *`,
    [
      name ? name.trim() : null,
      description !== undefined ? description : null,
      unit ? unit.trim() : null,
      reorder_level !== undefined ? Math.max(0, parseInt(reorder_level, 10)) : null,
      status ? status.trim() : null,
      id,
    ]
  );
  return result.rows[0];
}

module.exports = {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
};
