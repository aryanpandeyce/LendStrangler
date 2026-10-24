import { Database } from 'better-sqlite3';
import {
  CreditCheckApiRequest,
  CreditScoreResult,
  evaluateCreditScore,
  LoanSubmittedPayloadSchema,
} from '@lendstrangler/contracts';
import { IMessageBroker, MessageEnvelope } from '@lendstrangler/messaging';

export class CreditUnderwritingService {
  constructor(
    private db: Database,
    private broker?: IMessageBroker,
  ) {}

  public evaluateAndPersist(
    params: CreditCheckApiRequest,
    correlationId?: string,
  ): CreditScoreResult {
    const result = evaluateCreditScore(params);

    const evalId = `eval-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    this.db.prepare(`
      INSERT INTO credit_evaluations (
        id, application_id, applicant_id, score, decision, risk_tier, dti_ratio,
        max_approved_amount, recommended_rate, reason_codes, correlation_id, evaluated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      evalId,
      result.applicationId,
      result.applicantId,
      result.score,
      result.decision,
      result.riskTier,
      result.dtiRatio,
      result.maxApprovedAmount,
      result.recommendedInterestRate,
      JSON.stringify(result.reasonCodes),
      correlationId || null,
      result.evaluatedAt,
    );

    return result;
  }

  public getEvaluationByApplicationId(applicationId: string): CreditScoreResult | null {
    const row = this.db.prepare(`
      SELECT * FROM credit_evaluations WHERE application_id = ? ORDER BY evaluated_at DESC LIMIT 1
    `).get(applicationId) as {
      application_id: string;
      applicant_id: string;
      score: number;
      decision: CreditScoreResult['decision'];
      risk_tier: CreditScoreResult['riskTier'];
      dti_ratio: number;
      max_approved_amount: number;
      recommended_rate: number;
      reason_codes: string;
      evaluated_at: string;
    } | undefined;

    if (!row) return null;

    return {
      applicationId: row.application_id,
      applicantId: row.applicant_id,
      score: row.score,
      decision: row.decision,
      riskTier: row.risk_tier,
      dtiRatio: row.dti_ratio,
      maxApprovedAmount: row.max_approved_amount,
      recommendedInterestRate: row.recommended_rate,
      reasonCodes: JSON.parse(row.reason_codes),
      evaluatedAt: row.evaluated_at,
    };
  }

  /**
   * Idempotent Event Consumer: loan.submitted
   * Evaluates credit deterministically and publishes credit.checked event
   */
  public async handleLoanSubmittedEvent(envelope: MessageEnvelope<unknown>): Promise<void> {
    const checkStmt = this.db.prepare('SELECT message_id FROM processed_messages WHERE message_id = ?');
    const existing = checkStmt.get(envelope.id);
    if (existing) {
      // Idempotent duplicate: already processed
      return;
    }

    const parsed = LoanSubmittedPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) {
      console.error('[CreditService] Invalid payload for loan.submitted event:', parsed.error);
      return;
    }

    const payload = parsed.data;
    const result = this.evaluateAndPersist(
      {
        applicationId: payload.applicationId,
        applicantId: payload.applicant.id,
        monthlyIncome: payload.applicant.monthlyIncome,
        existingMonthlyEmi: payload.applicant.existingMonthlyEmi,
        requestedAmount: payload.amount,
        tenureMonths: payload.tenureMonths,
      },
      envelope.correlationId,
    );

    // Record idempotency
    this.db.prepare('INSERT INTO processed_messages (message_id, processed_at) VALUES (?, ?)').run(
      envelope.id,
      new Date().toISOString(),
    );

    // Emit credit.checked event onto broker
    if (this.broker) {
      await this.broker.publish(
        'credit.checked',
        {
          applicationId: result.applicationId,
          applicantId: result.applicantId,
          score: result.score,
          decision: result.decision,
          riskTier: result.riskTier,
          dtiRatio: result.dtiRatio,
          recommendedInterestRate: result.recommendedInterestRate,
          reasonCodes: result.reasonCodes,
        },
        {
          correlationId: envelope.correlationId,
          causationId: envelope.id,
        },
      );
    }
  }
}
