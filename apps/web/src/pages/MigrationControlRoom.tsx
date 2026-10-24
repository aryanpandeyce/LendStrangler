import React from 'react';
import { motion } from 'framer-motion';
import { Server, ShieldCheck, Zap, Activity, CheckCircle2 } from 'lucide-react';
import { RouteMode, RouteRule } from '@lendstrangler/contracts';

interface MigrationControlRoomProps {
  routes: RouteRule[];
  onUpdateRoute: (pathPattern: string, mode: RouteMode, canaryWeightPercent?: number) => void;
}

export const MigrationControlRoom: React.FC<MigrationControlRoomProps> = ({
  routes,
  onUpdateRoute,
}) => {
  const allNew = routes.every((r) => r.mode === 'NEW');
  const hasLegacy = routes.some((r) => r.mode === 'LEGACY');

  return (
    <div className="space-y-8">
      {/* Overview Banner */}
      <div className="glass-card rounded-2xl p-6 relative overflow-hidden border border-indigo-500/20">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Phase 5 Cutover Complete
              </span>
              <span className="text-xs text-slate-400">Strangler Fig Topology</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Migration Control Room
            </h2>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Dynamically manipulate the reverse proxy facade routing table in real time.
              Safely validate modern services using asynchronous <strong>SHADOW</strong> comparisons
              and weighted <strong>CANARY</strong> traffic shifts before decommissioning the monolith.
            </p>
          </div>

          <div className="flex items-center gap-4 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
            <div className="text-center px-3 border-r border-slate-800">
              <div className="text-xs text-slate-400">Total Routes</div>
              <div className="text-xl font-bold text-white">{routes.length}</div>
            </div>
            <div className="text-center px-3 border-r border-slate-800">
              <div className="text-xs text-slate-400">Modernized</div>
              <div className="text-xl font-bold text-emerald-400">
                {routes.filter((r) => r.mode === 'NEW').length}/{routes.length}
              </div>
            </div>
            <div className="text-center px-3">
              <div className="text-xs text-slate-400">Monolith Status</div>
              <div className={`text-xs font-bold px-2 py-0.5 rounded-full mt-1 ${
                allNew ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
              }`}>
                {allNew ? 'DECOMMISSIONED' : 'STRANGLING'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Visual Architectural Topology with Monolith Shrinkage */}
      <div className="glass-card rounded-2xl p-6 border border-slate-800">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-6 flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-400" />
          Interactive Architecture Flow
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Legacy Monolith Container (Shrinks as modern routes expand) */}
          <motion.div
            animate={{
              scale: allNew ? 0.92 : hasLegacy ? 1.0 : 0.96,
              opacity: allNew ? 0.45 : 1,
            }}
            transition={{ duration: 0.5 }}
            className={`lg:col-span-3 p-5 rounded-xl border relative transition-all ${
              allNew
                ? 'bg-slate-900/40 border-slate-800 text-slate-500'
                : 'bg-rose-950/20 border-rose-900/50 text-slate-300 shadow-lg shadow-rose-950/20'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-rose-400" />
                <span className="font-bold text-sm text-white">Legacy Monolith</span>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                allNew ? 'bg-slate-800 text-slate-400' : 'bg-rose-500/20 text-rose-300'
              }`}>
                {allNew ? '0% Traffic' : 'Express + SQLite'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Tightly-coupled MVC god service, shared database tables, synchronous cascaded chains.
            </p>
            <div className="text-[11px] font-mono space-y-1 bg-black/40 p-2.5 rounded-lg border border-slate-800/80">
              <div className="text-slate-400">• /apps/legacy-monolith</div>
              <div className="text-slate-400">• Port :3001</div>
              <div className={allNew ? 'text-slate-500 line-through' : 'text-rose-400'}>
                • In-process Underwriting
              </div>
              <div className={allNew ? 'text-slate-500 line-through' : 'text-rose-400'}>
                • In-process Disbursement
              </div>
            </div>
          </motion.div>

          {/* Central Strangler Facade Gateway */}
          <div className="lg:col-span-4 p-5 rounded-xl bg-indigo-950/30 border border-indigo-500/40 shadow-xl shadow-indigo-950/40 text-center relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-indigo-600 text-[10px] font-bold text-white uppercase tracking-wider">
              Strangler Facade
            </div>
            <div className="flex items-center justify-center gap-2 mb-2">
              <ShieldCheck className="w-6 h-6 text-indigo-400" />
              <span className="font-bold text-white text-base">API Gateway</span>
            </div>
            <p className="text-xs text-indigo-200/80 mb-3">
              Reverse proxy with dynamic route table, correlation ID injector & shadow diff analyzer
            </p>
            <div className="text-xs font-mono bg-black/50 p-2 rounded-lg text-indigo-300 inline-block border border-indigo-500/20">
              Port :3000 • X-Correlation-Id
            </div>

            {/* Dynamic Animated Pulse Lines */}
            <div className="flex justify-between items-center mt-4 px-4 text-xs font-semibold text-slate-400">
              <div className="flex items-center gap-1">
                <span className={hasLegacy ? 'text-rose-400' : 'text-slate-600'}>◀ Monolith</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-emerald-400">Microservices ▶</span>
              </div>
            </div>
          </div>

          {/* Extracted Event-Driven Microservices */}
          <div className="lg:col-span-5 space-y-3">
            {[
              {
                name: 'loan-service',
                port: 3004,
                purpose: 'Origination & Saga Choreography',
                active: routes.find((r) => r.pathPattern === '/api/loans')?.mode === 'NEW',
              },
              {
                name: 'credit-service',
                port: 3002,
                purpose: 'Deterministic Scoring & DTI Rules',
                active: routes.find((r) => r.pathPattern === '/api/credit')?.mode === 'NEW',
              },
              {
                name: 'disbursement-service',
                port: 3003,
                purpose: 'Transactional Outbox & DLQ Ledger',
                active: routes.find((r) => r.pathPattern === '/api/disbursements')?.mode === 'NEW',
              },
            ].map((svc) => (
              <motion.div
                key={svc.name}
                animate={{
                  scale: svc.active ? 1.02 : 0.98,
                  opacity: svc.active ? 1.0 : 0.7,
                }}
                className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                  svc.active
                    ? 'bg-emerald-950/20 border-emerald-500/40 text-slate-200 shadow-md shadow-emerald-950/20'
                    : 'bg-slate-900/40 border-slate-800 text-slate-400'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    svc.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
                  }`}>
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-white">{svc.name}</span>
                      <span className="text-[10px] font-mono text-slate-400">:{svc.port}</span>
                    </div>
                    <span className="text-[11px] text-slate-400">{svc.purpose}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  {svc.active ? (
                    <span className="flex items-center gap-1 text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Active
                    </span>
                  ) : (
                    <span className="text-slate-500">Standby</span>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      {/* Dynamic Route Table Controls */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Route Migration Policies</h3>
          <span className="text-xs text-slate-400">
            Click any mode button to immediately redirect production traffic
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {routes.map((route) => {
            const isCanary = route.mode === 'CANARY';
            return (
              <div
                key={route.pathPattern}
                className="glass-card rounded-2xl p-5 border border-slate-800 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-bold text-white">{route.pathPattern}</span>
                  <span
                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                      route.mode === 'NEW'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : route.mode === 'SHADOW'
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : route.mode === 'CANARY'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    {route.mode} {isCanary && `(${route.canaryWeightPercent}%)`}
                  </span>
                </div>

                <p className="text-xs text-slate-400 min-h-[32px]">{route.description}</p>

                {/* Mode Selector Buttons */}
                <div className="grid grid-cols-4 gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800">
                  {(['LEGACY', 'SHADOW', 'CANARY', 'NEW'] as RouteMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => onUpdateRoute(route.pathPattern, mode, isCanary ? route.canaryWeightPercent : 20)}
                      className={`py-1.5 rounded text-[11px] font-semibold transition-all ${
                        route.mode === mode
                          ? mode === 'NEW'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : mode === 'SHADOW'
                            ? 'bg-purple-600 text-white shadow-sm'
                            : mode === 'CANARY'
                            ? 'bg-amber-600 text-white shadow-sm'
                            : 'bg-rose-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                {/* Canary Slider (Visible when in CANARY mode) */}
                {isCanary && (
                  <div className="p-3 bg-amber-950/20 rounded-xl border border-amber-500/30 space-y-2">
                    <div className="flex justify-between text-xs text-amber-200">
                      <span>Canary Traffic Weight:</span>
                      <span className="font-mono font-bold">{route.canaryWeightPercent}% New</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={route.canaryWeightPercent}
                      onChange={(e) =>
                        onUpdateRoute(route.pathPattern, 'CANARY', parseInt(e.target.value, 10))
                      }
                      className="w-full accent-amber-500 bg-slate-800 rounded-lg h-2 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>0% (All Legacy)</span>
                      <span>50%</span>
                      <span>100% (All New)</span>
                    </div>
                  </div>
                )}

                {/* Route Target Details */}
                <div className="text-[11px] space-y-1.5 pt-2 border-t border-slate-800 text-slate-400">
                  <div className="flex justify-between">
                    <span>Active Target:</span>
                    <span className="font-mono text-slate-200">{route.activeService}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Modern Upstream:</span>
                    <span className="font-mono text-emerald-400 truncate max-w-[150px]">
                      {route.newTarget}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
