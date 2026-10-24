import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createLoanServiceApp } from './app.js';
import { getLoanDatabase } from './db/connection.js';
import { createCreditServiceApp } from '../../credit-service/src/app.js';
import { getCreditDatabase } from '../../credit-service/src/db/connection.js';
import { createDisbursementServiceApp } from '../../disbursement-service/src/app.js';
import { getDisbursementDatabase } from '../../disbursement-service/src/db/connection.js';
import { InMemoryBroker } from '@lendstrangler/messaging';

describe('Loan Service & End-to-End Choreography Saga Tests', () => {
  let loanDb: Database.Database;
  let creditDb: Database.Database;
  let disbDb: Database.Database;
  let broker: InMemoryBroker;

  let loanApp: ReturnType<typeof createLoanServiceApp>['app'];
  let loanOrchestrator: ReturnType<typeof createLoanServiceApp>['orchestrator'];
  let creditService: ReturnType<typeof createCreditServiceApp>['underwritingService'];
  let disbLedger: ReturnType<typeof createDisbursementServiceApp>['ledgerService'];

  beforeAll(async () => {
    loanDb = getLoanDatabase(':memory:');
    creditDb = getCreditDatabase(':memory:');
    disbDb = getDisbursementDatabase(':memory:');
    broker = new InMemoryBroker();

    const loanInit = createLoanServiceApp(loanDb, broker);
    loanApp = loanInit.app;
    loanOrchestrator = loanInit.orchestrator;

    const creditInit = createCreditServiceApp(creditDb, broker);
    creditService = creditInit.underwritingService;

    const disbInit = createDisbursementServiceApp(disbDb, broker);
    disbLedger = disbInit.ledgerService;

    // --- Wire Event Choreography ---
    // 1. Credit Service listens to loan.submitted
    await broker.subscribe('test-credit-queue', 'loan.submitted', async (envelope) => {
      await creditService.handleLoanSubmittedEvent(envelope);
    });

    // 2. Loan Service listens to credit.checked
    await broker.subscribe('test-loan-credit-queue', 'credit.checked', async (envelope) => {
      await loanOrchestrator.handleCreditCheckedEvent(envelope);
    });

    // 3. Disbursement Service listens to loan.approved
    await broker.subscribe('test-disb-queue', 'loan.approved', async (envelope) => {
      await disbLedger.handleLoanApprovedEvent(envelope);
    });

    // 4. Loan Service listens to disbursement.completed
    await broker.subscribe('test-loan-disb-comp-queue', 'disbursement.completed', async (envelope) => {
      await loanOrchestrator.handleDisbursementCompletedEvent(envelope);
    });

    // 5. Loan Service listens to disbursement.failed (COMPENSATION)
    await broker.subscribe('test-loan-disb-fail-queue', 'disbursement.failed', async (envelope) => {
      await loanOrchestrator.handleDisbursementFailedEvent(envelope);
    });
  });

  afterAll(async () => {
    loanDb.close();
    creditDb.close();
    disbDb.close();
    await broker.close();
  });

  it('GET /health returns 200 with service information and headers', async () => {
    const res = await request(loanApp)
      .get('/health')
      .set('X-Correlation-Id', 'corr-loan-health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
    expect(res.body.service).toBe('loan-service');
    expect(res.headers['x-served-by']).toBe('loan-service');
  });

  it('Executes FULL HAPPY PATH SAGA: Submit -> Credit Approved -> Disbursed', async () => {
    const loanPayload = {
      fullName: 'Atlas Global Logistics Inc',
      email: 'treasury@atlaslogistics.com',
      monthlyIncome: 200000,
      existingMonthlyEmi: 15000,
      amount: 400000,
      tenureMonths: 24,
      purpose: 'BUSINESS_EXPANSION' as const,
    };

    const res = await request(loanApp)
      .post('/api/loans')
      .send(loanPayload)
      .set('X-Correlation-Id', 'corr-saga-happy-path');

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('SUBMITTED');
    const loanId = res.body.id;

    // Wait for asynchronous saga hops across all 3 services
    await new Promise((resolve) => setTimeout(resolve, 350));

    // Verify final state of the loan application in loan-service
    const updatedLoan = loanOrchestrator.getLoanById(loanId);
    expect(updatedLoan).not.toBeNull();
    expect(updatedLoan?.status).toBe('DISBURSED');
    expect(updatedLoan?.creditScore).toBeGreaterThanOrEqual(750);
    expect(updatedLoan?.disbursementReference).toMatch(/^TXN-ACH-/);
  });

  it('Executes COMPENSATION SAGA: Disbursement failure triggers loan status FAILED', async () => {
    // Activate chaos on disbursement service
    disbLedger.setChaosRate(1.0);

    const loanPayload = {
      fullName: 'Zenith Retail Corporation',
      email: 'finance@zenithretail.com',
      monthlyIncome: 140000,
      existingMonthlyEmi: 10000,
      amount: 250000,
      tenureMonths: 18,
      purpose: 'HOME_IMPROVEMENT' as const,
    };

    const res = await request(loanApp)
      .post('/api/loans')
      .send(loanPayload)
      .set('X-Correlation-Id', 'corr-saga-compensation');

    expect(res.status).toBe(201);
    const loanId = res.body.id;

    // Wait for saga hops including failure compensation
    await new Promise((resolve) => setTimeout(resolve, 350));

    const updatedLoan = loanOrchestrator.getLoanById(loanId);
    expect(updatedLoan).not.toBeNull();
    expect(updatedLoan?.status).toBe('FAILED');
    expect(updatedLoan?.rejectionReason).toContain('Disbursement Failed');

    // Reset chaos
    disbLedger.setChaosRate(0.0);
  });

  it('Executes REJECTION SAGA: High DTI applicant marked REJECTED without disbursement', async () => {
    const badLoanPayload = {
      fullName: 'Overleveraged Holdings',
      email: 'debt@overleveraged.com',
      monthlyIncome: 30000,
      existingMonthlyEmi: 18000, // 60% DTI
      amount: 300000,
      tenureMonths: 12,
      purpose: 'DEBT_CONSOLIDATION' as const,
    };

    const res = await request(loanApp)
      .post('/api/loans')
      .send(badLoanPayload)
      .set('X-Correlation-Id', 'corr-saga-rejection');

    expect(res.status).toBe(201);
    const loanId = res.body.id;

    await new Promise((resolve) => setTimeout(resolve, 300));

    const updatedLoan = loanOrchestrator.getLoanById(loanId);
    expect(updatedLoan).not.toBeNull();
    expect(updatedLoan?.status).toBe('REJECTED');
    expect(updatedLoan?.rejectionReason).toContain('DTI_RATIO_EXCEEDS_MAXIMUM_THRESHOLD_50_PERCENT');
    expect(updatedLoan?.disbursementReference).toBeUndefined();
  });
});
