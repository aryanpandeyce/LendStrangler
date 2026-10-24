# Production Operations Runbook

This runbook provides actionable procedures for managing routing policies, recovering Dead Letter Queue (DLQ) messages, and executing rollbacks.

---

## 1. Dead Letter Queue (DLQ) Recovery & Replay

When downstream payment networks experience transient outages or rate-limiting, messages exhaust their retries (3 attempts) and land in `disbursement-service.dlq`.

### 1.1 Inspecting DLQ Messages via API
```bash
curl -X GET http://localhost:3000/api/disbursements/dlq
```

### 1.2 Replaying a Failed Message
Once downstream network availability is verified, replay the message using the Gateway API or Web Dashboard:
```bash
curl -X POST http://localhost:3000/api/disbursements/dlq/replay \
  -H "Content-Type: application/json" \
  -d '{"messageId": "msg-1792880041941-3voa9fm"}'
```
*Effect:* The message is cleared from the DLQ, its retry counter is reset to 0, and it is published back to `lendstrangler.topic` for immediate reprocessing.

---

## 2. Instantaneous Route Rollback

If a defect is detected in a modern service during Canary or New routing modes, rollback to the legacy monolith takes effect immediately without restarting any service.

### 2.1 Rollback a Route to 100% Legacy Monolith
```bash
curl -X PUT http://localhost:3000/admin/routes \
  -H "Content-Type: application/json" \
  -d '{
    "pathPattern": "/api/loans",
    "mode": "LEGACY",
    "canaryWeightPercent": 0
  }'
```

### 2.2 Verify Current Route Routing Modes
```bash
curl -X GET http://localhost:3000/admin/routes
```

---

## 3. Shadow Traffic Inspection

Before promoting any extracted service from `SHADOW` to `CANARY`, review parity telemetry:

```bash
curl -X GET http://localhost:3000/admin/shadow-diffs?limit=50
```

Verify:
- `matchRatePercent` is `100.0%`.
- `differences` array is empty `[]`.
- `latencySavingsMs` is positive (indicating modern service is faster than the monolith).
