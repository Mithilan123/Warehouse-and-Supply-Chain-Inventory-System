const db = require('../config/db');
const { publishEvent } = require('../messaging/rabbitmq');

let isPublishing = false;
let publisherInterval = null;

async function processOutboxBatch() {
  if (isPublishing) return;
  isPublishing = true;

  try {
    // Fetch pending or failed outbox events (ordered by creation time, batch of 20)
    const pendingEvents = await db.query(
      `SELECT id, event_type, routing_key, payload, retry_count
       FROM outbox_events
       WHERE status IN ('PENDING', 'FAILED') AND retry_count < 10
       ORDER BY created_at ASC
       LIMIT 20`
    );

    if (pendingEvents.rows.length === 0) {
      isPublishing = false;
      return;
    }

    for (const event of pendingEvents.rows) {
      try {
        const payloadWithMeta = {
          eventId: event.id,
          eventType: event.event_type,
          routingKey: event.routing_key,
          ...(typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload),
        };

        // Publish with publisher confirms
        await publishEvent(event.routing_key, payloadWithMeta);

        // Mark as PUBLISHED
        await db.query(
          `UPDATE outbox_events
           SET status = 'PUBLISHED', processed_at = CURRENT_TIMESTAMP, last_error = NULL
           WHERE id = $1`,
          [event.id]
        );
      } catch (err) {
        console.error(`[Outbox Worker] Failed to publish event ${event.id}:`, err.message);
        await db.query(
          `UPDATE outbox_events
           SET status = 'FAILED', retry_count = retry_count + 1, last_error = $2
           WHERE id = $1`,
          [event.id, err.message]
        );
      }
    }
  } catch (err) {
    // Database may be temporarily unreachable
    console.error('[Outbox Worker Batch Error]:', err.message);
  } finally {
    isPublishing = false;
  }
}

function startOutboxPublisher(intervalMs = 1000) {
  if (publisherInterval) clearInterval(publisherInterval);
  console.log(`[Outbox Worker] Started background outbox publisher (interval: ${intervalMs}ms)`);
  // Immediate trigger
  processOutboxBatch();
  publisherInterval = setInterval(processOutboxBatch, intervalMs);
}

function stopOutboxPublisher() {
  if (publisherInterval) {
    clearInterval(publisherInterval);
    publisherInterval = null;
    console.log('[Outbox Worker] Stopped outbox publisher');
  }
}

module.exports = {
  startOutboxPublisher,
  stopOutboxPublisher,
  processOutboxBatch,
};
