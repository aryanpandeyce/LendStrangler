# ADR-0002: RabbitMQ & IBM MQ / JMS Semantics over Apache Kafka

## Status
Accepted & Implemented

## Context
Event-driven communication is required between Loan, Credit, and Disbursement services. We evaluated **RabbitMQ (AMQP 0-9-1)** vs **Apache Kafka**.

## Decision
We chose **RabbitMQ** for the lending domain:
1. **Transactional Messaging Semantics:** Lending workflows require discrete individual message acknowledgments (`ack`/`nack`), dead-letter exchanges (DLX), and backout counts.
2. **Exponential Backoff & DLQ Replay:** In RabbitMQ, individual failing messages can be redelivered with exponential backoff or isolated into a Dead Letter Queue without stalling partition offsets. In Kafka, a head-of-line blocking problem occurs because consumers cannot nack an individual record within a partition without advancing the partition offset or maintaining complex side-queues.
3. **Enterprise Alignment:** RabbitMQ's topic exchanges, durable queues, and DLQ semantics map 1:1 to enterprise **IBM MQ (formerly MQSeries)** and **Java Message Service (JMS)**, making this architecture directly relatable to enterprise banking staff.

### When Kafka Would Be Chosen
Kafka would be selected if the use case shifted to append-only streaming logs: high-throughput market tick data, audit event sourcing with infinite retention, or analytics clickstreams. For discrete transactional banking sagas, RabbitMQ is the superior architectural fit.

## Consequences
- **Positive:** Point-to-point worker queues with individual acks; native dead-letter queues; direct parity with legacy IBM MQ / JMS installations.
- **Negative:** Lower raw ingestion throughput compared to Kafka partition logs, though well beyond requirements for transactional loan origination.
