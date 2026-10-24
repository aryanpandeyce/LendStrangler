import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { z } from 'zod';
import { RouteTable } from './router/route-table.js';
import { ProxyDispatcher } from './proxy/dispatcher.js';
import { ShadowDiffStore } from './shadow/shadow-diff-store.js';

export function createGatewayApp(
  routeTable = new RouteTable(),
  shadowDiffStore = new ShadowDiffStore(),
) {
  const app = express();
  const dispatcher = new ProxyDispatcher(routeTable, shadowDiffStore);

  app.use(cors());
  app.use(express.json());

  // Structured Logging Middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const correlationId =
      (req.headers['x-correlation-id'] as string) ||
      `corr-gw-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    res.setHeader('X-Correlation-Id', correlationId);

    const start = Date.now();
    res.on('finish', () => {
      const durationMs = Date.now() - start;
      const logEntry = {
        timestamp: new Date().toISOString(),
        service: 'strangler-gateway',
        correlationId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        routeMode: res.getHeader('X-Route-Mode'),
        servedBy: res.getHeader('X-Served-By'),
        durationMs,
      };
      if (process.env.NODE_ENV !== 'test') {
        console.info(JSON.stringify(logEntry));
      }
    });

    next();
  });

  // Gateway Health Endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'UP',
      service: 'strangler-gateway',
      timestamp: new Date().toISOString(),
      activeRoutesCount: routeTable.getAllRoutes().length,
      shadowDiffSummary: shadowDiffStore.getSummary(),
    });
  });

  // Admin Route Table Management APIs
  app.get('/admin/routes', (_req: Request, res: Response) => {
    res.json(routeTable.getAllRoutes());
  });

  const UpdateRouteSchema = z.object({
    pathPattern: z.string(),
    mode: z.enum(['LEGACY', 'NEW', 'SHADOW', 'CANARY']).optional(),
    canaryWeightPercent: z.number().min(0).max(100).optional(),
    legacyTarget: z.string().url().optional(),
    newTarget: z.string().url().optional(),
  });

  app.put('/admin/routes', (req: Request, res: Response) => {
    const parsed = UpdateRouteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    try {
      const updated = routeTable.updateRoute(parsed.data.pathPattern, parsed.data);
      return res.json(updated);
    } catch (err) {
      return res.status(404).json({ error: (err as Error).message });
    }
  });

  app.post('/admin/routes/reset', (_req: Request, res: Response) => {
    routeTable.resetAll();
    res.json({ status: 'RESET_TO_DEFAULTS', routes: routeTable.getAllRoutes() });
  });

  // Admin Shadow Diff Inspection APIs
  app.get('/admin/shadow-diffs', (req: Request, res: Response) => {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    res.json({
      summary: shadowDiffStore.getSummary(),
      records: shadowDiffStore.getRecords(limit),
    });
  });

  app.delete('/admin/shadow-diffs', (_req: Request, res: Response) => {
    shadowDiffStore.clear();
    res.json({ status: 'CLEARED' });
  });

  // Core Strangler Facade Route Interceptor
  app.use('/api', async (req: Request, res: Response) => {
    await dispatcher.handleRequest(req, res);
  });

  // Global Error Handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[Gateway Global Error]:', err);
    res.status(500).json({
      error: 'Gateway Internal Error',
      message: err.message,
    });
  });

  return { app, routeTable, shadowDiffStore };
}
