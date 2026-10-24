import { createCreditServiceApp } from './app.js';
import { getCreditDatabase } from './db/connection.js';
import { getMessageBroker } from '@lendstrangler/messaging';

const PORT = parseInt(process.env.PORT_CREDIT || '3002', 10);
const db = getCreditDatabase();
const broker = getMessageBroker();

const { app, underwritingService } = createCreditServiceApp(db, broker);

// Subscribe to event queue
broker.subscribe(
  'credit-service.loan-submitted',
  'loan.submitted',
  async (envelope) => {
    console.info(`[Credit Service] Consumed event "${envelope.topic}" (${envelope.id})`);
    await underwritingService.handleLoanSubmittedEvent(envelope);
  },
  { maxRetries: 3, retryDelayMs: 200 },
);

const server = app.listen(PORT, () => {
  console.info(`[Credit Service] Running on port ${PORT}`);
  console.info('[Credit Service] Subscribed to topic "loan.submitted"');
});

// Graceful Shutdown
function handleShutdown(signal: string) {
  console.info(`[Credit Service] Received ${signal}, shutting down...`);
  server.close(async () => {
    db.close();
    await broker.close();
    console.info('[Credit Service] Resources closed successfully.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
