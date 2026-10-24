import {
  calculateEMI,
  CreateLoanRequest,
  CreditScoreResult,
  evaluateCreditScore,
  LoanApplication,
  RouteMode,
  RouteRule,
  ShadowDiffRecord,
} from '@lendstrangler/contracts';
import { InMemoryBroker } from '@lendstrangler/messaging/in-memory';
import type { MessageEnvelope } from '@lendstrangler/messaging';

export interface TimelineEventItem {
  id: string;
  name: string;
  service: string;
  timestamp: string;
  correlationId: string;
  payload: Record<string, unknown>;
  status: 'info' | 'success' | 'warning' | 'error';
}

export class SimulatedBackendEngine {
  private broker: InMemoryBroker;
  private routes: RouteRule[];
  private loans: LoanApplication[] = [];
  private shadowDiffs: ShadowDiffRecord[] = [];
  private eventTimeline: TimelineEventItem[] = [];
  private chaosEnabled = false;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.broker = new InMemoryBroker();

    this.routes = [
      {
        pathPattern: '/api/loans',
        mode: 'NEW',
        canaryWeightPercent: 0,
        legacyTarget: 'http://localhost:3001',
        newTarget: 'http://localhost:3004',
        activeService: 'loan-service',
        description: 'Loan Application Origination & Portfolio Management',
      },
      {
        pathPattern: '/api/credit',
        mode: 'NEW',
        canaryWeightPercent: 0,
        legacyTarget: 'http://localhost:3001',
        newTarget: 'http://localhost:3002',
        activeService: 'credit-service',
        description: 'Underwriting & Risk Evaluation Engine',
      },
      {
        pathPattern: '/api/disbursements',
        mode: 'NEW',
        canaryWeightPercent: 0,
        legacyTarget: 'http://localhost:3001',
        newTarget: 'http://localhost:3003',
        activeService: 'disbursement-service',
        description: 'Disbursement Ledger & Bank Transfer Gateway',
      },
    ];

