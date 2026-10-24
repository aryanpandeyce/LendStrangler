# Testing Strategy & Quality Assurance

LendStrangler enforces a strict testing pyramid combining fast deterministic unit tests, multi-service in-memory saga integration tests, and schema contract verification.

---

## 1. Test Pyramid

| Test Tier | Focus Area | Framework | Target Execution Time |
| :--- | :--- | :--- | :--- |
| **Unit Tests** | Reducing-balance EMI math, DTI formulas, credit heuristics | Vitest | < 50ms |
| **Contract Tests** | Zod payload validation, schema conformance between producers/consumers | Vitest + Zod | < 80ms |
| **Service Integration** | Express routes + SQLite in-memory databases + supertest | Vitest + Supertest | < 250ms |
| **Saga Choreography** | Multi-service event flows (Loan -> Credit -> Disbursement -> Compensation) | Vitest + InMemoryBroker | < 1500ms |

---

## 2. Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests with 80%+ Domain Coverage
```bash
npm run test:coverage
```

### Run Typecheck Across All Workspaces
```bash
npm run typecheck
```

### Build All Workspaces
```bash
npm run build
```

---

## 3. End-to-End Saga Verification Scenarios

The suite in `services/loan-service/src/loan-service.test.ts` executes complete multi-service choreographies without spinning up slow external daemons:

1. **Happy Path:**
   `POST /api/loans` -> `loan.submitted` -> `credit.checked (APPROVED)` -> `loan.approved` -> `disbursement.completed` -> Loan status: `DISBURSED`.
2. **Compensation Path:**
   `POST /api/loans` -> `loan.submitted` -> `credit.checked (APPROVED)` -> `loan.approved` -> Bank transfer timeout -> `disbursement.failed` -> Loan status: `FAILED`.
3. **Automated Rejection Path:**
   `POST /api/loans` (High DTI applicant) -> `loan.submitted` -> `credit.checked (REJECTED)` -> `loan.rejected` -> Loan status: `REJECTED` (no disbursement attempted).
