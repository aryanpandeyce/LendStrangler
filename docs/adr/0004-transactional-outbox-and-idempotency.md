# ADR-0004: Transactional Outbox Pattern & Consumer Idempotency

## Status
Accepted & Implemented

## Context
When a service modifies its local state and publishes an event, a network split or process crash between the database commit and the broker publish causes dual-write anomalies (either the event is lost, or the database write is rolled back while the event is published).

## Decision
We implemented the **Transactional Outbox Pattern** alongside **Idempotent Consumers**:
1. Business entity updates and domain event payloads are saved atomically in the same local ACID transaction into `outbox_messages`.
2. An Outbox Relay processor reads pending messages, publishes them to RabbitMQ, and updates their status to `PUBLISHED`.
3. Every subscriber maintains a `processed_messages` deduplication table. Before executing any business action, the consumer attempts an insert of the message ID. If already present, the consumer acknowledges and skips execution.

## Consequences
- **Positive:** Guaranteed at-least-once message delivery without distributed transactions (2PC/XA); exactly-once processing guarantees across all consumers.
- **Negative:** Small latency overhead from polling the outbox table (mitigated by immediate dispatch via `setImmediate`).
