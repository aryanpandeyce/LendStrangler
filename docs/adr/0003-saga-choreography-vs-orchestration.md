# ADR-0003: Saga by Choreography vs Centralized Orchestration

## Status
Accepted & Implemented

## Context
A loan application spans multiple microservices: underwriting evaluation, risk tier classification, and payment disbursement. In the legacy monolith, this was executed synchronously in a single request chain, leading to high latency and cascading failure modes.

## Decision
We implemented a **Distributed Saga by Choreography**:
1. Services do not depend on a central orchestration server (e.g. Temporal, Camunda, AWS Step Functions).
2. Instead, services react autonomously to published domain events:
   - `loan.submitted` -> Credit Service consumes -> publishes `credit.checked`.
   - `credit.checked` -> Loan Service consumes -> publishes `loan.approved`.
   - `loan.approved` -> Disbursement Service consumes -> publishes `disbursement.completed` or `disbursement.failed`.
   - `disbursement.failed` -> Loan Service consumes -> triggers compensation by marking loan as `FAILED`.

## Consequences
- **Positive:** Zero central point of failure; loose coupling; services can be developed, tested, and scaled completely independently.
- **Negative:** Event flow can be harder to visualize without comprehensive distributed tracing (solved by enforcing correlation IDs: `X-Correlation-Id`).
