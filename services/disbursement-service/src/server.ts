import { createDisbursementServiceApp } from './app.js';
import { getDisbursementDatabase } from './db/connection.js';
import { getMessageBroker } from '@lendstrangler/messaging';

const PORT = parseInt(process.env.PORT_DISBURSEMENT || '3003', 10);
const db = getDisbursementDatabase();
const broker = getMessageBroker();

const { app, ledgerService } = createDisbursementServiceApp(db, broker);

// Subscribe to loan.approved event on durable queue with retries and DLQ
broker.subscribe(
  'disbursement-service.loan-approved',
  'loan.approved',
  async (envelope) => {
    console.info(`[Disbursement Service] Consumed event "${envelope.topic}" (${envelope.id})`);
    await ledgerService.handleLoanApprovedEvent(envelope);
  },
  { maxRetries: 3, retryDelayMs: 250 },
);

// Outbox Poller / Relay Interval: polls for any pending messages every 3 seconds
const outboxInterval = setInterval(async () => {
  try {
    const published = await ledgerService.flushOutbox();
    if (published > 0) {
      console.info(`[Disbursement Service Outbox Relay] Flushed ${published} pending message(s)`);
    }
  } catch (err) {
    console.error('[Disbursement Service Outbox Relay Error]:', err);
  }
}, 3000);

const server = app.listen(PORT, () => {
  console.info(`[Disbursement Service] Running on port ${PORT}`);
  console.info('[Disbursement Service] Subscribed to topic "loan.approved"');
});

// Graceful Shutdown
function handleShutdown(signal: string) {
  console.info(`[Disbursement Service] Received ${signal}, shutting down...`);
  clearInterval(outboxInterval);
  server.close(async () => {
    db.close();
    await broker.close();
    console.info('[Disbursement Service] Resources closed successfully.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
