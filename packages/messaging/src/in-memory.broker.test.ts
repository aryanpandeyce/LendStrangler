import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryBroker } from './in-memory.broker.js';

describe('InMemoryBroker', () => {
  let broker: InMemoryBroker;

  beforeEach(() => {
    broker = new InMemoryBroker();
  });

  it('publishes and delivers messages matching wildcard topic patterns', async () => {
    let receivedPayload: unknown = null;
    let receivedTopic = '';

    await broker.subscribe('test-loan-queue', 'loan.*', async (envelope) => {
      receivedPayload = envelope.payload;
      receivedTopic = envelope.topic;
    });

    await broker.publish('loan.submitted', { applicationId: 'app-999' }, { correlationId: 'test-corr-1' });

    // Wait short tick for in-memory async dispatch
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(receivedTopic).toBe('loan.submitted');
    expect(receivedPayload).toEqual({ applicationId: 'app-999' });

    const metrics = broker.getQueueMetrics('test-loan-queue');
    expect(metrics[0].messageCount).toBe(1);
    expect(metrics[0].ackCount).toBe(1);
  });

  it('retries failing consumers and routes to DLQ after reaching maxRetries', async () => {
    let attempts = 0;

    await broker.subscribe(
      'failing-queue',
      'payment.*',
      async () => {
        attempts++;
        throw new Error('Simulated bank network error');
      },
      { maxRetries: 2, retryDelayMs: 20 },
    );

    const publishedMsg = await broker.publish('payment.process', { amount: 5000 });

    // Wait for retries to exhaust
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(attempts).toBeGreaterThanOrEqual(2);

    const dlq = broker.getDlqMessages();
    expect(dlq.length).toBe(1);
    expect(dlq[0].id).toBe(publishedMsg.id);
    expect(dlq[0].retryCount).toBeGreaterThanOrEqual(2);
  });

  it('allows replaying a message from the DLQ', async () => {
    let shouldFail = true;
    let successfulDeliveries = 0;

    await broker.subscribe(
      'replay-test-queue',
      'order.*',
      async () => {
        if (shouldFail) {
          throw new Error('Initial transient failure');
        }
        successfulDeliveries++;
      },
      { maxRetries: 1, retryDelayMs: 10 },
    );

    const msg = await broker.publish('order.created', { orderId: 'ord-123' });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const dlqBefore = broker.getDlqMessages();
    expect(dlqBefore.length).toBe(1);

    // Fix the error condition and replay
    shouldFail = false;
    const replayed = await broker.replayDlqMessage(msg.id);
    expect(replayed).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(successfulDeliveries).toBe(1);
    const dlqAfter = broker.getDlqMessages();
    expect(dlqAfter.length).toBe(0);
  });
});
