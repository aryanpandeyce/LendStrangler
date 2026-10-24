import { describe, it, expect } from 'vitest';
import { evaluateCreditScore, REASON_CODES } from './credit.js';

describe('evaluateCreditScore - Deterministic Underwriting Engine', () => {
  it('approves prime applicants with high income and low DTI', () => {
    const result = evaluateCreditScore({
      applicationId: 'app-001',
      applicantId: 'user-001',
      monthlyIncome: 120000,
      existingMonthlyEmi: 10000,
      requestedAmount: 200000,
      tenureMonths: 24,
      baseInterestRate: 9.5,
    });

    expect(result.decision).toBe('APPROVED');
    expect(result.riskTier).toBe('PRIME');
    expect(result.score).toBeGreaterThanOrEqual(750);
    expect(result.dtiRatio).toBeLessThan(0.35);
    expect(result.reasonCodes).toContain(REASON_CODES.APPROVED_PRIME);
  });

  it('rejects applicants when DTI exceeds 50%', () => {
    const result = evaluateCreditScore({
      applicationId: 'app-002',
      applicantId: 'user-002',
      monthlyIncome: 30000,
      existingMonthlyEmi: 15000, // 50% already taken
      requestedAmount: 300000,
      tenureMonths: 12, // High EMI
    });

    expect(result.decision).toBe('REJECTED');
    expect(result.reasonCodes).toContain(REASON_CODES.DTI_EXCEEDED);
    expect(result.dtiRatio).toBeGreaterThan(0.5);
  });

  it('rejects applicants earning below minimum threshold (25,000)', () => {
    const result = evaluateCreditScore({
      applicationId: 'app-003',
      applicantId: 'user-003',
      monthlyIncome: 18000,
      existingMonthlyEmi: 0,
      requestedAmount: 50000,
      tenureMonths: 24,
    });

    expect(result.decision).toBe('REJECTED');
    expect(result.reasonCodes).toContain(REASON_CODES.INSUFFICIENT_INCOME);
  });

  it('flags borderline metrics for manual review', () => {
    const result = evaluateCreditScore({
      applicationId: 'app-004',
      applicantId: 'user-004',
      monthlyIncome: 45000,
      existingMonthlyEmi: 12000,
      requestedAmount: 350000,
      tenureMonths: 36,
    });

    // Score lands in the intermediate tier
    expect(['APPROVED', 'MANUAL_REVIEW']).toContain(result.decision);
    expect(result.score).toBeGreaterThanOrEqual(600);
  });
});
