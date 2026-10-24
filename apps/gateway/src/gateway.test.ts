import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express, { Request, Response } from 'express';
import http from 'http';
import { createGatewayApp } from './app.js';
import { RouteTable } from './router/route-table.js';
import { ShadowDiffStore } from './shadow/shadow-diff-store.js';

describe('Strangler Gateway & Reverse Proxy Facade Tests', () => {
  let mockLegacyServer: http.Server;
  let mockNewServer: http.Server;
  let legacyPort: number;
  let newPort: number;

  let gatewayApp: express.Express;
  let routeTable: RouteTable;
  let shadowDiffStore: ShadowDiffStore;

  beforeAll(async () => {
    // 1. Setup Mock Legacy Monolith Target Server
    const legacyApp = express();
    legacyApp.use(express.json());
    legacyApp.get('/api/loans', (_req: Request, res: Response) => {
      res.json([{ id: 'leg-1', amount: 50000, source: 'monolith' }]);
    });
    legacyApp.post('/api/credit/evaluate', (req: Request, res: Response) => {
      res.json({
        score: 720,
        decision: 'APPROVED',
        service: 'legacy-monolith',
        input: req.body,
      });
    });

    mockLegacyServer = http.createServer(legacyApp);
    await new Promise<void>((resolve) => mockLegacyServer.listen(0, () => resolve()));
    legacyPort = (mockLegacyServer.address() as { port: number }).port;

    // 2. Setup Mock Modern Microservice Target Server
    const modernApp = express();
    modernApp.use(express.json());
    modernApp.get('/api/loans', (_req: Request, res: Response) => {
      res.json([{ id: 'new-1', amount: 50000, source: 'microservice' }]);
    });
    modernApp.post('/api/credit/evaluate', (req: Request, res: Response) => {
      res.json({
        score: 720,
        decision: 'APPROVED',
        service: 'credit-microservice',
        input: req.body,
      });
    });

    mockNewServer = http.createServer(modernApp);
    await new Promise<void>((resolve) => mockNewServer.listen(0, () => resolve()));
    newPort = (mockNewServer.address() as { port: number }).port;

    // 3. Setup Gateway configured to point to these test servers
    routeTable = new RouteTable();
    routeTable.updateRoute('/api/loans', {
      legacyTarget: `http://localhost:${legacyPort}`,
      newTarget: `http://localhost:${newPort}`,
    });
    routeTable.updateRoute('/api/credit', {
      legacyTarget: `http://localhost:${legacyPort}`,
      newTarget: `http://localhost:${newPort}`,
    });

    shadowDiffStore = new ShadowDiffStore();
    const initialized = createGatewayApp(routeTable, shadowDiffStore);
    gatewayApp = initialized.app;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => mockLegacyServer.close(() => resolve()));
    await new Promise<void>((resolve) => mockNewServer.close(() => resolve()));
  });

  it('GET /health returns Gateway status and initial metrics', async () => {
    const res = await request(gatewayApp).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
    expect(res.body.service).toBe('strangler-gateway');
    expect(res.body.activeRoutesCount).toBeGreaterThanOrEqual(3);
  });

  it('GET /admin/routes returns full routing table with initial LEGACY modes', async () => {
    const res = await request(gatewayApp).get('/admin/routes');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const loanRoute = res.body.find((r: { pathPattern: string }) => r.pathPattern === '/api/loans');
    expect(loanRoute).toBeDefined();
    expect(loanRoute.mode).toBe('LEGACY');
  });

  it('Proxies 100% traffic to Legacy Monolith by default in LEGACY mode', async () => {
    const res = await request(gatewayApp)
      .get('/api/loans')
      .set('X-Correlation-Id', 'corr-gateway-test-1');

    expect(res.status).toBe(200);
    expect(res.headers['x-route-mode']).toBe('LEGACY');
    expect(res.headers['x-served-by']).toBe('legacy-monolith');
    expect(res.headers['x-correlation-id']).toBe('corr-gateway-test-1');
    expect(res.body[0].source).toBe('monolith');
  });

  it('PUT /admin/routes dynamically updates route mode to NEW and routes traffic to microservice', async () => {
    const updateRes = await request(gatewayApp)
      .put('/admin/routes')
      .send({
        pathPattern: '/api/loans',
        mode: 'NEW',
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.mode).toBe('NEW');

    const res = await request(gatewayApp).get('/api/loans');
    expect(res.status).toBe(200);
    expect(res.headers['x-route-mode']).toBe('NEW');
    expect(res.body[0].source).toBe('microservice');

    // Reset back to LEGACY for following tests
    routeTable.setMode('/api/loans', 'LEGACY');
  });

  it('Executes SHADOW mode: returns legacy response and records diff with modern service', async () => {
    routeTable.setMode('/api/credit', 'SHADOW');

    const payload = { requestedAmount: 50000 };
    const res = await request(gatewayApp)
      .post('/api/credit/evaluate')
      .send(payload)
      .set('X-Correlation-Id', 'corr-shadow-test-1');

    // Client receives legacy response immediately
    expect(res.status).toBe(200);
    expect(res.headers['x-route-mode']).toBe('SHADOW');
    expect(res.headers['x-shadow-active']).toBe('true');
    expect(res.body.service).toBe('legacy-monolith');

    // Wait a brief tick for async shadow execution
    await new Promise((resolve) => setTimeout(resolve, 80));

    const diffsRes = await request(gatewayApp).get('/admin/shadow-diffs');
    expect(diffsRes.status).toBe(200);
    expect(diffsRes.body.records.length).toBeGreaterThanOrEqual(1);

    const diff = diffsRes.body.records[0];
    expect(diff.path).toBe('/api/credit/evaluate');
    expect(diff.legacyStatus).toBe(200);
    expect(diff.newStatus).toBe(200);
    // Differences should detect the service property mismatch
    expect(diff.differences.some((d: { field: string }) => d.field === 'service')).toBe(true);
  });

  it('Executes CANARY mode: 100% canary weight routes 100% to modern microservice', async () => {
    routeTable.setMode('/api/loans', 'CANARY', 100);

    const res = await request(gatewayApp).get('/api/loans');
    expect(res.status).toBe(200);
    expect(res.headers['x-route-mode']).toBe('CANARY');
    expect(res.headers['x-canary-roll']).toBe('NEW');
    expect(res.body[0].source).toBe('microservice');
  });

  it('Executes CANARY mode: 0% canary weight routes 100% to legacy monolith', async () => {
    routeTable.setMode('/api/loans', 'CANARY', 0);

    const res = await request(gatewayApp).get('/api/loans');
    expect(res.status).toBe(200);
    expect(res.headers['x-route-mode']).toBe('CANARY');
    expect(res.headers['x-canary-roll']).toBe('LEGACY');
    expect(res.body[0].source).toBe('monolith');
  });
});
