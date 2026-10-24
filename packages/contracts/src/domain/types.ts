export type LoanStatus =
  | 'SUBMITTED'
  | 'CREDIT_CHECKING'
  | 'APPROVED'
  | 'REJECTED'
  | 'DISBURSING'
  | 'DISBURSED'
  | 'FAILED';

export type CreditDecision = 'APPROVED' | 'REJECTED' | 'MANUAL_REVIEW';

export type RiskTier = 'PRIME' | 'STANDARD' | 'SUBPRIME';

export type DisbursementStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export type LoanPurpose =
  | 'HOME_IMPROVEMENT'
  | 'DEBT_CONSOLIDATION'
  | 'BUSINESS_EXPANSION'
  | 'EDUCATION'
  | 'PERSONAL';

export interface ApplicantInfo {
  id: string;
  fullName: string;
  email: string;
  monthlyIncome: number;
  existingMonthlyEmi: number;
}

export interface LoanApplication {
  id: string;
  applicant: ApplicantInfo;
  amount: number;
  tenureMonths: number;
  interestRateAnnual: number;
  monthlyEmi: number;
  purpose: LoanPurpose;
  status: LoanStatus;
  creditScore?: number;
  rejectionReason?: string;
  disbursementReference?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreditScoreResult {
  applicationId: string;
  applicantId: string;
  score: number;
  decision: CreditDecision;
  riskTier: RiskTier;
  dtiRatio: number;
  maxApprovedAmount: number;
  recommendedInterestRate: number;
  reasonCodes: string[];
  evaluatedAt: string;
}

export interface DisbursementRecord {
  id: string;
  applicationId: string;
  amount: number;
  recipientAccount: string;
  bankTransferReference: string;
  status: DisbursementStatus;
  retryCount: number;
  failureReason?: string;
  ledgerEntryId: string;
  createdAt: string;
  updatedAt: string;
}
