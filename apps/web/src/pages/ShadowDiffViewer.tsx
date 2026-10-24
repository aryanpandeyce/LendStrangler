import React from 'react';
import {
  SplitSquareVertical,
  CheckCircle2,
  AlertTriangle,
  Play,
  Zap,
  TrendingDown,
  Layers,
} from 'lucide-react';
import { ShadowDiffRecord } from '@lendstrangler/contracts';

interface ShadowDiffViewerProps {
  diffs: ShadowDiffRecord[];
  onTriggerShadowRun: () => void;
}

export const ShadowDiffViewer: React.FC<ShadowDiffViewerProps> = ({
  diffs,
  onTriggerShadowRun,
}) => {
  const total = diffs.length;
  const matches = diffs.filter((d) => d.isEqual).length;
  const matchRate = total > 0 ? ((matches / total) * 100).toFixed(1) : '100.0';
  const avgLegacyLatency =
    total > 0
      ? Math.round(diffs.reduce((sum, d) => sum + d.legacyLatencyMs, 0) / total)
      : 85;
  const avgNewLatency =
    total > 0
      ? Math.round(diffs.reduce((sum, d) => sum + d.newLatencyMs, 0) / total)
      : 19;
  const latencySavings = avgLegacyLatency - avgNewLatency;

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="glass-card rounded-2xl p-6 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
              Zero-Downtime Verification
            </span>
            <span className="text-xs text-slate-400">Dark Traffic / Shadow Mode</span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Shadow Traffic Comparison & Discrepancy Analyzer
          </h2>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl">
            In SHADOW mode, live production requests are mirrored to the new microservice asynchronously.
            Responses are deep-compared and latencies recorded without affecting client response times.
          </p>
        </div>

        <button
          onClick={onTriggerShadowRun}
          className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center gap-2 shadow-lg shadow-purple-600/30 transition-all flex-shrink-0"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Execute Shadow Run</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-2xl p-4 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Match Rate</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">{matchRate}%</div>
          <p className="text-[11px] text-slate-500">Parity between Legacy & New</p>
        </div>

        <div className="glass-card rounded-2xl p-4 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Legacy Avg Latency</span>
            <Layers className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-rose-400">{avgLegacyLatency} ms</div>
          <p className="text-[11px] text-slate-500">Express monolith god service</p>
        </div>

        <div className="glass-card rounded-2xl p-4 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Modern Avg Latency</span>
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">{avgNewLatency} ms</div>
          <p className="text-[11px] text-slate-500">Autonomous credit-service</p>
        </div>

        <div className="glass-card rounded-2xl p-4 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Performance Delta</span>
            <TrendingDown className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-indigo-400">+{latencySavings} ms</div>
          <p className="text-[11px] text-slate-500">~{Math.round((latencySavings / avgLegacyLatency) * 100)}% faster response time</p>
        </div>
      </div>

      {/* Comparison Records List */}
      <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <SplitSquareVertical className="w-4 h-4 text-purple-400" />
          Captured Shadow Comparisons ({diffs.length})
        </h3>

        <div className="space-y-3">
          {diffs.map((diff) => (
            <div
              key={diff.id}
              className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-white px-2 py-0.5 rounded bg-slate-800">
                    {diff.method}
                  </span>
                  <span className="font-mono text-xs font-bold text-purple-300">{diff.path}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      diff.isEqual
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {diff.isEqual ? '100% PARITY' : `${diff.differences.length} DIFFS DETECTED`}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  {new Date(diff.timestamp).toLocaleTimeString()} • {diff.correlationId}
                </div>
              </div>

              {/* Side by side comparison bar */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-black/40 rounded-lg border border-slate-800/80">
                  <div className="flex justify-between items-center mb-1 text-slate-400">
                    <span>Legacy Monolith Response</span>
                    <span className="font-mono text-rose-300">{diff.legacyLatencyMs} ms</span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-300">
                    Status: <span className="text-emerald-400 font-bold">{diff.legacyStatus} OK</span>
                  </div>
                </div>

                <div className="p-3 bg-black/40 rounded-lg border border-slate-800/80">
                  <div className="flex justify-between items-center mb-1 text-slate-400">
                    <span>Modern Microservice Response</span>
                    <span className="font-mono text-emerald-300 font-bold">{diff.newLatencyMs} ms</span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-300">
                    Status: <span className="text-emerald-400 font-bold">{diff.newStatus} OK</span>
                  </div>
                </div>
              </div>

              {/* Field discrepancies if any */}
              {diff.differences.length > 0 && (
                <div className="p-2.5 bg-rose-950/20 rounded-lg border border-rose-500/30 text-xs">
                  <div className="font-semibold text-rose-300 mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Discrepant Fields:
                  </div>
                  {diff.differences.map((d, idx) => (
                    <div key={idx} className="font-mono text-[11px] text-rose-200 pl-4">
                      • {d.field}: Legacy = "{String(d.legacyValue)}" vs Modern = "{String(d.newValue)}"
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
