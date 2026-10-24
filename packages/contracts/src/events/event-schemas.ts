import { z } from 'zod';

export const EventMetadataSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  timestamp: z.string().datetime(),
  correlationId: z.string(),
  causationId: z.string().optional(),
  version: z.number().int().positive().default(1),
  source: z.string(),
});

export type EventMetadata = z.infer<typeof EventMetadataSchema>;

// Payload Schemas
export const LoanSubmittedPayloadSchema = z.object({
  applicationId: z.string(),
  applicant: z.object({
    id: z.string(),
    fullName: z.string(),
    email: z.string().email(),
    monthlyIncome: z.number().positive(),
    existingMonthlyEmi: z.number().nonnegative(),
  }),
  amount: z.number().positive(),
  tenureMonths: z.number().int().positive(),
  purpose: z.enum([
    'HOME_IMPROVEMENT',
    'DEBT_CONSOLIDATION',
    'BUSINESS_EXPANSION',
    'EDUCATION',
    'PERSONAL',
  ]),
});

export const CreditCheckedPayloadSchema = z.object({
  applicationId: z.string(),
  applicantId: z.string(),
  score: z.number().min(300).max(900),
  decision: z.enum(['APPROVED', 'REJECTED', 'MANUAL_REVIEW']),
  riskTier: z.enum(['PRIME', 'STANDARD', 'SUBPRIME']),
  dtiRatio: z.number().nonnegative(),
  recommendedInterestRate: z.number().positive(),
  reasonCodes: z.array(z.string()),
});

export const LoanApprovedPayloadSchema = z.object({
  applicationId: z.string(),
  applicantId: z.string(),
  amount: z.number().positive(),
  tenureMonths: z.number().int().positive(),
  interestRateAnnual: z.number().positive(),
  monthlyEmi: z.number().positive(),
  recipientAccount: z.string(),
});

export const LoanRejectedPayloadSchema = z.object({
  applicationId: z.string(),
  applicantId: z.string(),
  reasonCodes: z.array(z.string()),
  score: z.number(),
});

export const DisbursementRequestedPayloadSchema = z.object({
  disbursementId: z.string(),
  applicationId: z.string(),
  amount: z.number().positive(),
  recipientAccount: z.string(),
});

export const DisbursementCompletedPayloadSchema = z.object({
  disbursementId: z.string(),
  applicationId: z.string(),
  amount: z.number().positive(),
  bankTransferReference: z.string(),
  ledgerEntryId: z.string(),
});

export const DisbursementFailedPayloadSchema = z.object({
  disbursementId: z.string(),
  applicationId: z.string(),
  amount: z.number().positive(),
  reason: z.string(),
  retryCount: z.number().int().nonnegative(),
  sentToDlq: z.boolean(),
});

// Full Envelope Schema Generic Generator
export function createDomainEventSchema<T extends z.ZodTypeAny>(name: string, payloadSchema: T) {
  return EventMetadataSchema.extend({
    name: z.literal(name),
    payload: payloadSchema,
  });
}

export const LoanSubmittedEventSchema = createDomainEventSchema('loan.submitted', LoanSubmittedPayloadSchema);
export const CreditCheckedEventSchema = createDomainEventSchema('credit.checked', CreditCheckedPayloadSchema);
export const LoanApprovedEventSchema = createDomainEventSchema('loan.approved', LoanApprovedPayloadSchema);
export const LoanRejectedEventSchema = createDomainEventSchema('loan.rejected', LoanRejectedPayloadSchema);
export const DisbursementRequestedEventSchema = createDomainEventSchema('disbursement.requested', DisbursementRequestedPayloadSchema);
export const DisbursementCompletedEventSchema = createDomainEventSchema('disbursement.completed', DisbursementCompletedPayloadSchema);
export const DisbursementFailedEventSchema = createDomainEventSchema('disbursement.failed', DisbursementFailedPayloadSchema);

export type LoanSubmittedEvent = z.infer<typeof LoanSubmittedEventSchema>;
export type CreditCheckedEvent = z.infer<typeof CreditCheckedEventSchema>;
export type LoanApprovedEvent = z.infer<typeof LoanApprovedEventSchema>;
export type LoanRejectedEvent = z.infer<typeof LoanRejectedEventSchema>;
export type DisbursementRequestedEvent = z.infer<typeof DisbursementRequestedEventSchema>;
export type DisbursementCompletedEvent = z.infer<typeof DisbursementCompletedEventSchema>;
export type DisbursementFailedEvent = z.infer<typeof DisbursementFailedEventSchema>;

export type DomainEvent =
  | LoanSubmittedEvent
  | CreditCheckedEvent
  | LoanApprovedEvent
  | LoanRejectedEvent
  | DisbursementRequestedEvent
  | DisbursementCompletedEvent
  | DisbursementFailedEvent;
