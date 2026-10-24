import { Database } from 'better-sqlite3';
import {
  calculateEMI,
  CreateLoanRequest,
  CreditCheckedPayloadSchema,
  DisbursementCompletedPayloadSchema,
  DisbursementFailedPayloadSchema,
  LoanApplication,
} from '@lendstrangler/contracts';
import { IMessageBroker, MessageEnvelope } from '@lendstrangler/messaging';

export class LoanOrchestratorService {
  constructor(
    private db: Database,
    private broker?: IMessageBroker,
  ) {}

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
    const r = this.db.prepare('SELECT * FROM applications WHERE id = ?').get(id) as {
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

    if (!r) return null;

    return {
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
    };
  }

  /**
   * SAGA INITIATION: Submit Loan Application
   * Creates application in SUBMITTED status and persists loan.submitted to outbox
   */
  public submitLoanApplication(
    req: CreateLoanRequest,
    correlationId?: string,
  ): LoanApplication {
    const applicationId = `app-srv-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const applicantId = `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const baseInterestRate = 10.5;
    const { monthlyEmi } = calculateEMI(req.amount, baseInterestRate, req.tenureMonths);

    const now = new Date().toISOString();
    const corrId = correlationId || `corr-loan-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const outboxId = `outbox-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const loanSubmittedPayload = {
      applicationId,
      applicant: {
        id: applicantId,
        fullName: req.fullName,
        email: req.email,
        monthlyIncome: req.monthlyIncome,
        existingMonthlyEmi: req.existingMonthlyEmi,
      },
      amount: req.amount,
      tenureMonths: req.tenureMonths,
      purpose: req.purpose,
    };

    const transaction = this.db.transaction(() => {
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

      this.db.prepare(`
        INSERT INTO outbox_messages (
          id, topic, payload, correlation_id, status, created_at
        ) VALUES (?, 'loan.submitted', ?, ?, 'PENDING', ?)
      `).run(
        outboxId,
        JSON.stringify(loanSubmittedPayload),
        corrId,
        now,
      );
    });

    transaction();

    if (this.broker) {
      setImmediate(() => {
        this.flushOutbox().catch((err) =>
          console.error('[LoanService] Error flushing outbox:', err),
        );
      });
    }

    return this.getLoanById(applicationId)!;
  }

  /**
   * SAGA STEP 2: CreditChecked Handler
   */
  public async handleCreditCheckedEvent(envelope: MessageEnvelope<unknown>): Promise<void> {
    const existing = this.db.prepare('SELECT message_id FROM processed_messages WHERE message_id = ?').get(envelope.id);
    if (existing) return;

    const parsed = CreditCheckedPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) return;

    const payload = parsed.data;
    const loan = this.getLoanById(payload.applicationId);
    if (!loan) return;

