import { Database } from 'better-sqlite3';
import {
  DisbursementApiRequest,
  DisbursementRecord,
  LoanApprovedPayloadSchema,
} from '@lendstrangler/contracts';
import { IMessageBroker, MessageEnvelope } from '@lendstrangler/messaging';

export class DisbursementLedgerService {
  private chaosRate = parseFloat(process.env.DISBURSEMENT_CHAOS_FAILURE_RATE || '0.0');

  constructor(
    private db: Database,
    private broker?: IMessageBroker,
  ) {}

  public setChaosRate(rate: number) {
    this.chaosRate = Math.max(0, Math.min(1, rate));
  }

  public getChaosRate(): number {
    return this.chaosRate;
  }

  /**
   * TRANSACTIONAL OUTBOX PATTERN:
   * Ledger entry creation + Outbox event persistence in a single ACID transaction.
   */
  public executeDisbursementWithOutbox(
    req: DisbursementApiRequest,
    metadata?: { correlationId?: string; causationId?: string; incomingMessageId?: string },
  ): DisbursementRecord {
    const disbId = `disb-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const ledgerEntryId = `ledg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const correlationId =
      metadata?.correlationId ||
      `corr-disb-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Evaluate simulated bank transfer failure
    const shouldFail =
      req.forceFailure || (this.chaosRate > 0 && Math.random() < this.chaosRate);

    let record: DisbursementRecord;
    let outboxEvent: { topic: string; payload: unknown };

    if (shouldFail) {
      record = {
        id: disbId,
        applicationId: req.applicationId,
        amount: req.amount,
        recipientAccount: req.recipientAccount,
        bankTransferReference: '',
        status: 'FAILED',
        retryCount: 0,
        failureReason: 'PAYMENT_RAILS_NETWORK_TIMEOUT',
        ledgerEntryId,
        createdAt: now,
        updatedAt: now,
      };

      // Compensation Event: tells Loan Service to mark loan as FAILED
      outboxEvent = {
        topic: 'disbursement.failed',
        payload: {
          disbursementId: disbId,
          applicationId: req.applicationId,
          amount: req.amount,
          reason: 'PAYMENT_RAILS_NETWORK_TIMEOUT',
          retryCount: 0,
          sentToDlq: false,
        },
      };
    } else {
      record = {
        id: disbId,
        applicationId: req.applicationId,
        amount: req.amount,
        recipientAccount: req.recipientAccount,
        bankTransferReference: `TXN-ACH-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`,
        status: 'SUCCESS',
        retryCount: 0,
        ledgerEntryId,
        createdAt: now,
        updatedAt: now,
      };

      outboxEvent = {
        topic: 'disbursement.completed',
        payload: {
          disbursementId: disbId,
          applicationId: req.applicationId,
          amount: req.amount,
          bankTransferReference: record.bankTransferReference,
          ledgerEntryId,
        },
      };
    }

    const outboxId = `outbox-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    // Local SQLite ACID Transaction
    const transaction = this.db.transaction(() => {
      // 1. Insert Disbursement Record
      this.db.prepare(`
        INSERT INTO disbursements (
          id, application_id, amount, recipient_account, bank_reference,
          status, failure_reason, retry_count, ledger_entry_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        record.id,
        record.applicationId,
        record.amount,
        record.recipientAccount,
        record.bankTransferReference,
        record.status,
        record.failureReason || null,
        record.retryCount,
        record.ledgerEntryId,
        record.createdAt,
        record.updatedAt,
      );

      // 2. Insert into Transactional Outbox
      this.db.prepare(`
        INSERT INTO outbox_messages (
          id, topic, payload, correlation_id, causation_id, status, created_at
        ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?)
      `).run(
        outboxId,
        outboxEvent.topic,
        JSON.stringify(outboxEvent.payload),
        correlationId,
        metadata?.causationId || null,
        now,
      );

      // 3. Record idempotency if an incoming message triggered this
      if (metadata?.incomingMessageId) {
        this.db.prepare(`
          INSERT INTO processed_messages (message_id, processed_at) VALUES (?, ?)
        `).run(metadata.incomingMessageId, now);
      }
    });

    transaction();

    // Trigger asynchronous relay of pending outbox messages
    if (this.broker) {
      setImmediate(() => {
        this.flushOutbox().catch((err) =>
          console.error('[DisbursementService] Error in outbox relay:', err),
        );
      });
    }

    return record;
  }

  /**
   * OUTBOX RELAY PROCESSOR:
   * Reads pending messages from the outbox and publishes them to the message broker.
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

    let publishedCount = 0;
    for (const msg of pending) {
      try {
        const parsedPayload = JSON.parse(msg.payload);
        await this.broker.publish(msg.topic, parsedPayload, {
          correlationId: msg.correlation_id,
          causationId: msg.causation_id || undefined,
        });

        this.db.prepare(`
          UPDATE outbox_messages
          SET status = 'PUBLISHED', published_at = ?
          WHERE id = ?
        `).run(new Date().toISOString(), msg.id);

        publishedCount++;
      } catch (err) {
        console.error(`[DisbursementService] Failed to publish outbox msg ${msg.id}:`, err);
        // Leave as PENDING for next retry
      }
    }

    return publishedCount;
  }

  public getDisbursementById(id: string): DisbursementRecord | null {
    const row = this.db.prepare('SELECT * FROM disbursements WHERE id = ?').get(id) as {
      id: string;
      application_id: string;
      amount: number;
      recipient_account: string;
      bank_reference: string;
      status: DisbursementRecord['status'];
      failure_reason: string | null;
      retry_count: number;
      ledger_entry_id: string;
      created_at: string;
      updated_at: string;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      applicationId: row.application_id,
      amount: row.amount,
      recipientAccount: row.recipient_account,
      bankTransferReference: row.bank_reference,
      status: row.status,
      failureReason: row.failure_reason || undefined,
      retryCount: row.retry_count,
      ledgerEntryId: row.ledger_entry_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  public getDisbursementsByApplicationId(applicationId: string): DisbursementRecord[] {
    const rows = this.db.prepare('SELECT * FROM disbursements WHERE application_id = ?').all(applicationId) as Array<{
      id: string;
      application_id: string;
      amount: number;
      recipient_account: string;
      bank_reference: string;
      status: DisbursementRecord['status'];
      failure_reason: string | null;
      retry_count: number;
      ledger_entry_id: string;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      applicationId: row.application_id,
      amount: row.amount,
      recipientAccount: row.recipient_account,
      bankTransferReference: row.bank_reference,
      status: row.status,
      failureReason: row.failure_reason || undefined,
      retryCount: row.retry_count,
      ledgerEntryId: row.ledger_entry_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Idempotent Event Consumer: loan.approved
   */
  public async handleLoanApprovedEvent(envelope: MessageEnvelope<unknown>): Promise<void> {
    const checkStmt = this.db.prepare('SELECT message_id FROM processed_messages WHERE message_id = ?');
    const existing = checkStmt.get(envelope.id);
    if (existing) {
      return; // Idempotent skip
    }

    const parsed = LoanApprovedPayloadSchema.safeParse(envelope.payload);
    if (!parsed.success) {
      console.error('[DisbursementService] Invalid loan.approved payload:', parsed.error);
      return;
    }

    const payload = parsed.data;
    this.executeDisbursementWithOutbox(
      {
        applicationId: payload.applicationId,
        amount: payload.amount,
        recipientAccount: payload.recipientAccount,
      },
      {
        correlationId: envelope.correlationId,
        causationId: envelope.id,
        incomingMessageId: envelope.id,
      },
    );
  }
}
