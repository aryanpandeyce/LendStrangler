import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createCreditServiceApp } from './app.js';
import { getCreditDatabase } from './db/connection.js';
import { InMemoryBroker, MessageEnvelope } from '@lendstrangler/messaging';
import { CreditCheckedPayloadSchema } from '@lendstrangler/contracts';
import { z } from 'zod';

type CreditCheckedPayload = z.infer<typeof CreditCheckedPayloadSchema>;

describe('Credit Service Microservice & Event Choreography Tests', () => {
  let db: Database.Database;
  let broker: InMemoryBroker;
  let app: ReturnType<typeof createCreditServiceApp>['app'];
  let underwritingService: ReturnType<typeof createCreditServiceApp>['underwritingService'];

  beforeAll(async () => {
    db = getCreditDatabase(':memory:');
    broker = new InMemoryBroker();
    const initialized = createCreditServiceApp(db, broker);
    app = initialized.app;
    underwritingService = initialized.underwritingService;

    // Register event listener
    await broker.subscribe(
      'test-credit-worker',
      'loan.submitted',
      async (envelope) => {
        await underwritingService.handleLoanSubmittedEvent(envelope);
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
      .set('X-Correlation-Id', 'corr-credit-health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
    expect(res.body.service).toBe('credit-service');
    expect(res.headers['x-served-by']).toBe('credit-service');
  });

  it('POST /api/credit/evaluate scores applicant and saves to dedicated database', async () => {
    const res = await request(app)
      .post('/api/credit/evaluate')
      .send({
        applicationId: 'app-cred-001',
        applicantId: 'usr-cred-101',
        monthlyIncome: 120000,
        existingMonthlyEmi: 15000,
        requestedAmount: 300000,
        tenureMonths: 24,
      });

    expect(res.status).toBe(200);
    expect(res.body.decision).toBe('APPROVED');
    expect(res.body.score).toBeGreaterThanOrEqual(720);
    expect(res.body.dtiRatio).toBeLessThan(0.4);

    // Verify stored evaluation in DB
    const stored = underwritingService.getEvaluationByApplicationId('app-cred-001');
    expect(stored).not.toBeNull();
    expect(stored?.score).toBe(res.body.score);
    expect(stored?.decision).toBe('APPROVED');
  });

  it('Consumes loan.submitted event and asynchronously publishes credit.checked', async () => {
    let capturedEvent: MessageEnvelope<CreditCheckedPayload> | null = null;

    await broker.subscribe<CreditCheckedPayload>('test-loan-listener', 'credit.checked', async (envelope) => {
      capturedEvent = envelope;
    });

    const loanSubmittedPayload = {
      applicationId: 'app-event-999',
      applicant: {
        id: 'usr-event-999',
        fullName: 'Skyline Aerospace Ltd',
        email: 'finance@skylineaero.com',
        monthlyIncome: 250000,
        existingMonthlyEmi: 20000,
      },
      amount: 600000,
      tenureMonths: 36,
      purpose: 'BUSINESS_EXPANSION' as const,
    };

    const publishedMsg = await broker.publish('loan.submitted', loanSubmittedPayload, {
      correlationId: 'corr-saga-credit-1',
    });

    // Wait for in-memory broker tick
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(capturedEvent).not.toBeNull();
    const event = capturedEvent!;
    expect(event.topic).toBe('credit.checked');
    expect(event.correlationId).toBe('corr-saga-credit-1');
    expect(event.causationId).toBe(publishedMsg.id);
    expect(event.payload.applicationId).toBe('app-event-999');
    expect(event.payload.decision).toBe('APPROVED');
  });

  it('Guarantees idempotency: duplicate event with same ID does not duplicate processing', async () => {
    const loanSubmittedPayload = {
      applicationId: 'app-idempotent-1',
      applicant: {
        id: 'usr-idempotent-1',
        fullName: 'Global Trade Corp',
        email: 'ops@globaltrade.com',
        monthlyIncome: 100000,
        existingMonthlyEmi: 10000,
      },
      amount: 150000,
      tenureMonths: 12,
      purpose: 'BUSINESS_EXPANSION' as const,
    };

    const duplicateEnvelope = {
      id: 'fixed-duplicate-msg-id-12345',
      topic: 'loan.submitted',
      payload: loanSubmittedPayload,
      correlationId: 'corr-idempotent-test',
      timestamp: new Date().toISOString(),
      retryCount: 0,
      maxRetries: 3,
      headers: {},
    };

    // First processing
    await underwritingService.handleLoanSubmittedEvent(duplicateEnvelope);
    const countFirst = db.prepare('SELECT COUNT(*) as count FROM credit_evaluations WHERE application_id = ?')
      .get('app-idempotent-1') as { count: number };
    expect(countFirst.count).toBe(1);

    // Second processing (duplicate)
    await underwritingService.handleLoanSubmittedEvent(duplicateEnvelope);
    const countSecond = db.prepare('SELECT COUNT(*) as count FROM credit_evaluations WHERE application_id = ?')
      .get('app-idempotent-1') as { count: number };
    expect(countSecond.count).toBe(1); // Still 1!
  });
});
