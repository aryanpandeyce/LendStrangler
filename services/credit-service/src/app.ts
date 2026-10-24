import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Database } from 'better-sqlite3';
import { CreditCheckApiRequestSchema } from '@lendstrangler/contracts';
import { IMessageBroker } from '@lendstrangler/messaging';
import { CreditUnderwritingService } from './services/credit-underwriting.service.js';

export function createCreditServiceApp(db: Database, broker?: IMessageBroker) {
  const app = express();
  const underwritingService = new CreditUnderwritingService(db, broker);

  app.use(cors());
  app.use(express.json());

  // Structured Logging and Correlation ID Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const correlationId =
      (req.headers['x-correlation-id'] as string) ||
      `corr-credit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    res.setHeader('X-Correlation-Id', correlationId);
    res.setHeader('X-Served-By', 'credit-service');

    const start = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const logEntry = {
        timestamp: new Date().toISOString(),
        service: 'credit-service',
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
      service: 'credit-service',
      timestamp: new Date().toISOString(),
      architecture: 'Event-Driven Microservice',
    });
  });

  // REST Evaluation Endpoint
  app.post('/api/credit/evaluate', (req: Request, res: Response) => {
    const parsed = CreditCheckApiRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    const correlationId = res.getHeader('X-Correlation-Id') as string;
    const result = underwritingService.evaluateAndPersist(parsed.data, correlationId);
    return res.json(result);
  });

  // Query Evaluation by Application ID
  app.get('/api/credit/:applicationId', (req: Request, res: Response) => {
    const evalResult = underwritingService.getEvaluationByApplicationId(String(req.params.applicationId));
    if (!evalResult) {
      return res.status(404).json({ error: 'Credit evaluation not found' });
    }
    return res.json(evalResult);
  });

  // Global Error Handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[Credit Service Error]:', err);
    res.status(500).json({
      error: 'Internal Credit Service Error',
      message: err.message,
    });
  });

  return { app, underwritingService };
}
