const db = require('../config/db');

async function getNotifications(req, res, next) {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const result = await db.query(
      `SELECT id, event_id, routing_key, event_type, title, message, payload, is_read, created_at
       FROM notifications
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    const unreadCount = await db.query(
      `SELECT COUNT(*) FROM notifications WHERE is_read = FALSE`
    );

    res.json({
      success: true,
      unreadCount: parseInt(unreadCount.rows[0].count, 10),
      data: result.rows,
    });
  } catch (err) {
    next(err);
  }
}

async function markNotificationsRead(req, res, next) {
  try {
    const { id } = req.body;
    if (id) {
      await db.query('UPDATE notifications SET is_read = TRUE WHERE id = $1', [id]);
    } else {
      await db.query('UPDATE notifications SET is_read = TRUE WHERE is_read = FALSE');
    }
    res.json({ success: true, message: 'Notifications marked as read' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getNotifications,
  markNotificationsRead,
};
