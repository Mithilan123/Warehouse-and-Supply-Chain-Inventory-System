const amqp = require('amqplib');
require('dotenv').config();

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const EXCHANGE_NAME = process.env.RABBITMQ_EXCHANGE || 'inventory.events';
const NOTIFICATION_QUEUE = process.env.RABBITMQ_NOTIFICATION_QUEUE || 'stock-notifications';
const AUDIT_QUEUE = process.env.RABBITMQ_AUDIT_QUEUE || 'inventory-audit';

let connection = null;
let confirmChannel = null;
let consumerChannel = null;
let isConnecting = false;

async function connectRabbitMQ() {
  if (connection && confirmChannel) {
    return { connection, confirmChannel, consumerChannel };
  }

  if (isConnecting) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    return connectRabbitMQ();
  }

  isConnecting = true;
  try {
    console.log(`[RabbitMQ] Connecting to broker at ${RABBITMQ_URL}...`);
    connection = await amqp.connect(RABBITMQ_URL);

    connection.on('error', (err) => {
      console.error('[RabbitMQ] Connection error:', err.message);
      connection = null;
      confirmChannel = null;
      consumerChannel = null;
    });

    connection.on('close', () => {
      console.warn('[RabbitMQ] Connection closed. Reconnecting in 3s...');
      connection = null;
      confirmChannel = null;
      consumerChannel = null;
      setTimeout(connectRabbitMQ, 3000);
    });

    // 1. Confirm Channel for Reliable Publishing (Publisher Confirms)
    confirmChannel = await connection.createConfirmChannel();

    // 2. Regular Channel for Consumer Acknowledgments
    consumerChannel = await connection.createChannel();
    await consumerChannel.prefetch(10);

    // 3. Declare Durable Topic Exchange
    await confirmChannel.assertExchange(EXCHANGE_NAME, 'topic', {
      durable: true,
    });
    console.log(`[RabbitMQ] Declared durable topic exchange '${EXCHANGE_NAME}'`);

    // 4. Declare Durable Queue 1: stock-notifications
    await confirmChannel.assertQueue(NOTIFICATION_QUEUE, {
      durable: true,
    });
    // Bind to relevant routing patterns
    const notificationBindings = [
      'stock.low',
      'stock.received',
      'stock.adjusted',
      'transfer.dispatched',
      'transfer.received',
      'shipment.dispatched',
    ];
    for (const routingKey of notificationBindings) {
      await confirmChannel.bindQueue(NOTIFICATION_QUEUE, EXCHANGE_NAME, routingKey);
    }
    console.log(`[RabbitMQ] Queue '${NOTIFICATION_QUEUE}' bound to routing keys:`, notificationBindings);

    // 5. Declare Durable Queue 2: inventory-audit (Audit logs all events via wildcard '#')
    await confirmChannel.assertQueue(AUDIT_QUEUE, {
      durable: true,
    });
    await confirmChannel.bindQueue(AUDIT_QUEUE, EXCHANGE_NAME, '#');
    console.log(`[RabbitMQ] Queue '${AUDIT_QUEUE}' bound to '#' for system audit`);

    isConnecting = false;
    return { connection, confirmChannel, consumerChannel };
  } catch (err) {
    isConnecting = false;
    console.error('[RabbitMQ] Failed to initialize RabbitMQ topology:', err.message);
    throw err;
  }
}

/**
 * Publish message using Publisher Confirms and Persistent delivery
 */
async function publishEvent(routingKey, messageObj) {
  try {
    const { confirmChannel } = await connectRabbitMQ();
    const content = Buffer.from(JSON.stringify(messageObj));

    return new Promise((resolve, reject) => {
      confirmChannel.publish(
        EXCHANGE_NAME,
        routingKey,
        content,
        {
          persistent: true,
          contentType: 'application/json',
          timestamp: Date.now(),
          messageId: messageObj.eventId || messageObj.id,
        },
        (err, ok) => {
          if (err) {
            console.error(`[RabbitMQ] Broker NACKed message for ${routingKey}:`, err);
            return reject(err);
          }
          console.log(`[RabbitMQ Confirmed] Published to '${EXCHANGE_NAME}' with key '${routingKey}'`);
          resolve(true);
        }
      );
    });
  } catch (err) {
    console.error(`[RabbitMQ Publish Error] Failed to publish ${routingKey}:`, err.message);
    throw err;
  }
}

async function getConsumerChannel() {
  const { consumerChannel } = await connectRabbitMQ();
  return consumerChannel;
}

module.exports = {
  connectRabbitMQ,
  publishEvent,
  getConsumerChannel,
  EXCHANGE_NAME,
  NOTIFICATION_QUEUE,
  AUDIT_QUEUE,
};
