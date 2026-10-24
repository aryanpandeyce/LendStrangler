# Architecture: LendStrangler Modernization

This document provides a technical walkthrough of the **LendStrangler** target architecture, covering C4 diagrams, container topologies, and distributed saga event choreography.

---

## 1. C4 System Context Diagram

The LendStrangler system facilitates automated commercial and personal loan underwriting and bank disbursement transfers, migrating from a legacy monolith into event-driven microservices.

```mermaid
C4Context
  title System Context: LendStrangler Lending Modernization

  Person(borrower, "Corporate Borrower / Applicant", "Applies for commercial credit facilities and tracks disbursement status.")
  Person(loanOfficer, "Credit Risk Officer", "Monitors underwriting thresholds, shadow diff match rates, and DLQ retries.")

  System_Boundary(b0, "LendStrangler Platform") {
    System(gateway, "Strangler Facade Gateway", "Reverse proxy intercepting 100% of ingress; manages dynamic route tables, canary weights, and shadow comparisons.")
    System(microservices, "Core Lending Microservices", "Decoupled domain services executing underwriting and disbursement via event choreography.")
    System(monolith, "Legacy Monolith (Decommissioned)", "Former MVC god service with tightly-coupled shared SQLite database.")
  }

  System_Ext(ach, "Banking ACH Rails / Core Banking", "External real-time automated clearing house payment rails.")

  Rel(borrower, gateway, "Submits loan applications and queries portfolio", "HTTPS / JSON")
  Rel(loanOfficer, gateway, "Configures traffic migration policies & monitors diffs", "HTTPS / Admin UI")
  Rel(gateway, microservices, "Routes 100% traffic in NEW mode", "HTTP / Reverse Proxy")
  Rel(gateway, monolith, "Proxied traffic during migration phases (0% currently)", "HTTP")
  Rel(microservices, ach, "Initiates disbursement transfers", "REST / ISO 20022")
```

---

## 2. C4 Container Diagram

```mermaid
C4Container
  title Container Diagram: Modernized Event-Choreographed Architecture

  Container(web, "Fintech Web Dashboard", "React 18, Vite, TypeScript, TailwindCSS", "Interactive Migration Control Room, Loan Journey, Broker Inspector, and Shadow Diff Viewer.")
  Container(gateway, "Strangler Gateway Facade", "Node.js 20, Express, TypeScript", "Dynamic route table, correlation ID propagation, shadow execution, canary traffic splitting.")

  System_Boundary(broker_boundary, "Message Broker Infrastructure") {
    ContainerDb(rabbitmq, "RabbitMQ Broker", "AMQP 0-9-1 Topic Exchange", "Durable queues, manual acknowledgments, dead-letter exchanges (DLX), exponential backoff.")
  }

  Container(loanSvc, "Loan Service", "Node.js 20, TypeScript, SQLite", "Originates applications, persists loan status, initiates and completes saga choreography.")
  Container(creditSvc, "Credit Service", "Node.js 20, TypeScript, SQLite", "Deterministic underwriting engine, Debt-to-Income (DTI) evaluation, risk tier scoring.")
  Container(disbSvc, "Disbursement Service", "Node.js 20, TypeScript, SQLite", "Transactional outbox, ledger entry generation, ACH payment gateway simulation, DLQ.")

  Rel(web, gateway, "API Requests & Route Configuration", "HTTPS / JSON")
  Rel(gateway, loanSvc, "Routes /api/loans", "HTTP")
  Rel(gateway, creditSvc, "Routes /api/credit", "HTTP")
  Rel(gateway, disbSvc, "Routes /api/disbursements", "HTTP")

  Rel(loanSvc, rabbitmq, "Publishes loan.submitted, consumes credit.checked, disbursement.*", "AMQP")
  Rel(creditSvc, rabbitmq, "Consumes loan.submitted, publishes credit.checked", "AMQP")
  Rel(disbSvc, rabbitmq, "Consumes loan.approved, publishes disbursement.completed / failed", "AMQP")
```

---

## 3. Sequence Diagram: Happy Path Loan Origination Saga

The saga uses **choreography**: services react to domain events published to the topic exchange without a central coordinator bottleneck.

```mermaid
sequenceDiagram
  autonumber
  actor Client as Borrower / Web UI
  participant GW as Gateway Facade
  participant LS as Loan Service
  participant Broker as Topic Exchange (Broker)
  participant CS as Credit Service
  participant DS as Disbursement Service

  Client->>GW: POST /api/loans (Application Payload)
  GW->>LS: Forward Request (X-Correlation-Id: corr-101)
  Note over LS: 1. Persists application in SUBMITTED status<br/>2. Writes loan.submitted to Transactional Outbox
  LS-->>GW: 201 Created (Application ID, status: SUBMITTED)
  GW-->>Client: 201 Created

  LS->>Broker: Publish loan.submitted (Outbox Relay)
  Broker->>CS: Deliver to queue: credit-service.loan-submitted

  Note over CS: 1. Check idempotency (processed_messages)<br/>2. Evaluate DTI ratio and Credit Score (750+)<br/>3. Persist evaluation in credit_evaluations
  CS->>Broker: Publish credit.checked (decision: APPROVED)

  Broker->>LS: Deliver to queue: loan-service.credit-checked
  Note over LS: 1. Updates loan status to APPROVED<br/>2. Computes final reducing-balance monthly EMI<br/>3. Writes loan.approved to Outbox
  LS->>Broker: Publish loan.approved

  Broker->>DS: Deliver to queue: disbursement-service.loan-approved
  Note over DS: 1. Check idempotency<br/>2. Create Ledger entry in disbursements<br/>3. Execute simulated ACH transfer<br/>4. Writes disbursement.completed to Outbox
  DS->>Broker: Publish disbursement.completed (ACH Ref: TXN-ACH-*)

  Broker->>LS: Deliver to queue: loan-service.disbursement-completed
  Note over LS: 1. Updates loan status to DISBURSED<br/>2. Records disbursement reference
```

---

## 4. Sequence Diagram: Failure & Compensation Saga Path

When an external payment rails failure occurs (or chaos is injected), the system executes compensating transactions to return the distributed system to a consistent terminal state.

```mermaid
sequenceDiagram
  autonumber
  actor Client as Borrower
  participant LS as Loan Service
  participant Broker as Topic Exchange
  participant DS as Disbursement Service

  Note over LS: Loan is APPROVED
  LS->>Broker: Publish loan.approved
  Broker->>DS: Deliver to queue: disbursement-service.loan-approved

  Note over DS: 1. Bank transfer fails (Network Timeout / Chaos)<br/>2. Retries exhausted -> Message routed to DLQ<br/>3. Writes compensation event to Outbox
  DS->>Broker: Publish disbursement.failed (COMPENSATION EVENT)

  Broker->>LS: Deliver to queue: loan-service.disbursement-failed
  Note over LS: SAGA COMPENSATION:<br/>1. Marks loan status as FAILED<br/>2. Records rejectionReason: "Disbursement Failed"<br/>3. Reversal audit entry logged
```
