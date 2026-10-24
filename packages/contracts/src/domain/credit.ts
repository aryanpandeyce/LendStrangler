import { CreditDecision, CreditScoreResult, RiskTier } from './types.js';
import { calculateEMI } from './emi.js';

export interface CreditEvaluationParams {
  applicationId: string;
  applicantId: string;
  monthlyIncome: number;
  existingMonthlyEmi: number;
  requestedAmount: number;
  tenureMonths: number;
  baseInterestRate?: number;
}

export const REASON_CODES = {
  INSUFFICIENT_INCOME: 'INSUFFICIENT_MINIMUM_INCOME_BELOW_25000',
  DTI_EXCEEDED: 'DTI_RATIO_EXCEEDS_MAXIMUM_THRESHOLD_50_PERCENT',
  CREDIT_SCORE_LOW: 'CREDIT_SCORE_BELOW_MINIMUM_APPROVAL_650',
  MAX_LOAN_TO_INCOME_EXCEEDED: 'REQUESTED_AMOUNT_EXCEEDS_INCOME_MULTIPLIER',
  APPROVED_PRIME: 'APPROVED_PRIME_TIER_OPTIMAL_METRICS',
  APPROVED_STANDARD: 'APPROVED_STANDARD_TIER_ACCEPTABLE_RISK',
  MANUAL_REVIEW_BORDERLINE: 'MANUAL_REVIEW_BORDERLINE_METRICS',
} as const;

/**
 * Deterministic credit scoring engine based on corporate lending heuristics.
 * Evaluates Debt-To-Income (DTI), score thresholds (300 - 900), and affordability.
 */
export function evaluateCreditScore(params: CreditEvaluationParams): CreditScoreResult {
  const {
    applicationId,
    applicantId,
    monthlyIncome,
    existingMonthlyEmi,
    requestedAmount,
    tenureMonths,
    baseInterestRate = 10.5,
  } = params;

  const reasonCodes: string[] = [];

  // Minimum income check (e.g., 25,000 threshold)
  if (monthlyIncome < 25000) {
    reasonCodes.push(REASON_CODES.INSUFFICIENT_INCOME);
  }

  // Calculate new proposed EMI
  const { monthlyEmi: proposedEmi } = calculateEMI(
    requestedAmount,
    baseInterestRate,
    tenureMonths,
  );

  const totalMonthlyDebtObligation = existingMonthlyEmi + proposedEmi;
  const dtiRatio = monthlyIncome > 0 ? totalMonthlyDebtObligation / monthlyIncome : 1.0;
  const roundedDti = Math.round(dtiRatio * 1000) / 1000;

  if (roundedDti > 0.5) {
    reasonCodes.push(REASON_CODES.DTI_EXCEEDED);
  }

  // Maximum loan cap: 24x monthly income
  const maxApprovedAmount = Math.max(0, Math.floor(monthlyIncome * 24));
  if (requestedAmount > maxApprovedAmount) {
    reasonCodes.push(REASON_CODES.MAX_LOAN_TO_INCOME_EXCEEDED);
  }

  // Deterministic Base Score Calculation (300 to 900)
  // Higher income and lower DTI yields a higher score
  let score = 750;

  // DTI impact
  if (roundedDti <= 0.25) {
    score += 50;
  } else if (roundedDti <= 0.40) {
    score += 10;
  } else if (roundedDti <= 0.50) {
    score -= 40;
  } else {
    score -= 150;
  }

  // Income tier impact
  if (monthlyIncome >= 100000) {
    score += 60;
  } else if (monthlyIncome >= 50000) {
    score += 20;
  } else if (monthlyIncome < 25000) {
    score -= 120;
  }

  // Requested loan size vs income ratio
  const loanToIncomeRatio = requestedAmount / (monthlyIncome * 12);
  if (loanToIncomeRatio > 2.0) {
    score -= 50;
  }

  // Clamp score strictly to [300, 900]
  score = Math.max(300, Math.min(900, Math.round(score)));

  let decision: CreditDecision = 'APPROVED';
  let riskTier: RiskTier = 'STANDARD';
  let recommendedInterestRate = baseInterestRate;

  if (score < 600 || roundedDti > 0.55 || monthlyIncome < 25000) {
    decision = 'REJECTED';
    riskTier = 'SUBPRIME';
    if (score < 650 && !reasonCodes.includes(REASON_CODES.CREDIT_SCORE_LOW)) {
      reasonCodes.push(REASON_CODES.CREDIT_SCORE_LOW);
    }
  } else if (score < 670 || roundedDti > 0.45) {
    decision = 'MANUAL_REVIEW';
    riskTier = 'STANDARD';
    recommendedInterestRate = baseInterestRate + 2.0;
    reasonCodes.push(REASON_CODES.MANUAL_REVIEW_BORDERLINE);
  } else if (score >= 760 && roundedDti <= 0.35) {
    decision = 'APPROVED';
    riskTier = 'PRIME';
    recommendedInterestRate = Math.max(7.5, baseInterestRate - 1.5);
    reasonCodes.push(REASON_CODES.APPROVED_PRIME);
  } else {
    decision = 'APPROVED';
    riskTier = 'STANDARD';
    reasonCodes.push(REASON_CODES.APPROVED_STANDARD);
  }

  return {
    applicationId,
    applicantId,
    score,
    decision,
    riskTier,
    dtiRatio: roundedDti,
    maxApprovedAmount,
    recommendedInterestRate,
    reasonCodes,
    evaluatedAt: new Date().toISOString(),
  };
}
