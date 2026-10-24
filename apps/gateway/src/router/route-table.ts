import { RouteMode, RouteRule } from '@lendstrangler/contracts';

export class RouteTable {
  private routes: Map<string, RouteRule> = new Map();

  constructor() {
    this.initDefaultRoutes();
  }

  private initDefaultRoutes() {
    const legacyUrl = process.env.LEGACY_SERVICE_URL || 'http://localhost:3001';
    const creditUrl = process.env.CREDIT_SERVICE_URL || 'http://localhost:3002';
    const disbursementUrl = process.env.DISBURSEMENT_SERVICE_URL || 'http://localhost:3003';
    const loanUrl = process.env.LOAN_SERVICE_URL || 'http://localhost:3004';

    this.routes.set('/api/loans', {
      pathPattern: '/api/loans',
      mode: 'NEW',
      canaryWeightPercent: 0,
      legacyTarget: legacyUrl,
      newTarget: loanUrl,
      activeService: 'loan-service',
      description: 'Loan Application Origination and Portfolio Management',
    });

    this.routes.set('/api/credit', {
      pathPattern: '/api/credit',
      mode: 'NEW',
      canaryWeightPercent: 0,
      legacyTarget: legacyUrl,
      newTarget: creditUrl,
      activeService: 'credit-service',
      description: 'Underwriting and Risk Evaluation Engine',
    });

    this.routes.set('/api/disbursements', {
      pathPattern: '/api/disbursements',
      mode: 'NEW',
      canaryWeightPercent: 0,
      legacyTarget: legacyUrl,
      newTarget: disbursementUrl,
      activeService: 'disbursement-service',
      description: 'Disbursement Ledger and Bank Transfer Gateway',
    });
  }

  public getAllRoutes(): RouteRule[] {
    return Array.from(this.routes.values());
  }

  public getRoute(pathPattern: string): RouteRule | undefined {
    return this.routes.get(pathPattern);
  }

  public matchRoute(requestPath: string): RouteRule | undefined {
    // Exact or prefix match sorted by length
    const sorted = Array.from(this.routes.values()).sort(
      (a, b) => b.pathPattern.length - a.pathPattern.length,
    );

    for (const route of sorted) {
      if (requestPath.startsWith(route.pathPattern)) {
        return route;
      }
    }
    return undefined;
  }

  public updateRoute(
    pathPattern: string,
    updates: Partial<Pick<RouteRule, 'mode' | 'canaryWeightPercent' | 'legacyTarget' | 'newTarget' | 'activeService'>>,
  ): RouteRule {
    const existing = this.routes.get(pathPattern);
    if (!existing) {
      throw new Error(`Route pattern "${pathPattern}" not found in routing table`);
    }

    const updated: RouteRule = {
      ...existing,
      ...updates,
      activeService:
        updates.mode === 'NEW'
          ? (pathPattern.includes('credit') ? 'credit-service' : pathPattern.includes('disburse') ? 'disbursement-service' : 'loan-service')
          : updates.mode === 'LEGACY'
          ? 'legacy-monolith'
          : `canary/shadow (${updates.mode})`,
    };

    this.routes.set(pathPattern, updated);
    return updated;
  }

  public setMode(pathPattern: string, mode: RouteMode, canaryPercent = 0): RouteRule {
    return this.updateRoute(pathPattern, { mode, canaryWeightPercent: canaryPercent });
  }

  public resetAll() {
    this.routes.clear();
    this.initDefaultRoutes();
  }
}
