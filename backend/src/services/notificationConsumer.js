const db = require('../config/db');
const { getConsumerChannel, NOTIFICATION_QUEUE } = require('../messaging/rabbitmq');

let isConsumerRunning = false;

async function startNotificationConsumer() {
  if (isConsumerRunning) return;

  try {
    const channel = await getConsumerChannel();
    isConsumerRunning = true;

    console.log(`[Notification Consumer] Listening on queue '${NOTIFICATION_QUEUE}'...`);

    await channel.consume(
      NOTIFICATION_QUEUE,
      async (msg) => {
        if (!msg) return;

        try {
          const contentStr = msg.content.toString();
          const event = JSON.parse(contentStr);
          const eventId = event.eventId || msg.properties.messageId || 'unknown-' + Date.now();
          const routingKey = msg.fields.routingKey;
          const eventType = event.eventType || routingKey;

          // 1. Idempotency Check via processed_events table
          const duplicateCheck = await db.query(
            'SELECT event_id FROM processed_events WHERE event_id = $1',
            [eventId]
          );

          if (duplicateCheck.rows.length > 0) {
            console.log(`[Notification Consumer] Duplicate event detected (${eventId}). Acknowledging without duplicate processing.`);
            channel.ack(msg);
            return;
          }

          // 2. Format UI notification title & message
          let title = `Inventory Event: ${routingKey}`;
          let message = `Event received for ${routingKey}`;

          switch (routingKey) {
            case 'stock.low':
              title = `⚠️ Low Stock Alert: ${event.product_name || event.sku}`;
              message = `Available stock (${event.available}) is at or below reorder level (${event.reorder_level}) in ${event.warehouse_id}!`;
              break;
            case 'stock.received':
              title = `📦 Stock Received: ${event.product_name || event.product_id}`;
              message = `Received +${event.quantity} units at warehouse ${event.warehouse_id}. (Ref: ${event.reference_id || 'PO'})`;
              break;
            case 'stock.adjusted':
              title = `✏️ Stock Adjustment: ${event.product_name || event.product_id}`;
              message = `Adjusted by ${event.quantity > 0 ? '+' : ''}${event.quantity} units at warehouse ${event.warehouse_id}. Reason: ${event.reason}`;
              break;
            case 'transfer.dispatched':
              title = `🚚 Transfer Dispatched: ${event.transfer_number}`;
              message = `${event.quantity} units dispatched from ${event.source_warehouse_id} to ${event.destination_warehouse_id}. Goods now IN_TRANSIT.`;
              break;
            case 'transfer.received':
              title = `✅ Transfer Received: ${event.transfer_number}`;
              message = `Transfer completed! Stock received and available at warehouse ${event.destination_warehouse_id}.`;
              break;
            case 'shipment.dispatched':
              title = `🛫 Shipment Dispatched: ${event.shipment_number}`;
              message = `Order dispatched from warehouse ${event.warehouse_id}. Stock deducted.`;
              break;
            default:
              title = `System Notification: ${routingKey}`;
              message = JSON.stringify(event);
          }

          // 3. Atomically record processed event and insert notification for UI
          await db.withTransaction(async (client) => {
            await client.query(
              `INSERT INTO processed_events (event_id, event_type)
               VALUES ($1, $2)
               ON CONFLICT (event_id) DO NOTHING`,
              [eventId, eventType]
            );

            await client.query(
              `INSERT INTO notifications (event_id, routing_key, event_type, title, message, payload)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [eventId, routingKey, eventType, title, message, JSON.stringify(event)]
            );
          });

          console.log(`[Notification Consumer ACK] Handled ${routingKey} (Event ID: ${eventId})`);

          // 4. Manual acknowledgment
          channel.ack(msg);
        } catch (err) {
          console.error('[Notification Consumer Error] Failed processing message:', err.message);
          // NACK without requeue if malformed, or requeue on temporary failure
          channel.nack(msg, false, false);
        }
      },
      { noAck: false } // Manual ACK required
    );
  } catch (err) {
    isConsumerRunning = false;
    console.error('[Notification Consumer Error] Failed to start consumer:', err.message);
  }
}

module.exports = {
  startNotificationConsumer,
};
