# Changelog

All notable changes to the **LendStrangler** project are documented in this file in accordance with [Conventional Commits](https://www.conventionalcommits.org/).

---

## [1.0.0] - 2026-10-25 (v1.0-live)
### Added
- Complete modern fintech React 18 + Vite + TypeScript dashboard (`apps/web`) with dark/light themes, Tailwind styling, and Framer Motion animations.
- Interactive Migration Control Room with visual architecture topology and dynamic route table mutation.
- Real-time Loan Journey saga event timeline with live reducing-balance EMI preview.
- Message Broker & DLQ inspector with message replay and chaos toggle.
- Shadow Traffic Diff Analyzer comparing legacy monolith vs modern microservice payloads.
- Comprehensive C4 architecture diagrams, Strangler Fig Playbook, 6 Architecture Decision Records (ADRs), and IBM MQ / JMS enterprise comparison guides.
- Docker Compose multi-container stack (`docker-compose.yml`) and GitHub Actions workflows (`ci.yml`, `pages.yml`).

## [0.5.0] - 2026-10-25 (v0.5-loan-service)
### Added
- Extracted autonomous `loan-service` with dedicated SQLite storage (`loan_service.db`).
- Distributed saga by choreography (`loan.submitted` -> `credit.checked` -> `loan.approved` -> `disbursement.completed` | `disbursement.failed`).
- Compensation event handler marking loans as `FAILED` on bank payment failure.
- Gateway routing flipped 100% to NEW microservices; legacy monolith decommissioned.

## [0.4.0] - 2026-10-25 (v0.4-disbursement-service)
### Added
- Extracted event-driven `disbursement-service` with dedicated SQLite storage (`disbursement_service.db`).
- Transactional Outbox pattern guaranteeing reliable event publishing without dual-write anomalies.
- Idempotent message deduplication table (`processed_messages`).
- Exponential backoff retries and Dead Letter Queue (`disbursement-service.dlq`).
- Configurable chaos failure injection and compensation event emission (`disbursement.failed`).

## [0.3.0] - 2026-10-25 (v0.3-credit-service)
### Added
- Extracted underwriting `credit-service` with dedicated SQLite storage (`credit_service.db`).
- REST endpoint `POST /api/credit/evaluate` and event consumer for `loan.submitted`.
- Anti-Corruption Layer (ACL) client in monolith (`CreditServiceAclClient`).
- Dark traffic / Shadow mode testing with automated deep JSON diff comparisons.

## [0.2.0] - 2026-10-25 (v0.2-gateway)
### Added
- Strangler Facade reverse proxy Gateway (`apps/gateway`) on port 3000.
- Dynamic route table supporting `LEGACY`, `NEW`, `SHADOW`, and `CANARY` (%) policies.
- Correlation ID propagation (`X-Correlation-Id`) and structured JSON request logging.
- Admin route inspection and mutation APIs (`/admin/routes`, `/admin/shadow-diffs`).

## [0.1.0] - 2026-10-25 (v0.1-monolith)
### Added
- Tightly-coupled Express + SQLite legacy monolith (`apps/legacy-monolith`) on port 3001.
- Intentional legacy smells: "God Service", shared database tables, cascaded synchronous blocking calls.
- Pre-seeded corporate banking applications and comprehensive integration tests.

## [0.0.1] - 2026-10-25 (Scaffold)
### Added
- Monorepo workspace configuration, TypeScript strict config, Vitest with 80%+ domain threshold, ESLint 9, Prettier, and Husky commitlint hooks.
- Shared `@lendstrangler/contracts` (reducing-balance EMI math, underwriting heuristics, Zod schemas, domain events).
- Shared `@lendstrangler/messaging` (broker interface, in-memory broker with wildcards/DLQ/replay, RabbitMQ adapter).
