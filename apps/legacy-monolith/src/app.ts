import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Database } from 'better-sqlite3';
import {
  CreateLoanRequestSchema,
  CreditCheckApiRequestSchema,
  DisbursementApiRequestSchema,
} from '@lendstrangler/contracts';
import { MonolithGodService } from './services/monolith-god.service.js';

export function createLegacyApp(db: Database) {
  const app = express();
  const godService = new MonolithGodService(db);

  app.use(cors());
  app.use(express.json());

  // Structured Logging and Correlation ID Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const correlationId = (req.headers['x-correlation-id'] as string) || `corr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    res.setHeader('X-Correlation-Id', correlationId);
    res.setHeader('X-Served-By', 'legacy-monolith');

    const start = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const logEntry = {
        timestamp: new Date().toISOString(),
        service: 'legacy-monolith',
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
      service: 'legacy-monolith',
      timestamp: new Date().toISOString(),
      architecture: 'Monolithic MVC God Service',
    });
  });

  // Loan Endpoints
  app.get('/api/loans', (_req: Request, res: Response) => {
    const loans = godService.getAllLoans();
    res.json(loans);
  });

  app.get('/api/loans/:id', (req: Request, res: Response) => {
    const loan = godService.getLoanById(String(req.params.id));
    if (!loan) {
      return res.status(404).json({ error: 'Loan application not found' });
    }
    return res.json(loan);
  });

  app.post('/api/loans', async (req: Request, res: Response) => {
    const parsed = CreateLoanRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    const forceDisbursementFailure = req.query.forceDisbursementFailure === 'true';
    const correlationId = res.getHeader('X-Correlation-Id') as string;

    const result = await godService.applyLoanSynchronously(parsed.data, {
      forceDisbursementFailure,
      correlationId,
    });

    return res.status(201).json(result);
  });

  // Direct Credit Check Endpoint (Legacy)
  app.post('/api/credit/evaluate', (req: Request, res: Response) => {
    const parsed = CreditCheckApiRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    const result = godService.evaluateCreditSynchronously(parsed.data);
    return res.json(result);
  });

  // Direct Disbursement Endpoint (Legacy)
  app.post('/api/disbursements/transfer', (req: Request, res: Response) => {
    const parsed = DisbursementApiRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    const result = godService.disburseSynchronously(parsed.data);
    const statusCode = result.status === 'SUCCESS' ? 200 : 502;
    return res.status(statusCode).json(result);
  });

  // Global Error Handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled legacy error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message,
    });
  });

  return app;
}
