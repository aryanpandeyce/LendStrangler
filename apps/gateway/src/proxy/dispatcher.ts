import { Request, Response } from 'express';
import { RouteTable } from '../router/route-table.js';
import { comparePayloads, ShadowDiffStore } from '../shadow/shadow-diff-store.js';

export class ProxyDispatcher {
  constructor(
    private routeTable: RouteTable,
    private shadowDiffStore: ShadowDiffStore,
  ) {}

  public async handleRequest(req: Request, res: Response): Promise<void> {
    const correlationId =
      (req.headers['x-correlation-id'] as string) ||
      `corr-gw-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    res.setHeader('X-Correlation-Id', correlationId);

    const requestPath = req.originalUrl.split('?')[0];
    const matchingRoute = this.routeTable.matchRoute(requestPath);
    const mode = matchingRoute ? matchingRoute.mode : 'LEGACY';
    const legacyTarget = matchingRoute?.legacyTarget || process.env.LEGACY_SERVICE_URL || 'http://localhost:3001';
    const newTarget = matchingRoute?.newTarget || process.env.LOAN_SERVICE_URL || 'http://localhost:3004';

    res.setHeader('X-Route-Mode', mode);

    switch (mode) {
      case 'NEW': {
        res.setHeader('X-Served-By', matchingRoute?.activeService || 'new-microservice');
        await this.forwardRequest(req, res, newTarget, correlationId);
        break;
      }

      case 'CANARY': {
        const weight = matchingRoute?.canaryWeightPercent || 0;
        const randomRoll = Math.random() * 100;
        const routeToNew = randomRoll <= weight;

        if (routeToNew) {
          res.setHeader('X-Canary-Roll', 'NEW');
          res.setHeader('X-Served-By', matchingRoute?.activeService || 'new-microservice');
          await this.forwardRequest(req, res, newTarget, correlationId);
        } else {
          res.setHeader('X-Canary-Roll', 'LEGACY');
          res.setHeader('X-Served-By', 'legacy-monolith');
          await this.forwardRequest(req, res, legacyTarget, correlationId);
        }
        break;
      }

      case 'SHADOW': {
        res.setHeader('X-Served-By', 'legacy-monolith');
        res.setHeader('X-Shadow-Active', 'true');

        // 1. Primary synchronous call to Legacy Monolith (authoritative for client)
        const legacyStart = Date.now();
        const legacyResponse = await this.executeInternalFetch(req, legacyTarget, correlationId);
        const legacyLatencyMs = Date.now() - legacyStart;

        // Immediately respond to user with legacy response
        res.status(legacyResponse.status);
        for (const [k, v] of Object.entries(legacyResponse.headers)) {
          if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k.toLowerCase())) {
            res.setHeader(k, v);
          }
        }
        res.send(legacyResponse.body);

        // 2. Asynchronous shadow call to Modern Microservice (read-only / shadow comparison)
        setImmediate(async () => {
          try {
            const newStart = Date.now();
            const newResponse = await this.executeInternalFetch(req, newTarget, correlationId);
            const newLatencyMs = Date.now() - newStart;

            let legacyParsed: unknown = legacyResponse.body;
            let newParsed: unknown = newResponse.body;

            try {
              if (typeof legacyResponse.body === 'string') legacyParsed = JSON.parse(legacyResponse.body);
              if (typeof newResponse.body === 'string') newParsed = JSON.parse(newResponse.body);
            } catch {
              // Not JSON
            }

            const { isEqual, differences } = comparePayloads(legacyParsed, newParsed);

            this.shadowDiffStore.recordDiff({
              path: req.originalUrl,
              method: req.method,
              correlationId,
              isEqual,
              legacyStatus: legacyResponse.status,
              newStatus: newResponse.status,
              legacyLatencyMs,
              newLatencyMs,
              differences,
            });

            if (!isEqual && process.env.NODE_ENV !== 'test') {
              console.warn(
                `[Shadow Diff Discrepancy] ${req.method} ${req.originalUrl} (${differences.length} diffs):`,
                differences,
              );
            }
          } catch (err) {
            console.error('[Shadow Execution Error]:', (err as Error).message);
          }
        });
        break;
      }

      case 'LEGACY':
      default: {
        res.setHeader('X-Served-By', 'legacy-monolith');
        await this.forwardRequest(req, res, legacyTarget, correlationId);
        break;
      }
    }
  }

  private async forwardRequest(
    req: Request,
    res: Response,
    targetBaseUrl: string,
    correlationId: string,
  ): Promise<void> {
    try {
      const response = await this.executeInternalFetch(req, targetBaseUrl, correlationId);
      res.status(response.status);
      for (const [key, val] of Object.entries(response.headers)) {
        if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(key.toLowerCase())) {
          res.setHeader(key, val);
        }
      }
      res.send(response.body);
    } catch (err) {
      console.error(`[Gateway Proxy Error] Target: ${targetBaseUrl}, Path: ${req.originalUrl}:`, err);
      res.status(502).json({
        error: 'Bad Gateway',
        message: `Failed to connect to upstream service at ${targetBaseUrl}`,
        details: (err as Error).message,
      });
    }
  }

  private async executeInternalFetch(
    req: Request,
    targetBaseUrl: string,
    correlationId: string,
  ): Promise<{ status: number; headers: Record<string, string>; body: string }> {
    const cleanBase = targetBaseUrl.replace(/\/$/, '');
    const url = `${cleanBase}${req.originalUrl}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Correlation-Id': correlationId,
    };

    const hasBody = ['POST', 'PUT', 'PATCH'].includes(req.method) && req.body;
    const bodyString = hasBody ? JSON.stringify(req.body) : undefined;

    const response = await fetch(url, {
      method: req.method,
      headers,
      body: bodyString,
    });

    const responseText = await response.text();
    const respHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      respHeaders[key] = value;
    });

    return {
      status: response.status,
      headers: respHeaders,
      body: responseText,
    };
  }
}
