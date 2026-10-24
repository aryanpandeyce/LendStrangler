import { z } from 'zod';

export const CreateLoanRequestSchema = z.object({
  fullName: z.string().min(2, 'Full name must have at least 2 characters'),
  email: z.string().email('Invalid email address'),
  monthlyIncome: z.number().positive('Monthly income must be greater than zero'),
  existingMonthlyEmi: z.number().nonnegative('Existing EMI cannot be negative'),
  amount: z.number().positive('Requested amount must be positive'),
  tenureMonths: z.number().int().min(1).max(360, 'Tenure must be between 1 and 360 months'),
  purpose: z.enum([
    'HOME_IMPROVEMENT',
    'DEBT_CONSOLIDATION',
    'BUSINESS_EXPANSION',
    'EDUCATION',
    'PERSONAL',
  ]),
});

export type CreateLoanRequest = z.infer<typeof CreateLoanRequestSchema>;

export const CreditCheckApiRequestSchema = z.object({
  applicationId: z.string(),
  applicantId: z.string(),
  monthlyIncome: z.number().positive(),
  existingMonthlyEmi: z.number().nonnegative(),
  requestedAmount: z.number().positive(),
  tenureMonths: z.number().int().positive(),
  baseInterestRate: z.number().positive().optional(),
});

export type CreditCheckApiRequest = z.infer<typeof CreditCheckApiRequestSchema>;

export const DisbursementApiRequestSchema = z.object({
  applicationId: z.string(),
  amount: z.number().positive(),
  recipientAccount: z.string().min(6),
  forceFailure: z.boolean().optional(),
});

export type DisbursementApiRequest = z.infer<typeof DisbursementApiRequestSchema>;

export type RouteMode = 'LEGACY' | 'NEW' | 'SHADOW' | 'CANARY';

export const RouteRuleSchema = z.object({
  pathPattern: z.string(),
  mode: z.enum(['LEGACY', 'NEW', 'SHADOW', 'CANARY']),
  canaryWeightPercent: z.number().min(0).max(100).default(0),
  legacyTarget: z.string().url(),
  newTarget: z.string().url(),
  activeService: z.string(),
  description: z.string(),
});

export type RouteRule = z.infer<typeof RouteRuleSchema>;

export interface ShadowDiffRecord {
  id: string;
  timestamp: string;
  path: string;
  method: string;
  correlationId: string;
  isEqual: boolean;
  legacyStatus: number;
  newStatus: number;
  legacyLatencyMs: number;
  newLatencyMs: number;
  differences: Array<{
    field: string;
    legacyValue: unknown;
    newValue: unknown;
  }>;
}
