# ADR-0006: In-Memory Dual-Mode Engine for Browser & Live Docker Execution

## Status
Accepted & Implemented

## Context
Portfolio and enterprise demonstration systems often require complex setup instructions (Docker, RabbitMQ, multiple databases, local environment configuration). Reviewers and hiring managers rarely have time to clone and build multi-container topologies just to review an architecture.

## Decision
We implemented a **Dual-Mode Engine Architecture**:
1. **DEMO Mode (Default on GitHub Pages):**
   - The web dashboard runs a browser-simulated backend engine (`SimulatedBackendEngine`).
   - Uses the exact same shared domain code (`@lendstrangler/contracts`: reducing-balance EMI formula, deterministic credit scoring).
   - Uses the exact same message broker interface (`@lendstrangler/messaging`: `InMemoryBroker` with topic matching, retries, DLQ, and replay).
   - Zero servers or Docker required: hiring managers can immediately test the saga, simulate chaos, inspect shadow diffs, and replay DLQ messages right in their browser.
2. **API Mode (Docker Compose):**
   - When configured with `VITE_DEMO_MODE=false`, the UI connects via HTTP to the real Gateway facade (`PORT 3000`), proxying to real Node.js microservices and a live RabbitMQ broker.

## Consequences
- **Positive:** Zero friction live demonstration on static hosting (GitHub Pages); 100% fidelity with the production contracts and domain math.
- **Negative:** Dual runtime targets require shared packages to be free of server-only native binary bindings (solved by modularizing `InMemoryBroker` separate from `amqplib`).
