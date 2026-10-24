import { describe, it, expect } from 'vitest';
import { calculateEMI } from './emi.js';

describe('calculateEMI - Reducing-Balance Formula', () => {
  it('calculates accurate monthly EMI for standard loan values', () => {
    // Principal: 100,000, 10% annual interest, 12 months
    // Standard banking calculation: E = 100000 * (0.10/12) * (1 + 0.10/12)^12 / ((1 + 0.10/12)^12 - 1)
    // EMI = ~8791.59
    const result = calculateEMI(100000, 10, 12);
    expect(result.monthlyEmi).toBe(8791.59);
    expect(result.principalAmount).toBe(100000);
    expect(result.tenureMonths).toBe(12);
    expect(result.totalPayment).toBeGreaterThan(100000);
    expect(result.totalInterestPayable).toBeCloseTo(5499.08, 0);
  });

  it('handles 0% interest rate correctly (straight line division)', () => {
    const result = calculateEMI(120000, 0, 12, true);
    expect(result.monthlyEmi).toBe(10000);
    expect(result.totalInterestPayable).toBe(0);
    expect(result.totalPayment).toBe(120000);
    expect(result.amortizationSchedule).toBeDefined();
    expect(result.amortizationSchedule?.length).toBe(12);
    expect(result.amortizationSchedule?.[11].closingBalance).toBe(0);
  });

  it('generates accurate amortization schedule where closing balance is zero', () => {
    const result = calculateEMI(50000, 12, 6, true);
    expect(result.amortizationSchedule).toBeDefined();
    expect(result.amortizationSchedule?.length).toBe(6);

    const schedule = result.amortizationSchedule!;
    expect(schedule[0].openingBalance).toBe(50000);
    expect(schedule[5].closingBalance).toBe(0);

    // Sum of principal components should equal total principal
    const sumPrincipal = schedule.reduce((sum, item) => sum + item.principalComponent, 0);
    expect(sumPrincipal).toBeCloseTo(50000, 0);
  });

  it('throws validation error on invalid input parameters', () => {
    expect(() => calculateEMI(-1000, 10, 12)).toThrowError(/Principal/);
    expect(() => calculateEMI(1000, -5, 12)).toThrowError(/Annual interest rate/);
    expect(() => calculateEMI(1000, 10, 0)).toThrowError(/Tenure/);
    expect(() => calculateEMI(1000, 10, 12.5)).toThrowError(/positive integer/);
  });
});
