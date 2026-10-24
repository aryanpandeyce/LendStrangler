import React, { useState } from 'react';
import { BookOpen } from 'lucide-react';

interface DocArticle {
  id: string;
  title: string;
  category: string;
  date: string;
  status: 'ACCEPTED' | 'IMPLEMENTED';
  content: string;
}

export const DocsViewer: React.FC = () => {
  const articles: DocArticle[] = [
    {
      id: 'adr-0001',
      title: 'ADR-0001: Strangler Fig Pattern over Big-Bang Rewrite',
      category: 'Architecture Decision Record',
      date: '2026-10-24',
      status: 'IMPLEMENTED',
      content: `### Context & Problem Statement
The legacy lending monolith is a single Express application tightly coupling loan applications, credit underwriting, and bank disbursements with a shared SQLite database. Big-bang rewrites in financial institutions have a documented >70% failure rate due to scope creep, loss of tacit domain rules, and massive cutover risk.

### Decision
Adopt Martin Fowler's Strangler Fig pattern using an API Gateway facade. The migration proceeds in discrete stages:
1. Intercept all traffic at Gateway facade.
2. Extract Credit Check service; validate via **SHADOW** traffic replication until diffs reach 0.00%.
3. Extract Bank Disbursement service with event-driven messaging, retries, and compensation.
4. Extract Loan Origination into an autonomous orchestrator using choreography.
5. Decommission the monolith only after 100% traffic is served by microservices.

### Consequences
- **Positive:** Zero downtime, instantaneous rollback capability per route, continuous business value delivery.
- **Negative:** Temporary operational complexity running both legacy and modern systems in parallel during the migration window.`,
    },
    {
      id: 'adr-0002',
      title: 'ADR-0002: RabbitMQ & IBM MQ / JMS Semantics over Kafka',
      category: 'Messaging & Integration',
      date: '2026-10-24',
      status: 'IMPLEMENTED',
      content: `### Context & Problem Statement
Lending workflows require discrete transactional message handling: individual message acknowledgments (ack/nack), dead-letter queues (poison message queues), redelivery counting (backout count), and selective topic routing.

### Decision
Use RabbitMQ (AMQP 0-9-1) with topic exchanges and dead-letter exchanges (DLX) rather than Apache Kafka.
- In corporate banking and legacy financial modernization, message semantics align closely with **IBM MQ** and **JMS**:
  - RabbitMQ Topic Exchange = IBM MQ Topic / JMS Topic
  - RabbitMQ Queue = IBM MQ Local Queue / JMS Queue
  - RabbitMQ Dead Letter Exchange (DLX) = IBM MQ Backout Requeue Queue (BOQNAME)
  - RabbitMQ x-death headers = IBM MQ Backout Count (MSGBACKOUT)
- Kafka is stream/log-oriented and optimized for high-volume partition replays (e.g. market data feeds, clickstreams), whereas RabbitMQ excels in transactional task queuing, exponential backoff retries, and individual message DLQ workflows.

### Consequences
- True point-to-point worker queues with individual acknowledgments.
- Direct mapping to traditional IBM MQ / JMS enterprise banking infrastructure.`,
    },
    {
      id: 'adr-0003',
      title: 'ADR-0003: Choreography vs Orchestration for Loan Lifecycle',
      category: 'Distributed Systems',
      date: '2026-10-24',
      status: 'IMPLEMENTED',
      content: `### Context & Problem Statement
The legacy monolith coordinated loan approval and bank disbursement through synchronous cascading function calls inside a single HTTP request lifecycle. Any downstream network hiccup caused the entire transaction to abort or leave database state inconsistent.

### Decision
Adopt **Saga by Choreography** over a central orchestrator.
- Each microservice consumes domain events and publishes new events upon state transitions:
  \`loan.submitted\` -> Credit Service consumes -> emits \`credit.checked\`
  \`credit.checked\` -> Loan Service consumes -> emits \`loan.approved\`
  \`loan.approved\` -> Disbursement Service consumes -> emits \`disbursement.completed\` | \`disbursement.failed\`
  \`disbursement.failed\` -> Loan Service consumes -> compensation marks loan as \`FAILED\`.

### Consequences
- Decoupled deployability: Services operate autonomously without central bottleneck.
- High resilience: If Disbursement Service is temporarily down, messages wait safely in durable queues without blocking upstream loan origination.`,
    },
    {
      id: 'adr-0004',
      title: 'ADR-0004: Transactional Outbox Pattern & Idempotency',
      category: 'Data Consistency',
      date: '2026-10-24',
      status: 'IMPLEMENTED',
      content: `### Context & Problem Statement
In distributed architectures, dual-write vulnerabilities occur when updating a local database and publishing a message to a broker. If the broker is unreachable or the application crashes between the two steps, state becomes corrupted.

### Decision
Implement the **Transactional Outbox Pattern**:
1. Business entity updates and domain event payloads are saved in the same local ACID transaction into an \`outbox_messages\` table.
2. A relay poller reads pending outbox messages, publishes to the broker, and marks them published.
3. Every consumer maintains a \`processed_messages\` table to guarantee idempotent deduplication against duplicate deliveries.

### Consequences
- Guarantees at-least-once publishing without distributed two-phase commit (2PC/XA).
- Consumer idempotency guarantees exactly-once processing semantics.`,
    },
    {
      id: 'playbook',
      title: 'Strangler Fig Modernization Playbook & Rollback Criteria',
      category: 'DevOps & Migration Runbook',
      date: '2026-10-24',
      status: 'IMPLEMENTED',
      content: `### Traffic Migration Phases
1. **Phase 1: Ingress Interception (100% LEGACY)**
   All traffic enters Gateway facade; 100% routed to monolith. Monolith baseline latencies and error rates monitored.
2. **Phase 2: Dark Launch / Shadow Mode (SHADOW)**
   Client requests sent to Legacy monolith synchronously; Gateway duplicates requests to Modern Microservice asynchronously. Latencies, statuses, and response payloads compared.
   - *Promotion Criteria:* Match rate must be >= 99.9% with 0 business logic discrepancies for 48 consecutive hours.
3. **Phase 3: Canary Rollout (CANARY 5% -> 25% -> 50% -> 100%)**
   Gradual traffic shift. Automated rollback triggered if error rate exceeds 0.1% or latency increases by >20%.
4. **Phase 4: Monolith Decommissioning (100% NEW)**
   Monolith route rules removed. Monolith database archived to cold storage. Service turned off.`,
    },
  ];

  const [activeArticleId, setActiveArticleId] = useState(articles[0].id);
  const activeArticle = articles.find((a) => a.id === activeArticleId) || articles[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Table of Contents Sidebar */}
      <div className="lg:col-span-4 space-y-3">
        <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
          <BookOpen className="w-4 h-4 text-indigo-400" />
          <span>Architecture Decision Records</span>
        </div>

        <div className="space-y-1.5">
          {articles.map((article) => {
            const isActive = article.id === activeArticleId;
            return (
              <button
                key={article.id}
                onClick={() => setActiveArticleId(article.id)}
                className={`w-full text-left p-3.5 rounded-xl border transition-all ${
                  isActive
                    ? 'bg-indigo-950/40 border-indigo-500/40 text-white shadow-md shadow-indigo-950/30'
                    : 'glass-card border-slate-800 text-slate-400 hover:text-white hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase font-bold text-indigo-400">{article.category}</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    {article.status}
                  </span>
                </div>
                <div className="text-xs font-semibold line-clamp-1">{article.title}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Article Content Display */}
      <div className="lg:col-span-8">
        <div className="glass-card rounded-2xl p-8 border border-slate-800 space-y-6">
          <div className="border-b border-slate-800 pb-5">
            <div className="flex items-center gap-2 text-xs text-indigo-400 font-semibold uppercase tracking-wider mb-1">
              <span>{activeArticle.category}</span>
              <span>•</span>
              <span className="font-mono text-slate-400">{activeArticle.date}</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {activeArticle.title}
            </h2>
          </div>

          <div className="prose prose-invert max-w-none text-slate-300 text-sm space-y-4 leading-relaxed font-sans">
            {activeArticle.content.split('\n\n').map((paragraph, index) => {
              if (paragraph.startsWith('### ')) {
                return (
                  <h3 key={index} className="text-base font-bold text-white pt-2 border-b border-slate-800/60 pb-1">
                    {paragraph.replace('### ', '')}
                  </h3>
                );
              }
              if (paragraph.startsWith('- ')) {
                return (
                  <ul key={index} className="list-disc pl-5 space-y-1.5 text-slate-300">
                    {paragraph.split('\n').map((item, itemIdx) => (
                      <li key={itemIdx}>{item.replace('- ', '')}</li>
                    ))}
                  </ul>
                );
              }
              if (paragraph.startsWith('1. ') || paragraph.startsWith('`')) {
                return (
                  <div key={index} className="p-3 bg-black/40 rounded-xl border border-slate-800 font-mono text-xs text-indigo-200">
                    {paragraph}
                  </div>
                );
              }
              return <p key={index}>{paragraph}</p>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
