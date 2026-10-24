import { createLoanServiceApp } from './app.js';
import { getLoanDatabase } from './db/connection.js';
import { getMessageBroker } from '@lendstrangler/messaging';

const PORT = parseInt(process.env.PORT_LOAN || '3004', 10);
const db = getLoanDatabase();
const broker = getMessageBroker();

const { app, orchestrator } = createLoanServiceApp(db, broker);

// 1. Subscribe to credit.checked
broker.subscribe(
  'loan-service.credit-checked',
  'credit.checked',
  async (envelope) => {
    console.info(`[Loan Service Saga] Handling event "${envelope.topic}" (${envelope.id})`);
    await orchestrator.handleCreditCheckedEvent(envelope);
  },
  { maxRetries: 3, retryDelayMs: 200 },
);

// 2. Subscribe to disbursement.completed
broker.subscribe(
  'loan-service.disbursement-completed',
  'disbursement.completed',
  async (envelope) => {
    console.info(`[Loan Service Saga] Handling event "${envelope.topic}" (${envelope.id})`);
    await orchestrator.handleDisbursementCompletedEvent(envelope);
  },
  { maxRetries: 3, retryDelayMs: 200 },
);

// 3. Subscribe to disbursement.failed (COMPENSATION PATH)
broker.subscribe(
  'loan-service.disbursement-failed',
  'disbursement.failed',
  async (envelope) => {
    console.warn(`[Loan Service Saga Compensation] Handling event "${envelope.topic}" (${envelope.id})`);
    await orchestrator.handleDisbursementFailedEvent(envelope);
  },
  { maxRetries: 3, retryDelayMs: 200 },
);

// Outbox Poller
const outboxInterval = setInterval(async () => {
  try {
    const count = await orchestrator.flushOutbox();
    if (count > 0) {
      console.info(`[Loan Service Outbox Relay] Flushed ${count} message(s)`);
    }
  } catch (err) {
    console.error('[Loan Service Outbox Relay Error]:', err);
  }
}, 3000);

const server = app.listen(PORT, () => {
  console.info(`[Loan Service] Running on port ${PORT}`);
  console.info('[Loan Service] Active saga subscriptions: credit.checked, disbursement.completed, disbursement.failed');
});

// Graceful Shutdown
function handleShutdown(signal: string) {
  console.info(`[Loan Service] Received ${signal}, closing server...`);
  clearInterval(outboxInterval);
  server.close(async () => {
    db.close();
    await broker.close();
    console.info('[Loan Service] Closed gracefully.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
