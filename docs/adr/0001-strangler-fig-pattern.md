# ADR-0001: Strangler Fig Pattern over Big-Bang Rewrite

## Status
Accepted & Implemented

## Context
The legacy corporate lending monolith was built as a single Express application with a shared SQLite database. The business requires modernizing to autonomous microservices to improve reliability, scale individual workloads independently, and accelerate product feature velocity.

Big-bang rewrites in financial institutions have a historically catastrophic failure rate (>70%) due to:
1. Long multi-year delivery timelines without incremental value.
2. Incomplete knowledge transfer leading to dropped business edge cases.
3. All-or-nothing cutover risk that can disrupt critical banking operations.

## Decision
We adopted Martin Fowler's **Strangler Fig Pattern**:
1. Place an API Gateway facade in front of the existing monolith to intercept 100% of ingress.
2. Incrementally extract vertical slices (Credit Underwriting, then Bank Disbursement, then Loan Origination).
3. Validate candidate microservices using **Shadow Mode (Dark Traffic)**: duplicate live production requests asynchronously to the new service and verify zero diffs before shifting any customer traffic.
4. Perform gradual **Canary Cutover** (5% -> 25% -> 50% -> 100%) with automated instantaneous rollback capabilities.
5. Decommission the monolith only after all routes are 100% migrated and stable.

## Consequences
- **Positive:** Zero planned downtime; real-time validation via production traffic; instantaneous route rollback via in-memory route table update without restarting servers.
- **Negative:** Requires running dual systems and an Anti-Corruption Layer (ACL) during the interim migration window.
