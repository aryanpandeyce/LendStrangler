import { Database } from 'better-sqlite3';
import {
  calculateEMI,
  CreateLoanRequest,
  CreditCheckApiRequest,
  DisbursementApiRequest,
  evaluateCreditScore,
  LoanApplication,
  CreditScoreResult,
  DisbursementRecord,
} from '@lendstrangler/contracts';

/**
 * Deliberate Architectural Anti-Pattern: Monolithic "God Service"
 *
 * Hallmarks of Legacy Architecture:
 * 1. Monolithic Chaining: Cascading synchronous operations inside a single HTTP request.
 * 2. Shared Database Access: Directly writes across Loan, Credit, and Disbursement tables.
 * 3. High Latency & Cascading Failures: Any failure in the external payment gateway immediately
 *    blocks and potentially fails the entire loan creation transaction.
 */
export class MonolithGodService {
  constructor(private db: Database) {}

  public getAllLoans(): LoanApplication[] {
    const rows = this.db.prepare('SELECT * FROM applications ORDER BY created_at DESC').all() as Array<{
      id: string;
      applicant_id: string;
      applicant_name: string;
      applicant_email: string;
      applicant_income: number;
      existing_emi: number;
      amount: number;
      tenure_months: number;
      interest_rate: number;
      monthly_emi: number;
      purpose: LoanApplication['purpose'];
      status: LoanApplication['status'];
      credit_score: number | null;
      rejection_reason: string | null;
      disbursement_ref: string | null;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map((r) => ({
      id: r.id,
      applicant: {
        id: r.applicant_id,
        fullName: r.applicant_name,
        email: r.applicant_email,
        monthlyIncome: r.applicant_income,
        existingMonthlyEmi: r.existing_emi,
      },
      amount: r.amount,
      tenureMonths: r.tenure_months,
      interestRateAnnual: r.interest_rate,
      monthlyEmi: r.monthly_emi,
      purpose: r.purpose,
      status: r.status,
      creditScore: r.credit_score ?? undefined,
      rejectionReason: r.rejection_reason ?? undefined,
      disbursementReference: r.disbursement_ref ?? undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  public getLoanById(id: string): LoanApplication | null {
    const row = this.db.prepare('SELECT * FROM applications WHERE id = ?').get(id) as {
      id: string;
      applicant_id: string;
      applicant_name: string;
      applicant_email: string;
      applicant_income: number;
      existing_emi: number;
      amount: number;
      tenure_months: number;
      interest_rate: number;
      monthly_emi: number;
      purpose: LoanApplication['purpose'];
      status: LoanApplication['status'];
      credit_score: number | null;
      rejection_reason: string | null;
      disbursement_ref: string | null;
      created_at: string;
      updated_at: string;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      applicant: {
        id: row.applicant_id,
        fullName: row.applicant_name,
        email: row.applicant_email,
        monthlyIncome: row.applicant_income,
        existingMonthlyEmi: row.existing_emi,
      },
      amount: row.amount,
      tenureMonths: row.tenure_months,
      interestRateAnnual: row.interest_rate,
      monthlyEmi: row.monthly_emi,
      purpose: row.purpose,
      status: row.status,
      creditScore: row.credit_score ?? undefined,
      rejectionReason: row.rejection_reason ?? undefined,
      disbursementReference: row.disbursement_ref ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * LEGACY TIGHTLY-COUPLED SYNCHRONOUS CHAIN:
   * Submit -> Evaluate Credit -> Execute Bank Disbursement
   */
  public applyLoanSynchronously(
    req: CreateLoanRequest,
    options?: { forceDisbursementFailure?: boolean; correlationId?: string },
  ): LoanApplication {
    const applicationId = `app-leg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const applicantId = `usr-${Date.now()}`;
    const baseInterestRate = 10.5;
    const { monthlyEmi } = calculateEMI(req.amount, baseInterestRate, req.tenureMonths);

    const now = new Date().toISOString();

    // 1. Insert Initial Application
    this.db.prepare(`
      INSERT INTO applications (
        id, applicant_id, applicant_name, applicant_email, applicant_income, existing_emi,
        amount, tenure_months, interest_rate, monthly_emi, purpose, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', ?, ?)
    `).run(
      applicationId,
      applicantId,
      req.fullName,
      req.email,
      req.monthlyIncome,
      req.existingMonthlyEmi,
      req.amount,
      req.tenureMonths,
      baseInterestRate,
      monthlyEmi,
      req.purpose,
      now,
      now,
    );

    // 2. Synchronous Credit Scoring
    const creditResult = this.evaluateCreditSynchronously({
      applicationId,
      applicantId,
      monthlyIncome: req.monthlyIncome,
      existingMonthlyEmi: req.existingMonthlyEmi,
      requestedAmount: req.amount,
      tenureMonths: req.tenureMonths,
      baseInterestRate,
    });

    if (creditResult.decision === 'REJECTED') {
      const rejectionReason = creditResult.reasonCodes.join(', ');
      this.db.prepare(`
        UPDATE applications
        SET status = 'REJECTED', credit_score = ?, rejection_reason = ?, updated_at = ?
        WHERE id = ?
      `).run(creditResult.score, rejectionReason, new Date().toISOString(), applicationId);

      return this.getLoanById(applicationId)!;
    }

    // Update with approved credit score
    this.db.prepare(`
      UPDATE applications
      SET status = 'APPROVED', credit_score = ?, interest_rate = ?, updated_at = ?
      WHERE id = ?
    `).run(creditResult.score, creditResult.recommendedInterestRate, new Date().toISOString(), applicationId);

    // 3. Synchronous Bank Disbursement Transfer
    const recipientAccount = `ACC-${applicantId.substring(4)}-01`;
    const disbResult = this.disburseSynchronously({
      applicationId,
      amount: req.amount,
      recipientAccount,
      forceFailure: options?.forceDisbursementFailure,
    });

    if (disbResult.status === 'FAILED') {
      this.db.prepare(`
        UPDATE applications
        SET status = 'FAILED', rejection_reason = ?, updated_at = ?
        WHERE id = ?
      `).run(disbResult.failureReason || 'Disbursement Failed', new Date().toISOString(), applicationId);
    } else {
      this.db.prepare(`
        UPDATE applications
        SET status = 'DISBURSED', disbursement_ref = ?, updated_at = ?
        WHERE id = ?
      `).run(disbResult.bankTransferReference, new Date().toISOString(), applicationId);
    }

    return this.getLoanById(applicationId)!;
  }

  public evaluateCreditSynchronously(req: CreditCheckApiRequest): CreditScoreResult {
    const evaluation = evaluateCreditScore({
      applicationId: req.applicationId,
      applicantId: req.applicantId,
      monthlyIncome: req.monthlyIncome,
      existingMonthlyEmi: req.existingMonthlyEmi,
      requestedAmount: req.requestedAmount,
      tenureMonths: req.tenureMonths,
      baseInterestRate: req.baseInterestRate,
    });

    const evalId = `eval-${Date.now()}`;
    this.db.prepare(`
      INSERT INTO credit_evaluations (
        id, application_id, applicant_id, score, decision, risk_tier, dti_ratio,
        reason_codes, evaluated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      evalId,
      evaluation.applicationId,
      evaluation.applicantId,
      evaluation.score,
      evaluation.decision,
      evaluation.riskTier,
      evaluation.dtiRatio,
      JSON.stringify(evaluation.reasonCodes),
      evaluation.evaluatedAt,
    );

    return evaluation;
  }

  public disburseSynchronously(req: DisbursementApiRequest): DisbursementRecord {
    const disbId = `disb-${Date.now()}`;
    const ledgerEntryId = `ledg-${Date.now()}`;
    const now = new Date().toISOString();

    // Check chaos/failure trigger
    const shouldFail =
      req.forceFailure ||
      (process.env.DISBURSEMENT_CHAOS_FAILURE_RATE &&
        Math.random() < parseFloat(process.env.DISBURSEMENT_CHAOS_FAILURE_RATE));

    if (shouldFail) {
      const failedRecord: DisbursementRecord = {
        id: disbId,
        applicationId: req.applicationId,
        amount: req.amount,
        recipientAccount: req.recipientAccount,
        bankTransferReference: '',
        status: 'FAILED',
        retryCount: 0,
        failureReason: 'GATEWAY_TIMEOUT_TRANSFER_ABORTED',
        ledgerEntryId,
        createdAt: now,
        updatedAt: now,
      };

      this.db.prepare(`
        INSERT INTO disbursements (
          id, application_id, amount, recipient_account, bank_reference,
          status, failure_reason, ledger_entry_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        failedRecord.id,
        failedRecord.applicationId,
        failedRecord.amount,
        failedRecord.recipientAccount,
        failedRecord.bankTransferReference,
        failedRecord.status,
        failedRecord.failureReason,
        failedRecord.ledgerEntryId,
        failedRecord.createdAt,
        failedRecord.updatedAt,
      );

      return failedRecord;
    }

    const successRecord: DisbursementRecord = {
      id: disbId,
      applicationId: req.applicationId,
      amount: req.amount,
      recipientAccount: req.recipientAccount,
      bankTransferReference: `TXN-BANK-${Date.now()}`,
      status: 'SUCCESS',
      retryCount: 0,
      ledgerEntryId,
      createdAt: now,
      updatedAt: now,
    };

    this.db.prepare(`
      INSERT INTO disbursements (
        id, application_id, amount, recipient_account, bank_reference,
        status, failure_reason, ledger_entry_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
    `).run(
      successRecord.id,
      successRecord.applicationId,
      successRecord.amount,
      successRecord.recipientAccount,
      successRecord.bankTransferReference,
      successRecord.status,
      successRecord.ledgerEntryId,
      successRecord.createdAt,
      successRecord.updatedAt,
    );

    return successRecord;
  }
}
