import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Database } from 'better-sqlite3';
import { z } from 'zod';
import { DisbursementApiRequestSchema } from '@lendstrangler/contracts';
import { IMessageBroker } from '@lendstrangler/messaging';
import { DisbursementLedgerService } from './services/disbursement-ledger.service.js';

export function createDisbursementServiceApp(db: Database, broker?: IMessageBroker) {
  const app = express();
  const ledgerService = new DisbursementLedgerService(db, broker);

  app.use(cors());
  app.use(express.json());

  // Structured Logging and Correlation ID Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const correlationId =
      (req.headers['x-correlation-id'] as string) ||
      `corr-disb-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    res.setHeader('X-Correlation-Id', correlationId);
    res.setHeader('X-Served-By', 'disbursement-service');

    const start = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const logEntry = {
        timestamp: new Date().toISOString(),
        service: 'disbursement-service',
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
      service: 'disbursement-service',
      timestamp: new Date().toISOString(),
      chaosFailureRate: ledgerService.getChaosRate(),
      architecture: 'Transactional Outbox + Event Driven',
    });
  });

  // REST Transfer Endpoint
  app.post('/api/disbursements/transfer', (req: Request, res: Response) => {
    const parsed = DisbursementApiRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    const correlationId = res.getHeader('X-Correlation-Id') as string;
    const result = ledgerService.executeDisbursementWithOutbox(parsed.data, { correlationId });

    const statusCode = result.status === 'SUCCESS' ? 200 : 502;
    return res.status(statusCode).json(result);
  });

  // Lookup by ID
  app.get('/api/disbursements/:id', (req: Request, res: Response) => {
    const result = ledgerService.getDisbursementById(String(req.params.id));
    if (!result) {
      return res.status(404).json({ error: 'Disbursement not found' });
    }
    return res.json(result);
  });

  // Lookup by Application ID
  app.get('/api/disbursements/application/:applicationId', (req: Request, res: Response) => {
    const results = ledgerService.getDisbursementsByApplicationId(String(req.params.applicationId));
    return res.json(results);
  });

  // Chaos Rate Control
  const ChaosRateSchema = z.object({
    failureRate: z.number().min(0).max(1),
  });

  app.post('/api/disbursements/chaos', (req: Request, res: Response) => {
    const parsed = ChaosRateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    ledgerService.setChaosRate(parsed.data.failureRate);
    return res.json({
      status: 'UPDATED',
      chaosFailureRate: ledgerService.getChaosRate(),
    });
  });

  app.get('/api/disbursements/chaos', (_req: Request, res: Response) => {
    res.json({ chaosFailureRate: ledgerService.getChaosRate() });
  });

  // Manual Outbox Flush Trigger
  app.post('/api/disbursements/outbox/flush', async (_req: Request, res: Response) => {
    const count = await ledgerService.flushOutbox();
    res.json({ status: 'FLUSHED', publishedMessages: count });
  });

  // Global Error Handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[Disbursement Service Error]:', err);
    res.status(500).json({
      error: 'Internal Disbursement Service Error',
      message: err.message,
    });
  });

  return { app, ledgerService };
}