    this.initSeedData();
    this.setupBrokerListeners();
  }

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private initSeedData() {
    const now = new Date().toISOString();
    this.loans = [
      {
        id: 'app-seed-101',
        applicant: {
          id: 'usr-101',
          fullName: 'Apex Industrial Logistics',
          email: 'finance@apexlogistics.com',
          monthlyIncome: 180000,
          existingMonthlyEmi: 15000,
        },
        amount: 500000,
        tenureMonths: 36,
        interestRateAnnual: 9.5,
        monthlyEmi: 16016.15,
        purpose: 'BUSINESS_EXPANSION',
        status: 'DISBURSED',
        creditScore: 820,
        disbursementReference: 'TXN-ACH-89102-SEED',
        createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
        updatedAt: now,
      },
      {
        id: 'app-seed-102',
        applicant: {
          id: 'usr-102',
          fullName: 'Beacon Health Systems',
          email: 'treasury@beaconhealth.org',
          monthlyIncome: 95000,
          existingMonthlyEmi: 22000,
        },
        amount: 250000,
        tenureMonths: 24,
        interestRateAnnual: 10.5,
        monthlyEmi: 11598.63,
        purpose: 'DEBT_CONSOLIDATION',
        status: 'APPROVED',
        creditScore: 710,
        createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
        updatedAt: now,
      },
      {
        id: 'app-seed-103',
        applicant: {
          id: 'usr-103',
          fullName: 'Vanguard Retail Holdings',
          email: 'credit@vanguardretail.net',
          monthlyIncome: 22000,
          existingMonthlyEmi: 12000,
        },
        amount: 400000,
        tenureMonths: 12,
        interestRateAnnual: 12.0,
        monthlyEmi: 35540.32,
        purpose: 'HOME_IMPROVEMENT',
        status: 'REJECTED',
        creditScore: 540,
        rejectionReason: 'INSUFFICIENT_MINIMUM_INCOME_BELOW_25000, DTI_RATIO_EXCEEDS_MAXIMUM_THRESHOLD_50_PERCENT',
        createdAt: new Date(Date.now() - 3600000 * 6).toISOString(),
        updatedAt: now,
      },
    ];

    // Seed initial shadow diffs
    this.shadowDiffs = [
      {
        id: 'diff-seed-1',
        timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
        path: '/api/credit/evaluate',
        method: 'POST',
        correlationId: 'corr-shadow-seed-1',
        isEqual: true,
        legacyStatus: 200,
        newStatus: 200,
        legacyLatencyMs: 84,
        newLatencyMs: 22,
        differences: [],
      },
      {
        id: 'diff-seed-2',
        timestamp: new Date(Date.now() - 1000 * 60 * 2).toISOString(),
        path: '/api/credit/evaluate',
        method: 'POST',
        correlationId: 'corr-shadow-seed-2',
        isEqual: true,
        legacyStatus: 200,
        newStatus: 200,
        legacyLatencyMs: 92,
        newLatencyMs: 18,
        differences: [],
      },
    ];
  }

  private setupBrokerListeners() {
    this.broker.addListener((eventType, data) => {
      this.notify();
      if (eventType === 'published') {
        const envelope = data as MessageEnvelope<Record<string, unknown>>;
        let service = 'loan-service';
        let status: TimelineEventItem['status'] = 'info';

        if (envelope.topic.startsWith('credit.')) {
          service = 'credit-service';
          status = 'success';
        } else if (envelope.topic.startsWith('disbursement.completed')) {
          service = 'disbursement-service';
          status = 'success';
        } else if (envelope.topic.startsWith('disbursement.failed')) {
          service = 'disbursement-service';
          status = 'error';
        } else if (envelope.topic.startsWith('loan.rejected')) {
          status = 'warning';
        }

        this.eventTimeline.unshift({
          id: envelope.id,
          name: envelope.topic,
          service,
          timestamp: envelope.timestamp,
          correlationId: envelope.correlationId,
          payload: envelope.payload,
          status,
        });

        if (this.eventTimeline.length > 50) this.eventTimeline.pop();
        this.notify();
      }
    });

    // Wire simulated microservice consumers
    this.broker.subscribe('credit-service.queue', 'loan.submitted', async (envelope) => {
      const payload = envelope.payload as {
        applicationId: string;
        applicant: { id: string; monthlyIncome: number; existingMonthlyEmi: number };
        amount: number;
        tenureMonths: number;
      };

      await new Promise((r) => setTimeout(r, 600));

      const evaluation = evaluateCreditScore({
        applicationId: payload.applicationId,
        applicantId: payload.applicant.id,
        monthlyIncome: payload.applicant.monthlyIncome,
        existingMonthlyEmi: payload.applicant.existingMonthlyEmi,
        requestedAmount: payload.amount,
        tenureMonths: payload.tenureMonths,
      });

      await this.broker.publish('credit.checked', evaluation, {
        correlationId: envelope.correlationId,
        causationId: envelope.id,
      });
    });

    this.broker.subscribe('loan-service.credit-queue', 'credit.checked', async (envelope) => {
      const evaluation = envelope.payload as CreditScoreResult;
      const loan = this.loans.find((l) => l.id === evaluation.applicationId);
      if (!loan) return;

      await new Promise((r) => setTimeout(r, 500));

      if (evaluation.decision === 'APPROVED') {
        loan.status = 'APPROVED';
        loan.creditScore = evaluation.score;
        loan.interestRateAnnual = evaluation.recommendedInterestRate;
        const { monthlyEmi } = calculateEMI(loan.amount, evaluation.recommendedInterestRate, loan.tenureMonths);
        loan.monthlyEmi = monthlyEmi;

        this.notify();

        await this.broker.publish(
          'loan.approved',
          {
            applicationId: loan.id,
            applicantId: loan.applicant.id,
            amount: loan.amount,
            tenureMonths: loan.tenureMonths,
            interestRateAnnual: loan.interestRateAnnual,
            monthlyEmi: loan.monthlyEmi,
            recipientAccount: `ACC-${loan.applicant.id}-01`,
          },
          { correlationId: envelope.correlationId, causationId: envelope.id },
        );
      } else {
        loan.status = 'REJECTED';
        loan.creditScore = evaluation.score;
        loan.rejectionReason = evaluation.reasonCodes.join(', ');
        this.notify();

        await this.broker.publish(
          'loan.rejected',
          {
            applicationId: loan.id,
            applicantId: loan.applicant.id,
            reasonCodes: evaluation.reasonCodes,
            score: evaluation.score,
          },
          { correlationId: envelope.correlationId, causationId: envelope.id },
        );
      }
    });

    this.broker.subscribe('disbursement-service.queue', 'loan.approved', async (envelope) => {
      const payload = envelope.payload as { applicationId: string; amount: number; recipientAccount: string };
      await new Promise((r) => setTimeout(r, 700));

      if (this.chaosEnabled) {
        // Fail simulated bank transfer
        await this.broker.publish(
          'disbursement.failed',
          {
            disbursementId: `disb-err-${Date.now()}`,
            applicationId: payload.applicationId,
            amount: payload.amount,
            reason: 'PAYMENT_RAILS_NETWORK_TIMEOUT (Chaos Toggle Active)',
            retryCount: 3,
            sentToDlq: true,
          },
          { correlationId: envelope.correlationId, causationId: envelope.id },
        );
      } else {
        // Successful bank transfer
        const ref = `TXN-ACH-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
        await this.broker.publish(
          'disbursement.completed',
          {
            disbursementId: `disb-${Date.now()}`,
            applicationId: payload.applicationId,
            amount: payload.amount,
            bankTransferReference: ref,
            ledgerEntryId: `ledg-${Date.now()}`,
          },
          { correlationId: envelope.correlationId, causationId: envelope.id },
        );
      }
    });

    this.broker.subscribe('loan-service.disb-comp-queue', 'disbursement.completed', async (envelope) => {
      const payload = envelope.payload as { applicationId: string; bankTransferReference: string };
      const loan = this.loans.find((l) => l.id === payload.applicationId);
      if (loan) {
        loan.status = 'DISBURSED';
        loan.disbursementReference = payload.bankTransferReference;
        this.notify();
      }
    });

    this.broker.subscribe('loan-service.disb-fail-queue', 'disbursement.failed', async (envelope) => {
      const payload = envelope.payload as { applicationId: string; reason: string };
      const loan = this.loans.find((l) => l.id === payload.applicationId);
      if (loan) {
        loan.status = 'FAILED';
        loan.rejectionReason = payload.reason;
        this.notify();
      }
    });
  }

  // --- Public Methods for UI ---

  public getLoans(): LoanApplication[] {
    return [...this.loans];
  }

  public getRoutes(): RouteRule[] {
    return [...this.routes];
  }

  public updateRoute(pathPattern: string, mode: RouteMode, canaryWeightPercent = 0): void {
    const route = this.routes.find((r) => r.pathPattern === pathPattern);
    if (route) {
      route.mode = mode;
      route.canaryWeightPercent = canaryWeightPercent;
      route.activeService =
        mode === 'NEW'
          ? (pathPattern.includes('credit') ? 'credit-service' : pathPattern.includes('disburse') ? 'disbursement-service' : 'loan-service')
          : mode === 'LEGACY'
          ? 'legacy-monolith'
          : `hybrid (${mode})`;
      this.notify();
    }
  }

  public setChaos(enabled: boolean): void {
    this.chaosEnabled = enabled;
    this.notify();
  }

  public isChaosEnabled(): boolean {
    return this.chaosEnabled;
  }

  public getTimeline(): TimelineEventItem[] {
    return [...this.eventTimeline];
  }

  public clearTimeline(): void {
    this.eventTimeline = [];
    this.notify();
  }

  public getBrokerMetrics() {
    return this.broker.getQueueMetrics();
  }

  public getDlqMessages() {
    return this.broker.getDlqMessages();
  }

  public async replayDlq(msgId: string): Promise<boolean> {
    const res = await this.broker.replayDlqMessage(msgId);
    this.notify();
    return res;
  }

  public getShadowDiffs(): ShadowDiffRecord[] {
    return [...this.shadowDiffs];
  }

  public triggerShadowRun(): void {
    const requestedAmount = Math.floor(Math.random() * 400000 + 50000);
    const monthlyIncome = Math.floor(Math.random() * 100000 + 30000);
    const existingMonthlyEmi = Math.floor(monthlyIncome * 0.2);

    const legacyEval = evaluateCreditScore({
      applicationId: `app-shadow-${Date.now()}`,
      applicantId: `usr-shadow-${Date.now()}`,
      monthlyIncome,
      existingMonthlyEmi,
      requestedAmount,
      tenureMonths: 24,
    });
    const legacyLatencyMs = Math.floor(Math.random() * 40 + 70); // Simulates slower legacy DB

    // Run modern evaluation to mirror live shadow execution
    evaluateCreditScore({
      applicationId: legacyEval.applicationId,
      applicantId: legacyEval.applicantId,
      monthlyIncome,
      existingMonthlyEmi,
      requestedAmount,
      tenureMonths: 24,
    });
    const newLatencyMs = Math.floor(Math.random() * 15 + 12); // Modern microservice is ~4x faster

    const diffRecord: ShadowDiffRecord = {
      id: `diff-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      path: '/api/credit/evaluate',
      method: 'POST',
      correlationId: `corr-shadow-${Date.now()}`,
      isEqual: true,
      legacyStatus: 200,
      newStatus: 200,
      legacyLatencyMs,
      newLatencyMs,
      differences: [],
    };

    this.shadowDiffs.unshift(diffRecord);
    if (this.shadowDiffs.length > 30) this.shadowDiffs.pop();
    this.notify();
  }

  public async submitLoan(req: CreateLoanRequest): Promise<LoanApplication> {
    const applicationId = `app-demo-${Date.now().toString().slice(-4)}`;
    const applicantId = `usr-demo-${Date.now().toString().slice(-4)}`;
    const baseInterestRate = 10.5;
    const { monthlyEmi } = calculateEMI(req.amount, baseInterestRate, req.tenureMonths);
    const correlationId = `corr-originate-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const newLoan: LoanApplication = {
      id: applicationId,
      applicant: {
        id: applicantId,
        fullName: req.fullName,
        email: req.email,
        monthlyIncome: req.monthlyIncome,
        existingMonthlyEmi: req.existingMonthlyEmi,
      },
      amount: req.amount,
      tenureMonths: req.tenureMonths,
      interestRateAnnual: baseInterestRate,
      monthlyEmi,
      purpose: req.purpose,
      status: 'SUBMITTED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.loans.unshift(newLoan);
    this.notify();

    // Check routing mode for loans
    const loanRoute = this.routes.find((r) => r.pathPattern === '/api/loans');
    const isLegacy = loanRoute?.mode === 'LEGACY';

    if (isLegacy) {
      // In LEGACY mode: simulate monolithic synchronous blocking cascade
      this.eventTimeline.unshift({
        id: `msg-leg-${Date.now()}`,
        name: 'monolith.synchronous_chain.started',
        service: 'legacy-monolith',
        timestamp: new Date().toISOString(),
        correlationId,
        payload: { message: 'Executing tightly coupled synchronous in-process cascade...' },
        status: 'warning',
      });
      this.notify();

      await new Promise((r) => setTimeout(r, 800));

      const evaluation = evaluateCreditScore({
        applicationId,
        applicantId,
        monthlyIncome: req.monthlyIncome,
        existingMonthlyEmi: req.existingMonthlyEmi,
        requestedAmount: req.amount,
        tenureMonths: req.tenureMonths,
      });

      if (evaluation.decision === 'REJECTED') {
        newLoan.status = 'REJECTED';
        newLoan.creditScore = evaluation.score;
        newLoan.rejectionReason = evaluation.reasonCodes.join(', ');
      } else {
        newLoan.status = this.chaosEnabled ? 'FAILED' : 'DISBURSED';
        newLoan.creditScore = evaluation.score;
        if (this.chaosEnabled) {
          newLoan.rejectionReason = 'GATEWAY_TIMEOUT_TRANSFER_ABORTED';
        } else {
          newLoan.disbursementReference = `TXN-LEGACY-${Date.now()}`;
        }
      }

      this.eventTimeline.unshift({
        id: `msg-leg-${Date.now()}`,
        name: 'monolith.synchronous_chain.completed',
        service: 'legacy-monolith',
        timestamp: new Date().toISOString(),
        correlationId,
        payload: { finalStatus: newLoan.status },
        status: newLoan.status === 'DISBURSED' ? 'success' : 'error',
      });
      this.notify();
      return newLoan;
    }

    // In NEW / CANARY / SHADOW mode: publish event to in-memory broker
    await this.broker.publish(
      'loan.submitted',
      {
        applicationId: newLoan.id,
        applicant: newLoan.applicant,
        amount: newLoan.amount,
        tenureMonths: newLoan.tenureMonths,
        purpose: newLoan.purpose,
      },
      { correlationId },
    );

    return newLoan;
  }
}

export const simulatedEngine = new SimulatedBackendEngine();
