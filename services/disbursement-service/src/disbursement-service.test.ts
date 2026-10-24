import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createDisbursementServiceApp } from './app.js';
import { getDisbursementDatabase } from './db/connection.js';
import { InMemoryBroker, MessageEnvelope } from '@lendstrangler/messaging';
import {
  DisbursementCompletedPayloadSchema,
  DisbursementFailedPayloadSchema,
} from '@lendstrangler/contracts';
import { z } from 'zod';

type DisbursementCompletedPayload = z.infer<typeof DisbursementCompletedPayloadSchema>;
type DisbursementFailedPayload = z.infer<typeof DisbursementFailedPayloadSchema>;

describe('Disbursement Service, Transactional Outbox & Compensation Tests', () => {
  let db: Database.Database;
  let broker: InMemoryBroker;
  let app: ReturnType<typeof createDisbursementServiceApp>['app'];
  let ledgerService: ReturnType<typeof createDisbursementServiceApp>['ledgerService'];

  beforeAll(async () => {
    db = getDisbursementDatabase(':memory:');
    broker = new InMemoryBroker();
    const initialized = createDisbursementServiceApp(db, broker);
    app = initialized.app;
    ledgerService = initialized.ledgerService;

    // Register event subscriber
    await broker.subscribe(
      'test-disbursement-worker',
      'loan.approved',
      async (envelope) => {
        await ledgerService.handleLoanApprovedEvent(envelope);
      },
    );
  });

  afterAll(async () => {
    db.close();
    await broker.close();
  });

  it('GET /health returns 200 with service information and headers', async () => {
    const res = await request(app)
      .get('/health')
      .set('X-Correlation-Id', 'corr-disb-health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
    expect(res.body.service).toBe('disbursement-service');
    expect(res.headers['x-served-by']).toBe('disbursement-service');
  });

  it('POST /api/disbursements/transfer processes success, writes to outbox, and flushes', async () => {
    let capturedEvent: MessageEnvelope<DisbursementCompletedPayload> | null = null;
    await broker.subscribe<DisbursementCompletedPayload>(
      'test-disb-completed-queue',
      'disbursement.completed',
      async (envelope) => {
        capturedEvent = envelope;
      },
    );

    const res = await request(app)
      .post('/api/disbursements/transfer')
      .send({
        applicationId: 'app-disb-success-1',
        amount: 85000,
        recipientAccount: 'ACC-778899-01',
      })
      .set('X-Correlation-Id', 'corr-disb-test-success');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUCCESS');
    expect(res.body.bankTransferReference).toMatch(/^TXN-ACH-/);

    // Verify written to database
    const stored = ledgerService.getDisbursementById(res.body.id);
    expect(stored).not.toBeNull();
    expect(stored?.status).toBe('SUCCESS');

    // Wait for outbox async relay tick
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(capturedEvent).not.toBeNull();
    const event = capturedEvent!;
    expect(event.topic).toBe('disbursement.completed');
    expect(event.correlationId).toBe('corr-disb-test-success');
    expect(event.payload.applicationId).toBe('app-disb-success-1');
  });

  it('Emits compensation event disbursement.failed when forced failure or chaos is active', async () => {
    let failureEvent: MessageEnvelope<DisbursementFailedPayload> | null = null;
    await broker.subscribe<DisbursementFailedPayload>(
      'test-disb-failed-queue',
      'disbursement.failed',
      async (envelope) => {
        failureEvent = envelope;
      },
    );

    const res = await request(app)
      .post('/api/disbursements/transfer')
      .send({
        applicationId: 'app-disb-chaos-1',
        amount: 120000,
        recipientAccount: 'ACC-112233-02',
        forceFailure: true,
      })
      .set('X-Correlation-Id', 'corr-disb-test-failure');

    expect(res.status).toBe(502);
    expect(res.body.status).toBe('FAILED');
    expect(res.body.failureReason).toBe('PAYMENT_RAILS_NETWORK_TIMEOUT');

    // Wait for outbox relay tick
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(failureEvent).not.toBeNull();
    const event = failureEvent!;
    expect(event.topic).toBe('disbursement.failed');
    expect(event.correlationId).toBe('corr-disb-test-failure');
    expect(event.payload.applicationId).toBe('app-disb-chaos-1');
    expect(event.payload.reason).toBe('PAYMENT_RAILS_NETWORK_TIMEOUT');
  });

  it('Consumes loan.approved event, executes transfer, and stores idempotency key', async () => {
    let completedMsg: MessageEnvelope<DisbursementCompletedPayload> | null = null;
    await broker.subscribe<DisbursementCompletedPayload>(
      'test-choreography-completion-queue',
      'disbursement.completed',
      async (envelope) => {
        completedMsg = envelope;
      },
    );

    const approvedPayload = {
      applicationId: 'app-choreography-101',
      applicantId: 'usr-corp-202',
      amount: 450000,
      tenureMonths: 36,
      interestRateAnnual: 9.5,
      monthlyEmi: 14414.54,
      recipientAccount: 'ACC-CORP-4500-01',
    };

    const published = await broker.publish('loan.approved', approvedPayload, {
      correlationId: 'corr-saga-disb-101',
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(completedMsg).not.toBeNull();
    const event = completedMsg!;
    expect(event.payload.applicationId).toBe('app-choreography-101');
    expect(event.correlationId).toBe('corr-saga-disb-101');
    expect(event.causationId).toBe(published.id);

    // Verify idempotency record exists
    const processed = db.prepare('SELECT message_id FROM processed_messages WHERE message_id = ?')
      .get(published.id);
    expect(processed).toBeDefined();

    // Verify duplicate delivery is ignored
    const countBefore = db.prepare('SELECT COUNT(*) as count FROM disbursements WHERE application_id = ?')
      .get('app-choreography-101') as { count: number };
    await ledgerService.handleLoanApprovedEvent(published);
    const countAfter = db.prepare('SELECT COUNT(*) as count FROM disbursements WHERE application_id = ?')
      .get('app-choreography-101') as { count: number };

    expect(countBefore.count).toBe(1);
    expect(countAfter.count).toBe(1);
  });

  it('POST /api/disbursements/chaos updates dynamic failure rate', async () => {
    const res = await request(app)
      .post('/api/disbursements/chaos')
      .send({ failureRate: 0.75 });

    expect(res.status).toBe(200);
    expect(res.body.chaosFailureRate).toBe(0.75);
    expect(ledgerService.getChaosRate()).toBe(0.75);

    // Reset chaos rate
    await request(app).post('/api/disbursements/chaos').send({ failureRate: 0.0 });
    expect(ledgerService.getChaosRate()).toBe(0.0);
  });
});
