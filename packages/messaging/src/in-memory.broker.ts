import {
  BrokerEventListener,
  IMessageBroker,
  MessageEnvelope,
  MessageHandler,
  PublishOptions,
  QueueMetrics,
  SubscribeOptions,
} from './broker.interface.js';

interface Subscription {
  queueName: string;
  topicPattern: string;
  handler: MessageHandler<unknown>;
  maxRetries: number;
  retryDelayMs: number;
}

export class InMemoryBroker implements IMessageBroker {
  private subscriptions: Map<string, Subscription[]> = new Map();
  private dlqMessages: Map<string, MessageEnvelope<unknown>> = new Map();
  private metrics: Map<string, QueueMetrics> = new Map();
  private listeners: Set<BrokerEventListener> = new Set();
  private messageStore: Map<string, MessageEnvelope<unknown>> = new Map();

  private matchesTopic(pattern: string, topic: string): boolean {
    if (pattern === '#' || pattern === topic) return true;
    const regexPattern = '^' + pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '[^.]+')
      .replace(/#/g, '.*') + '$';
    return new RegExp(regexPattern).test(topic);
  }

  private emit(eventType: 'published' | 'delivered' | 'acked' | 'nacked' | 'dlq' | 'replayed', data: unknown) {
    for (const listener of this.listeners) {
      try {
        listener(eventType, data);
      } catch (err) {
        console.error('Error in broker event listener:', err);
      }
    }
  }

  public addListener(listener: BrokerEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
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

    this.messageStore.set(envelope.id, envelope as MessageEnvelope<unknown>);
    this.emit('published', envelope);

    // Asynchronously dispatch to matching subscribers
    setTimeout(() => {
      this.dispatchMessage(envelope as MessageEnvelope<unknown>);
    }, 0);

    return envelope;
  }

  private async dispatchMessage(envelope: MessageEnvelope<unknown>) {
    for (const [queueName, subList] of this.subscriptions.entries()) {
      for (const sub of subList) {
        if (this.matchesTopic(sub.topicPattern, envelope.topic)) {
          const metric = this.metrics.get(queueName);
          if (metric) {
            metric.messageCount++;
            metric.lastActiveTimestamp = new Date().toISOString();
          }

          this.emit('delivered', { queueName, message: envelope });

          try {
            await sub.handler(envelope);
            await this.ack(envelope.id, queueName);
          } catch (err) {
            console.warn(`[InMemoryBroker] Message processing failed on queue "${queueName}":`, (err as Error).message);
            await this.handleProcessingFailure(envelope, sub, err as Error);
          }
        }
      }
    }
  }

  private async handleProcessingFailure(
    envelope: MessageEnvelope<unknown>,
    sub: Subscription,
    error: Error,
  ) {
    const metric = this.metrics.get(sub.queueName);
    if (metric) metric.nackCount++;

    envelope.retryCount++;
    envelope.headers['lastError'] = error.message;

    if (envelope.retryCount >= sub.maxRetries) {
      // Move to Dead Letter Queue
      this.dlqMessages.set(envelope.id, envelope);
      if (metric) metric.dlqCount++;
      this.emit('dlq', { queueName: sub.queueName, message: envelope, error: error.message });
      console.warn(`[InMemoryBroker] Message ${envelope.id} moved to DLQ for queue "${sub.queueName}" after ${envelope.retryCount} attempts`);
    } else {
      // Schedule retry with exponential backoff
      const delay = sub.retryDelayMs * Math.pow(2, envelope.retryCount - 1);
      setTimeout(async () => {
        try {
          await sub.handler(envelope);
          await this.ack(envelope.id, sub.queueName);
        } catch (retryErr) {
          await this.handleProcessingFailure(envelope, sub, retryErr as Error);
        }
      }, delay);
    }
  }

  public async subscribe<T>(
    queueName: string,
    topicPattern: string,
    handler: MessageHandler<T>,
    options?: SubscribeOptions,
  ): Promise<void> {
    const existingList = this.subscriptions.get(queueName) || [];
    const subscription: Subscription = {
      queueName,
      topicPattern,
      handler: handler as MessageHandler<unknown>,
      maxRetries: options?.maxRetries ?? 3,
      retryDelayMs: options?.retryDelayMs ?? 100,
    };

    existingList.push(subscription);
    this.subscriptions.set(queueName, existingList);

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
    } else {
      const metric = this.metrics.get(queueName)!;
      metric.consumerCount++;
    }
  }

  public async ack(messageId: string, queueName?: string): Promise<void> {
    if (queueName) {
      const metric = this.metrics.get(queueName);
      if (metric) metric.ackCount++;
    }
    this.emit('acked', { messageId, queueName });
  }

  public async nack(messageId: string, requeue = false): Promise<void> {
    const message = this.messageStore.get(messageId);
    if (!message) return;

    this.emit('nacked', { messageId, requeue });
    if (!requeue) {
      this.dlqMessages.set(messageId, message);
    }
  }

  public getQueueMetrics(queueName?: string): QueueMetrics[] {
    if (queueName) {
      const m = this.metrics.get(queueName);
      return m ? [m] : [];
    }
    return Array.from(this.metrics.values());
  }

  public getDlqMessages(queueName?: string): MessageEnvelope<unknown>[] {
    const all = Array.from(this.dlqMessages.values());
    if (queueName) {
      return all.filter((m) => m.headers['queueName'] === queueName || true);
    }
    return all;
  }

  public async replayDlqMessage(messageId: string): Promise<boolean> {
    const msg = this.dlqMessages.get(messageId);
    if (!msg) return false;

    // Remove from DLQ and reset retryCount for replay
    this.dlqMessages.delete(messageId);
    msg.retryCount = 0;
    delete msg.headers['lastError'];

    this.emit('replayed', { message: msg });
    setTimeout(() => {
      this.dispatchMessage(msg);
    }, 0);

    return true;
  }

  public async close(): Promise<void> {
    this.subscriptions.clear();
    this.messageStore.clear();
    this.dlqMessages.clear();
    this.listeners.clear();
  }
}
