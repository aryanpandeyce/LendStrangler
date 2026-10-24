import React from 'react';
import { Layers, GitBranch, Terminal, ExternalLink, Zap } from 'lucide-react';

interface HeaderProps {
  isDemoMode: boolean;
  onToggleMode: () => void;
}

export const Header: React.FC<HeaderProps> = ({ isDemoMode, onToggleMode }) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
      {/* Top Demo Mode Banner */}
      <div className="bg-gradient-to-r from-indigo-900/60 via-purple-900/60 to-slate-900/60 border-b border-indigo-500/20 px-4 py-1.5 text-xs text-indigo-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
          <span className="font-semibold text-white">Live Portfolio Demonstration</span>
          <span className="hidden sm:inline text-indigo-300">
            • {isDemoMode ? 'Demo Mode: Running simulated event-driven microservices directly in-browser' : 'API Mode: Connected to Live Gateway'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden md:inline text-slate-400">Full stack: Node 20 • TypeScript • RabbitMQ • SQLite</span>
          <button
            onClick={onToggleMode}
            className="px-2 py-0.5 rounded bg-indigo-600/40 hover:bg-indigo-600/60 border border-indigo-400/30 text-[11px] font-medium text-white transition-colors"
          >
            Switch to {isDemoMode ? 'API Mode' : 'Demo Mode'}
          </button>
        </div>
      </div>

      {/* Main App Navigation Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-white tracking-tight">LendStrangler</h1>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                v1.0 Live
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Legacy Monolith Modernization Case Study • Strangler Fig Pattern
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs">
            <GitBranch className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-slate-400">Milestone:</span>
            <span className="font-mono text-indigo-300 font-medium">v0.5-loan-service</span>
          </div>

          <a
            href="https://github.com/aryanpandeyce/LendStrangler"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition-colors"
          >
            <Terminal className="w-3.5 h-3.5 text-slate-400" />
            <span>GitHub</span>
            <ExternalLink className="w-3 h-3 text-slate-400" />
          </a>
        </div>
      </div>
    </header>
  );
};
