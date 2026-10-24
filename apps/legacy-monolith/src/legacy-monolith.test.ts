import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createLegacyApp } from './app.js';
import { getDatabase } from './db/connection.js';
import { seedLegacyDatabase } from './db/seed.js';

describe('Legacy Monolith API & God Service Integration Tests', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createLegacyApp>;

  beforeAll(() => {
    // In-memory SQLite for high-speed, isolated test execution
    db = getDatabase(':memory:');
    seedLegacyDatabase(db);
    app = createLegacyApp(db);
  });

  afterAll(() => {
    db.close();
  });

  it('GET /health returns 200 with service information and headers', async () => {
    const res = await request(app)
      .get('/health')
      .set('X-Correlation-Id', 'test-corr-health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
    expect(res.body.service).toBe('legacy-monolith');
    expect(res.headers['x-correlation-id']).toBe('test-corr-health');
    expect(res.headers['x-served-by']).toBe('legacy-monolith');
  });

  it('GET /api/loans returns initial seeded corporate loans', async () => {
    const res = await request(app).get('/api/loans');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
  });

  it('POST /api/loans processes approved applicant through synchronous chain to DISBURSED', async () => {
    const loanPayload = {
      fullName: 'Meridian Capital Partners',
      email: 'loans@meridiancap.com',
      monthlyIncome: 150000,
      existingMonthlyEmi: 10000,
      amount: 300000,
      tenureMonths: 24,
      purpose: 'BUSINESS_EXPANSION' as const,
    };

    const res = await request(app)
      .post('/api/loans')
      .send(loanPayload)
      .set('X-Correlation-Id', 'corr-monolith-apply-1');

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('DISBURSED');
    expect(res.body.creditScore).toBeGreaterThanOrEqual(700);
    expect(res.body.disbursementReference).toMatch(/^TXN-BANK-/);
    expect(res.body.monthlyEmi).toBeGreaterThan(0);
  });

  it('POST /api/loans rejects subprime applicant with high DTI during synchronous evaluation', async () => {
    const badLoanPayload = {
      fullName: 'Struggling Retail LLC',
      email: 'ops@strugglingretail.com',
      monthlyIncome: 20000, // Below 25000 threshold
      existingMonthlyEmi: 10000,
      amount: 200000,
      tenureMonths: 12,
      purpose: 'DEBT_CONSOLIDATION' as const,
    };

    const res = await request(app)
      .post('/api/loans')
      .send(badLoanPayload);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('REJECTED');
    expect(res.body.rejectionReason).toContain('INSUFFICIENT_MINIMUM_INCOME_BELOW_25000');
    expect(res.body.disbursementReference).toBeUndefined();
  });

  it('POST /api/loans sets status to FAILED when disbursement fails during synchronous transfer', async () => {
    const loanPayload = {
      fullName: 'Titan Logistics Corp',
      email: 'finance@titanlogistics.com',
      monthlyIncome: 120000,
      existingMonthlyEmi: 5000,
      amount: 100000,
      tenureMonths: 12,
      purpose: 'HOME_IMPROVEMENT' as const,
    };

    const res = await request(app)
      .post('/api/loans?forceDisbursementFailure=true')
      .send(loanPayload);

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('FAILED');
    expect(res.body.rejectionReason).toContain('GATEWAY_TIMEOUT_TRANSFER_ABORTED');
  });

  it('POST /api/credit/evaluate executes isolated legacy credit scoring', async () => {
    const res = await request(app)
      .post('/api/credit/evaluate')
      .send({
        applicationId: 'test-app-direct',
        applicantId: 'test-usr-direct',
        monthlyIncome: 80000,
        existingMonthlyEmi: 8000,
        requestedAmount: 150000,
        tenureMonths: 24,
      });

    expect(res.status).toBe(200);
    expect(res.body.decision).toBe('APPROVED');
    expect(res.body.score).toBeGreaterThanOrEqual(700);
    expect(res.body.dtiRatio).toBeLessThan(0.4);
  });

  it('POST /api/disbursements/transfer executes direct bank disbursement', async () => {
    const res = await request(app)
      .post('/api/disbursements/transfer')
      .send({
        applicationId: 'test-app-transfer',
        amount: 75000,
        recipientAccount: 'ACC-8839210-01',
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUCCESS');
    expect(res.body.bankTransferReference).toBeDefined();
  });
});
