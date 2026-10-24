# Enterprise Messaging & Event Catalog

This document details the event-driven architecture of LendStrangler, delivery guarantees, transactional outbox semantics, and a comprehensive mapping to enterprise **IBM MQ** and **Java Message Service (JMS)** concepts.

---

## 1. Domain Event Catalog

| Event Name | Schema Type | Producer | Consumers | Business Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `loan.submitted` | `LoanSubmittedPayload` | `loan-service` | `credit-service` | New loan application originated; requests automated underwriting score. |
| `credit.checked` | `CreditCheckedPayload` | `credit-service` | `loan-service` | Credit evaluation complete with score (300-900), decision, and DTI ratio. |
| `loan.approved` | `LoanApprovedPayload` | `loan-service` | `disbursement-service` | Loan passed underwriting; requests immediate fund disbursement to borrower account. |
| `loan.rejected` | `LoanRejectedPayload` | `loan-service` | `audit / notification` | Loan rejected due to policy violations (e.g. DTI > 50% or score < 650). |
| `disbursement.completed`| `DisbursementCompletedPayload`| `disbursement-service`| `loan-service` | Bank transfer completed via ACH rails; confirms disbursement reference. |
| `disbursement.failed` | `DisbursementFailedPayload` | `disbursement-service`| `loan-service` | Payment transfer aborted (compensation event); marks loan as FAILED. |

---

## 2. Delivery Guarantees & Consistency Patterns

### 2.1 At-Least-Once Delivery via Transactional Outbox
1. Services never write to the database and publish to the message broker in two separate uncoordinated steps (dual-write vulnerability).
2. Instead, domain entities and event payloads are committed to local SQLite storage in the same ACID transaction:
   ```sql
   BEGIN TRANSACTION;
   INSERT INTO disbursements (...) VALUES (...);
   INSERT INTO outbox_messages (id, topic, payload, status) VALUES (..., 'PENDING');
   COMMIT;
   ```
3. A background Outbox Relay polls for `PENDING` records, publishes them to the topic exchange, and updates the status to `PUBLISHED`.

### 2.2 Exactly-Once Processing via Idempotent Consumers
1. Because network timeouts can cause redeliveries, all consumers are strictly idempotent.
2. Every subscriber inspects the `processed_messages` table before executing side effects:
   ```sql
   INSERT INTO processed_messages (message_id, processed_at) VALUES (?, ?);
   ```
3. If an event ID already exists in the table, the consumer acknowledges (`ack`) and immediately skips processing.

### 2.3 Retry Policy & Dead Letter Queue (DLQ)
- **Retry Mechanism:** Exponential backoff with jitter:
  $$\text{Delay}(n) = \text{InitialDelay} \times 2^{n - 1}$$
- **Max Retries:** 3 attempts.
- **Dead Letter Routing:** When retries are exhausted, the message is un-requeued and sent to the Dead Letter Exchange (`lendstrangler.dlx`), landing in the DLQ (`disbursement-service.dlq`).

---

## 3. Enterprise Banking Mapping: RabbitMQ to IBM MQ & JMS

In corporate and investment banking legacy modernizations, engineers frequently interface with **IBM MQ (formerly MQSeries)** and **JMS**. The table below demonstrates how LendStrangler's AMQP abstraction maps directly to enterprise message queueing semantics:

| LendStrangler (AMQP 0-9-1) | IBM MQ Concept | JMS (Java Message Service) | Conceptual Function |
| :--- | :--- | :--- | :--- |
| **RabbitMQ Broker** | Queue Manager (`QMGR`) | `ConnectionFactory` / `Connection` | Message broker engine managing channels and storage. |
| **Topic Exchange (`lendstrangler.topic`)** | Topic Object / Pub/Sub Broker | `Topic` / `TopicPublisher` | Routes messages based on hierarchical wildcard patterns (`*.#`). |
| **Durable Queue (`durable: true`)** | Local Queue (`QLOCAL`) | `Queue` (with persistent store) | Messages survive broker restarts until consumed and acknowledged. |
| **Dead Letter Exchange (DLX)** | Dead Letter Queue (`SYSTEM.DEAD.LETTER.QUEUE`) | Poison Message Queue | Central landing point for unroutable or repeatedly failing messages. |
| **Dead Letter Queue (`*.dlq`)** | Backout Requeue Queue (`BOQNAME`) | DLQ / Backout Destination | Specific queue configured to capture exhausted retry messages. |
| **Manual Ack (`ch.ack(msg)`)** | `MQGET` with `MQGMO_SYNCPOINT` + `MQCMIT` | `Session.CLIENT_ACKNOWLEDGE` | Explicit consumer acknowledgment after local state is saved. |
| **Manual Nack (`ch.nack(msg, false, false)`)**| `MQBACK` (rolls back to backout queue)| `Session.recover()` | Negative acknowledgment triggering redelivery or dead-lettering. |
| **Retry Count (`headers['x-death']`)** | Backout Count (`MSGBACKOUT`) | JMS Delivery Count (`JMSXDeliveryCount`)| Number of unsuccessful delivery attempts before routing to backout queue. |
| **Persistent Message (`persistent: true`)** | `MQPER_PERSISTENT` | `DeliveryMode.PERSISTENT` | Message is written to disk log before acknowledgment. |
| **Correlation ID (`X-Correlation-Id`)** | Correlation Identifier (`CorrelId`) | `JMSCorrelationID` | Carried across distributed services for distributed tracing. |
