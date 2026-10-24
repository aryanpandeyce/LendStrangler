import React, { useState } from 'react';
import {
  Network,
  RefreshCw,
  Flame,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import { QueueMetrics, MessageEnvelope } from '@lendstrangler/messaging';

interface BrokerInspectorProps {
  metrics: QueueMetrics[];
  dlqMessages: MessageEnvelope<unknown>[];
  onReplayDlq: (messageId: string) => Promise<void>;
  chaosEnabled: boolean;
  onToggleChaos: (enabled: boolean) => void;
}

export const BrokerInspector: React.FC<BrokerInspectorProps> = ({
  metrics,
  dlqMessages,
  onReplayDlq,
  chaosEnabled,
  onToggleChaos,
}) => {
  const [replayingId, setReplayingId] = useState<string | null>(null);

  const handleReplay = async (id: string) => {
    setReplayingId(id);
    try {
      await onReplayDlq(id);
    } finally {
      setReplayingId(null);
    }
  };

  const defaultQueues: QueueMetrics[] = [
    {
      queueName: 'credit-service.loan-submitted',
      topicPattern: 'loan.submitted',
      messageCount: 14,
      consumerCount: 1,
      ackCount: 14,
      nackCount: 0,
      dlqCount: 0,
    },
    {
      queueName: 'loan-service.credit-checked',
      topicPattern: 'credit.checked',
      messageCount: 14,
      consumerCount: 1,
      ackCount: 14,
      nackCount: 0,
      dlqCount: 0,
    },
    {
      queueName: 'disbursement-service.loan-approved',
      topicPattern: 'loan.approved',
      messageCount: 11,
      consumerCount: 1,
      ackCount: chaosEnabled ? 9 : 11,
      nackCount: chaosEnabled ? 2 : 0,
      dlqCount: dlqMessages.length,
    },
    {
      queueName: 'loan-service.disbursement-completed',
      topicPattern: 'disbursement.completed',
      messageCount: 9,
      consumerCount: 1,
      ackCount: 9,
      nackCount: 0,
      dlqCount: 0,
    },
  ];

  const activeQueues = metrics.length > 0 ? metrics : defaultQueues;

  return (
    <div className="space-y-8">
      {/* Broker Overview Header */}
      <div className="glass-card rounded-2xl p-6 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              RabbitMQ & IBM MQ Semantics
            </span>
            <span className="text-xs text-slate-400">AMQP 0-9-1 Topic Exchange</span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Message Broker & Dead Letter Queue (DLQ) Inspector
          </h2>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            Inspect durable subscriber queues, monitor exponential backoff retries, and recover poison messages
            routed to the Dead Letter Queue.
          </p>
        </div>

        {/* Chaos Engineering Toggle */}
        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Flame className={`w-5 h-5 ${chaosEnabled ? 'text-amber-400 animate-bounce' : 'text-slate-500'}`} />
            <div>
              <div className="text-xs font-bold text-white">Disbursement Chaos</div>
              <div className="text-[10px] text-slate-400">Force Transfer Failure</div>
            </div>
          </div>
          <button
            onClick={() => onToggleChaos(!chaosEnabled)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              chaosEnabled
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/30'
                : 'bg-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            {chaosEnabled ? 'CHAOS ACTIVE' : 'ENABLE CHAOS'}
          </button>
        </div>
      </div>

      {/* Active Queues Grid */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Network className="w-4 h-4 text-indigo-400" />
          Durable Service Queues
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {activeQueues.map((q) => (
            <div
              key={q.queueName}
              className="glass-card rounded-2xl p-4 border border-slate-800 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-white truncate max-w-[180px]">
                  {q.queueName}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                  Durable
                </span>
              </div>

              <div className="text-[11px] text-slate-400">
                Topic Binding: <span className="font-mono text-indigo-300 font-semibold">{q.topicPattern}</span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono">
                <div className="bg-slate-900/80 p-2 rounded-lg">
                  <div className="text-[9px] text-slate-400">Delivered</div>
                  <div className="text-sm font-bold text-white">{q.messageCount}</div>
                </div>
                <div className="bg-slate-900/80 p-2 rounded-lg">
                  <div className="text-[9px] text-slate-400">Acked</div>
                  <div className="text-sm font-bold text-emerald-400">{q.ackCount}</div>
                </div>
                <div className="bg-slate-900/80 p-2 rounded-lg">
                  <div className="text-[9px] text-slate-400">DLQ / Nack</div>
                  <div className={`text-sm font-bold ${q.nackCount > 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                    {q.nackCount}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dead Letter Queue (DLQ) Inspector */}
      <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <h3 className="text-base font-bold text-white">Dead Letter Queue (disbursement.dlq)</h3>
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
              {dlqMessages.length} Messages
            </span>
          </div>
          <span className="text-xs text-slate-400">IBM MQ: Backout Queue • JMS Poison Queue</span>
        </div>

        {dlqMessages.length === 0 ? (
          <div className="text-center py-10 bg-slate-900/40 rounded-xl border border-dashed border-slate-800">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
            <div className="text-sm font-medium text-slate-300">DLQ is currently clean</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              No failed messages in the backout queue. Toggle "Disbursement Chaos" above and originate a loan
              to watch failed transfers route here after exhausting max retries!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {dlqMessages.map((msg) => (
              <div
                key={msg.id}
                className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-white">{msg.topic}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300">
                      Retries: {msg.retryCount}/{msg.maxRetries}
                    </span>
                  </div>
                  <div className="text-xs text-rose-200">
                    Reason: <span className="font-mono font-semibold">{String(msg.headers['lastError'] || 'Transfer network timeout')}</span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-400">
                    ID: {msg.id} • Correlation: {msg.correlationId}
                  </div>
                </div>

                <button
                  onClick={() => handleReplay(msg.id)}
                  disabled={replayingId === msg.id}
                  className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/30 transition-all flex-shrink-0 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${replayingId === msg.id ? 'animate-spin' : ''}`} />
                  <span>{replayingId === msg.id ? 'Replaying...' : 'Replay Message'}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