    const now = new Date().toISOString();
    const outboxId = `outbox-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const transaction = this.db.transaction(() => {
      if (payload.decision === 'APPROVED') {
        const { monthlyEmi } = calculateEMI(loan.amount, payload.recommendedInterestRate, loan.tenureMonths);

        this.db.prepare(`
          UPDATE applications
          SET status = 'APPROVED', credit_score = ?, interest_rate = ?, monthly_emi = ?, updated_at = ?
          WHERE id = ?
        `).run(payload.score, payload.recommendedInterestRate, monthlyEmi, now, loan.id);

        const approvedPayload = {
          applicationId: loan.id,
          applicantId: payload.applicantId,
          amount: loan.amount,
          tenureMonths: loan.tenureMonths,
          interestRateAnnual: payload.recommendedInterestRate,
          monthlyEmi,
          recipientAccount: `ACC-${payload.applicantId.substring(4)}-01`,
        };

        this.db.prepare(`
          INSERT INTO outbox_messages (id, topic, payload, correlation_id, causation_id, status, created_at)
          VALUES (?, 'loan.approved', ?, ?, ?, 'PENDING', ?)
        `).run(
          outboxId,
          JSON.stringify(approvedPayload),
          envelope.correlationId,
          envelope.id,
          now,
        );
      } else {
        const rejectionReason = payload.reasonCodes.join(', ');
        this.db.prepare(`
          UPDATE applications
          SET status = 'REJECTED', credit_score = ?, rejection_reason = ?, updated_at = ?
          WHERE id = ?
        `).run(payload.score, rejectionReason, now, loan.id);

        const rejectedPayload = {
          applicationId: loan.id,
          applicantId: payload.applicantId,
          reasonCodes: payload.reasonCodes,
          score: payload.score,
        };

        this.db.prepare(`
          INSERT INTO outbox_messages (id, topic, payload, correlation_id, causation_id, status, created_at)
          VALUES (?, 'loan.rejected', ?, ?, ?, 'PENDING', ?)
        `).run(
          outboxId,
          JSON.stringify(rejectedPayload),
          envelope.correlationId,
          envelope.id,
          now,
        );
      }

      this.db.prepare('INSERT INTO processed_messages (message_id, processed_at) VALUES (?, ?)').run(
        envelope.id,
        now,
      );
    });

    transaction();

    if (this.broker) {
      setImmediate(() => {
        this.flushOutbox().catch(console.error);
      });
    }
  }

  /**
   * SAGA STEP 3: DisbursementCompleted Handler
   */
  public async handleDisbursementCompletedEvent(envelope: MessageEnvelope<unknown>): Promise<void> {
    const existing = this.db.prepare('SELECT message_id FROM processed_messages WHERE message_id = ?').get(envelope.id);
    if (existing) return;

    const parsed = DisbursementCompletedPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) return;

    const payload = parsed.data;
    const now = new Date().toISOString();

    const transaction = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE applications
        SET status = 'DISBURSED', disbursement_ref = ?, updated_at = ?
        WHERE id = ?
      `).run(payload.bankTransferReference, now, payload.applicationId);

      this.db.prepare('INSERT INTO processed_messages (message_id, processed_at) VALUES (?, ?)').run(
        envelope.id,
        now,
      );
    });

    transaction();
  }

  /**
   * SAGA COMPENSATION: DisbursementFailed Handler
   */
  public async handleDisbursementFailedEvent(envelope: MessageEnvelope<unknown>): Promise<void> {
    const existing = this.db.prepare('SELECT message_id FROM processed_messages WHERE message_id = ?').get(envelope.id);
    if (existing) return;

    const parsed = DisbursementFailedPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) return;

    const payload = parsed.data;
    const now = new Date().toISOString();

    const transaction = this.db.transaction(() => {
      this.db.prepare(`
        UPDATE applications
        SET status = 'FAILED', rejection_reason = ?, updated_at = ?
        WHERE id = ?
      `).run(`Disbursement Failed: ${payload.reason}`, now, payload.applicationId);

      this.db.prepare('INSERT INTO processed_messages (message_id, processed_at) VALUES (?, ?)').run(
        envelope.id,
        now,
      );
    });

    transaction();
  }

  /**
   * Outbox Relay Processor
   */
  public async flushOutbox(): Promise<number> {
    if (!this.broker) return 0;

    const pending = this.db.prepare(`
      SELECT * FROM outbox_messages WHERE status = 'PENDING' ORDER BY created_at ASC
    `).all() as Array<{
      id: string;
      topic: string;
      payload: string;
      correlation_id: string;
      causation_id: string | null;
    }>;

    let count = 0;
    for (const msg of pending) {
      try {
        const payload = JSON.parse(msg.payload);
        await this.broker.publish(msg.topic, payload, {
          correlationId: msg.correlation_id,
          causationId: msg.causation_id || undefined,
        });

        this.db.prepare(`
          UPDATE outbox_messages
          SET status = 'PUBLISHED', published_at = ?
          WHERE id = ?
        `).run(new Date().toISOString(), msg.id);

        count++;
      } catch (err) {
        console.error(`[LoanService] Failed to publish outbox msg ${msg.id}:`, err);
      }
    }

    return count;
  }
}
