import amqplib, { Channel, ChannelModel } from 'amqplib';
import {
  BrokerEventListener,
  IMessageBroker,
  MessageEnvelope,
  MessageHandler,
  PublishOptions,
  QueueMetrics,
  SubscribeOptions,
} from './broker.interface.js';

export interface RabbitMqConfig {
  url: string;
  exchangeName?: string;
  deadLetterExchange?: string;
}

export class RabbitMQBroker implements IMessageBroker {
  private config: Required<RabbitMqConfig>;
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private listeners: Set<BrokerEventListener> = new Set();
  private metrics: Map<string, QueueMetrics> = new Map();
  private dlqMessages: Map<string, MessageEnvelope<unknown>> = new Map();

  constructor(config?: Partial<RabbitMqConfig>) {
    this.config = {
      url: config?.url || process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
      exchangeName: config?.exchangeName || 'lendstrangler.topic',
      deadLetterExchange: config?.deadLetterExchange || 'lendstrangler.dlx',
    };
  }

  private emit(eventType: 'published' | 'delivered' | 'acked' | 'nacked' | 'dlq' | 'replayed', data: unknown) {
    for (const listener of this.listeners) {
      try {
        listener(eventType, data);
      } catch (err) {
        console.error('Error in RabbitMQ broker event listener:', err);
      }
    }
  }

  public addListener(listener: BrokerEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async ensureConnected(): Promise<{ conn: ChannelModel; ch: Channel }> {
    if (this.connection && this.channel) {
      return { conn: this.connection, ch: this.channel };
    }

    try {
      const conn = await amqplib.connect(this.config.url);
      const ch = await conn.createChannel();

      // Assert Main Topic Exchange
      await ch.assertExchange(this.config.exchangeName, 'topic', { durable: true });

      // Assert Dead Letter Topic Exchange
      await ch.assertExchange(this.config.deadLetterExchange, 'topic', { durable: true });

      this.connection = conn;
      this.channel = ch;

      return { conn, ch };
    } catch (err) {
      console.warn(`[RabbitMQBroker] Failed to connect to ${this.config.url}: ${(err as Error).message}`);
      throw err;
    }
  }

  public async publish<T>(
    topic: string,
    payload: T,
    options?: PublishOptions,
  ): Promise<MessageEnvelope<T>> {
    const envelope: MessageEnvelope<T> = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      topic,
      payload,
      correlationId: options?.correlationId || `corr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      causationId: options?.causationId,
      timestamp: new Date().toISOString(),
      retryCount: 0,
      maxRetries: options?.maxRetries ?? 3,
      headers: options?.headers || {},
    };

    try {
      const { ch } = await this.ensureConnected();
      const content = Buffer.from(JSON.stringify(envelope));
      ch.publish(this.config.exchangeName, topic, content, {
        persistent: true,
        messageId: envelope.id,
        correlationId: envelope.correlationId,
        timestamp: Date.now(),
        headers: envelope.headers,
      });

      this.emit('published', envelope);
      return envelope;
    } catch (err) {
      console.error('[RabbitMQBroker] Error publishing message:', err);
      throw err;
    }
  }

  public async subscribe<T>(
    queueName: string,
    topicPattern: string,
    handler: MessageHandler<T>,
    options?: SubscribeOptions,
  ): Promise<void> {
    const { ch } = await this.ensureConnected();

    // Declare DLQ queue for this queue
    const dlqQueueName = `${queueName}.dlq`;
    await ch.assertQueue(dlqQueueName, { durable: true });
    await ch.bindQueue(dlqQueueName, this.config.deadLetterExchange, topicPattern);

    // Declare Main Queue with Dead Letter routing
    await ch.assertQueue(queueName, {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': this.config.deadLetterExchange,
        'x-dead-letter-routing-key': topicPattern,
      },
    });

    await ch.bindQueue(queueName, this.config.exchangeName, topicPattern);

    if (!this.metrics.has(queueName)) {
      this.metrics.set(queueName, {
        queueName,
        topicPattern,
        messageCount: 0,
        consumerCount: 1,
        ackCount: 0,
        nackCount: 0,
        dlqCount: 0,
      });
    }

    await ch.consume(queueName, async (msg) => {
      if (!msg) return;

      const metric = this.metrics.get(queueName);
      if (metric) {
        metric.messageCount++;
        metric.lastActiveTimestamp = new Date().toISOString();
      }

      try {
        const envelope = JSON.parse(msg.content.toString()) as MessageEnvelope<T>;
        this.emit('delivered', { queueName, message: envelope });

        await handler(envelope);
        ch.ack(msg);
        if (metric) metric.ackCount++;
        this.emit('acked', { messageId: envelope.id, queueName });
      } catch (error) {
        if (metric) metric.nackCount++;
        const currentDeathCount = (msg.properties.headers?.['x-death']?.[0]?.count as number) || 0;
        const maxRetries = options?.maxRetries ?? 3;

        if (currentDeathCount >= maxRetries) {
          // Reject without requeue, sends directly to Dead Letter Exchange
          ch.nack(msg, false, false);
          if (metric) metric.dlqCount++;
          this.emit('dlq', { queueName, error: (error as Error).message });
        } else {
          // Requeue for retry
          ch.nack(msg, false, true);
        }
      }
    });
  }

  public async ack(_messageId: string): Promise<void> {
    // Ack is handled directly on message acknowledgment in consume
  }

  public async nack(_messageId: string, _requeue = false): Promise<void> {
    // Nack is handled in consume error handler
  }

  public getQueueMetrics(queueName?: string): QueueMetrics[] {
    if (queueName) {
      const m = this.metrics.get(queueName);
      return m ? [m] : [];
    }
    return Array.from(this.metrics.values());
  }

  public getDlqMessages(queueName?: string): MessageEnvelope<unknown>[] {
    const list = Array.from(this.dlqMessages.values());
    return queueName ? list.filter((m) => m.headers['queueName'] === queueName) : list;
  }

  public async replayDlqMessage(messageId: string): Promise<boolean> {
    const msg = this.dlqMessages.get(messageId);
    if (!msg) return false;
    await this.publish(msg.topic, msg.payload, { correlationId: msg.correlationId });
    this.dlqMessages.delete(messageId);
    this.emit('replayed', { message: msg });
    return true;
  }

  public async close(): Promise<void> {
    try {
      if (this.channel) await this.channel.close();
      if (this.connection) await this.connection.close();
    } catch {
      // Ignore closing errors
    } finally {
      this.channel = null;
      this.connection = null;
      this.listeners.clear();
    }
  }
}
