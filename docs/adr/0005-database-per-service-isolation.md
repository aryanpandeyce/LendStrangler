# ADR-0005: Database-per-Service Isolation Pattern

## Status
Accepted & Implemented

## Context
In the legacy monolith, Loan, Credit, and Disbursement code directly joined tables across domain boundaries (`applications`, `credit_evaluations`, `disbursements`). This created tight schema coupling where changing a column in one table broke queries across unrelated services.

## Decision
We enforced the **Database-per-Service Pattern**:
1. `loan-service` owns `loan_service.db`.
2. `credit-service` owns `credit_service.db`.
3. `disbursement-service` owns `disbursement_service.db`.
4. No microservice has network access or credentials to query another microservice's database directly.
5. All data sharing occurs exclusively through explicit versioned API schemas (`@lendstrangler/contracts`) or domain events.

## Consequences
- **Positive:** True autonomous deployability; independent database schema migrations; elimination of cross-domain database locks.
- **Negative:** Queries spanning multiple domains (e.g. portfolio reporting) cannot use relational joins; data must be joined via API composition or CQRS read models.
