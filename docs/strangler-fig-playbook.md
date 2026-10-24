# Strangler Fig Modernization Playbook & Rollback Runbook

This playbook documents the exact procedure used to strangle the legacy lending monolith into event-driven microservices without downtime.

---

## 1. Migration Philosophy: The Strangler Fig Pattern

Named by Martin Fowler after Australian strangler fig vines that take root in the upper branches of a host tree and gradually grow downward until the host tree dies and rots away, leaving a new hollow tree.

In software architecture:
1. **Never do a "Big Bang" rewrite:** Banking domain logic has edge cases, compliance constraints, and tacit business heuristics accumulated over years.
2. **Place an API Facade in front:** Intercept 100% of ingress before writing new code.
3. **Extract boundary by boundary:** Pick the cleanest seam with highest ROI (Credit Underwriting -> Bank Disbursement -> Loan Origination).
4. **Validate with Dark Traffic (Shadowing):** Run legacy and modern side-by-side on real production payloads without exposing users to risks.
5. **Gradual Canary Cutover:** Shift 5% -> 25% -> 50% -> 100% traffic based on automated latency and error rate SLIs.
6. **Decommission:** Delete legacy code and cold-archive the legacy database.

---

## 2. Step-by-Step Extraction Phases

### Phase 1: Ingress Facade Setup (Gateway)
- **Action:** Gateway deployed on port `3000`. Monolith on port `3001`.
- **Route Table:**
  - `/api/loans` -> `LEGACY` (100%)
  - `/api/credit/*` -> `LEGACY` (100%)
  - `/api/disbursements/*` -> `LEGACY` (100%)
- **Observability:** Correlation ID (`X-Correlation-Id`) injected into every request and passed downstream.

### Phase 2: Extract Credit Check (`credit-service`)
- **Seam Selection:** Underwriting is read-mostly and computationally self-contained.
- **Microservice Setup:** Own SQLite database (`credit_service.db`), REST endpoint `POST /api/credit/evaluate`, and event consumer on `loan.submitted`.
- **Anti-Corruption Layer (ACL):** Monolith calls `CreditServiceAclClient` via HTTP when `USE_REMOTE_CREDIT_SERVICE=true`.
- **Shadow Mode Validation:**
  - Route `/api/credit` switched to `SHADOW`.
  - Gateway returns Legacy response synchronously; duplicates request asynchronously to `credit-service`.
  - Automated deep JSON diff comparison records field mismatches.
- **Cutover Gate Criteria:**
  - 100% match rate over 10,000 requests.
  - Zero divergence on credit score calculation, DTI ratio, or decision tier.
  - Microservice latency must be <= 50% of legacy monolith latency.
- **Cutover:** Gateway route `/api/credit` flipped to `NEW`.

### Phase 3: Extract Disbursement (`disbursement-service`)
- **Seam Selection:** High financial risk requiring strict idempotency and resilience against external payment gateway timeouts.
- **Microservice Setup:** Own database (`disbursement_service.db`), durable queue binding to `loan.approved`, Transactional Outbox pattern, processed-messages idempotency table, and DLQ with exponential backoff.
- **Chaos Injection:** Validated with simulated network failure toggle to confirm compensation event `disbursement.failed` correctly rolls back saga.
- **Cutover:** Gateway route `/api/disbursements` flipped to `NEW`.

### Phase 4: Extract Loan Origination & Decommission (`loan-service`)
- **Seam Selection:** The final domain core.
- **Microservice Setup:** Own database (`loan_service.db`), accepts `POST /api/loans`, initiates saga via `loan.submitted`, listens to `credit.checked` and `disbursement.*`.
- **Cutover:** Gateway route `/api/loans` flipped to `NEW`.
- **Monolith Decommission:** Monolith traffic reduced to 0%. Monolith processes shutdown.

---

## 3. Automated Rollback Runbook

If anomalies occur during any migration stage, use the following instantaneous rollback runbook:

### Rollback Scenario A: Shadow Diff Discrepancies Detected
- **Trigger:** Match rate drops below 99.9% in `SHADOW` mode.
- **Action:** No client impact occurs because client responses are served by `LEGACY`.
- **Resolution:** Inspect `/admin/shadow-diffs` to pinpoint diverging field calculation. Fix heuristic in `credit-service` and re-deploy.

### Rollback Scenario B: High Error Rate or Latency Spike during Canary
- **Trigger:** 500 error rate > 0.05% or P99 latency > 250ms on canary traffic.
- **Immediate Command:**
  ```bash
  curl -X PUT http://localhost:3000/admin/routes \
    -H "Content-Type: application/json" \
    -d '{"pathPattern": "/api/loans", "mode": "LEGACY", "canaryWeightPercent": 0}'
  ```
- **Validation:** Verify Gateway response headers return `X-Route-Mode: LEGACY` and `X-Served-By: legacy-monolith`.
- **Recovery Time Objective (RTO):** < 50 milliseconds (in-memory route switch without service restart).
