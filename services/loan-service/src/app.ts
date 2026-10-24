import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Database } from 'better-sqlite3';
import { CreateLoanRequestSchema } from '@lendstrangler/contracts';
import { IMessageBroker } from '@lendstrangler/messaging';
import { LoanOrchestratorService } from './services/loan-orchestrator.service.js';

export function createLoanServiceApp(db: Database, broker?: IMessageBroker) {
  const app = express();
  const orchestrator = new LoanOrchestratorService(db, broker);

  app.use(cors());
  app.use(express.json());

  // Structured Logging and Correlation ID Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const correlationId =
      (req.headers['x-correlation-id'] as string) ||
      `corr-loan-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    res.setHeader('X-Correlation-Id', correlationId);
    res.setHeader('X-Served-By', 'loan-service');

    const start = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const logEntry = {
        timestamp: new Date().toISOString(),
        service: 'loan-service',
        correlationId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs,
      };
      if (process.env.NODE_ENV !== 'test') {
        console.info(JSON.stringify(logEntry));
      }
    });

    next();
  });

  // Health Endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'UP',
      service: 'loan-service',
      timestamp: new Date().toISOString(),
      architecture: 'Event-Choreographed Saga Orchestrator',
    });
  });

  // Loan Listing
  app.get('/api/loans', (_req: Request, res: Response) => {
    const loans = orchestrator.getAllLoans();
    res.json(loans);
  });

  // Loan Lookup
  app.get('/api/loans/:id', (req: Request, res: Response) => {
    const loan = orchestrator.getLoanById(String(req.params.id));
    if (!loan) {
      return res.status(404).json({ error: 'Loan application not found' });
    }
    return res.json(loan);
  });

  // Loan Submission
  app.post('/api/loans', (req: Request, res: Response) => {
    const parsed = CreateLoanRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    const correlationId = res.getHeader('X-Correlation-Id') as string;
    const loan = orchestrator.submitLoanApplication(parsed.data, correlationId);
    return res.status(201).json(loan);
  });

  // Manual Outbox Flush Trigger
  app.post('/api/loans/outbox/flush', async (_req: Request, res: Response) => {
    const count = await orchestrator.flushOutbox();
    res.json({ status: 'FLUSHED', publishedMessages: count });
  });

  // Global Error Handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[Loan Service Error]:', err);
    res.status(500).json({
      error: 'Internal Loan Service Error',
      message: err.message,
    });
  });

  return { app, orchestrator };
}
