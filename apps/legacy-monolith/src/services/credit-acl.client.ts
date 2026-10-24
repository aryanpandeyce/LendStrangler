import { CreditCheckApiRequest, CreditScoreResult, evaluateCreditScore } from '@lendstrangler/contracts';

/**
 * Strangler Fig: Anti-Corruption Layer (ACL) Client
 *
 * Allows the legacy monolith to translate internal calls and delegate credit scoring
 * to the extracted modern credit-service microservice.
 */
export class CreditServiceAclClient {
  private creditServiceUrl: string;
  private useRemoteService: boolean;

  constructor(options?: { creditServiceUrl?: string; useRemoteService?: boolean }) {
    this.creditServiceUrl =
      options?.creditServiceUrl ||
      process.env.CREDIT_SERVICE_URL ||
      'http://localhost:3002';
    this.useRemoteService =
      options?.useRemoteService ?? (process.env.USE_REMOTE_CREDIT_SERVICE === 'true');
  }

  public async evaluateCredit(
    params: CreditCheckApiRequest,
    correlationId?: string,
  ): Promise<CreditScoreResult> {
    if (!this.useRemoteService) {
      // Legacy in-process fallback
      return evaluateCreditScore(params);
    }

    try {
      const response = await fetch(`${this.creditServiceUrl}/api/credit/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-Id': correlationId || `corr-acl-${Date.now()}`,
          'X-Client': 'legacy-monolith-acl',
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error(`Remote credit-service returned HTTP ${response.status}`);
      }

      return (await response.json()) as CreditScoreResult;
    } catch (err) {
      console.warn(
        `[Legacy Monolith ACL] Remote credit-service call failed: ${(err as Error).message}. Falling back to internal engine.`,
      );
      return evaluateCreditScore(params);
    }
  }
}
