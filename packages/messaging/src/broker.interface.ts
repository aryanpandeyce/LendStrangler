export interface MessageEnvelope<T = unknown> {
  id: string;
  topic: string;
  payload: T;
  correlationId: string;
  causationId?: string;
  timestamp: string;
  retryCount: number;
  maxRetries: number;
  headers: Record<string, string | number | boolean>;
}

export type MessageHandler<T = unknown> = (message: MessageEnvelope<T>) => Promise<void>;

export interface QueueMetrics {
  queueName: string;
  topicPattern: string;
  messageCount: number;
  consumerCount: number;
  ackCount: number;
  nackCount: number;
  dlqCount: number;
  lastActiveTimestamp?: string;
}

export interface PublishOptions {
  correlationId?: string;
  causationId?: string;
  headers?: Record<string, string | number | boolean>;
  maxRetries?: number;
}

export interface SubscribeOptions {
  maxRetries?: number;
  retryDelayMs?: number;
}

export interface BrokerEventListener {
  (eventType: 'published' | 'delivered' | 'acked' | 'nacked' | 'dlq' | 'replayed', data: unknown): void;
}

export interface IMessageBroker {
  publish<T>(topic: string, payload: T, options?: PublishOptions): Promise<MessageEnvelope<T>>;
  subscribe<T>(
    queueName: string,
    topicPattern: string,
    handler: MessageHandler<T>,
    options?: SubscribeOptions,
  ): Promise<void>;
  ack(messageId: string): Promise<void>;
  nack(messageId: string, requeue?: boolean): Promise<void>;
  getQueueMetrics(queueName?: string): QueueMetrics[];
  getDlqMessages(queueName?: string): MessageEnvelope<unknown>[];
  replayDlqMessage(messageId: string): Promise<boolean>;
  addListener(listener: BrokerEventListener): () => void;
  close(): Promise<void>;
}
