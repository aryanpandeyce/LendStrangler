import React, { useState, useEffect } from 'react';
import { Header } from './components/Header.js';
import { Navigation, TabType } from './components/Navigation.js';
import { MigrationControlRoom } from './pages/MigrationControlRoom.js';
import { LoanJourney } from './pages/LoanJourney.js';
import { BrokerInspector } from './pages/BrokerInspector.js';
import { ShadowDiffViewer } from './pages/ShadowDiffViewer.js';
import { DocsViewer } from './pages/DocsViewer.js';
import { simulatedEngine } from './simulated-backend/simulated-engine.js';
import { CreateLoanRequest, RouteMode } from '@lendstrangler/contracts';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('control-room');
  const [isDemoMode, setIsDemoMode] = useState<boolean>(true);
  const [, setTick] = useState(0);

  // Subscribe to simulated engine state changes for reactive in-browser rendering
  useEffect(() => {
    const unsubscribe = simulatedEngine.subscribe(() => {
      setTick((t) => t + 1);
    });
    return unsubscribe;
  }, []);

  const routes = simulatedEngine.getRoutes();
  const loans = simulatedEngine.getLoans();
  const timeline = simulatedEngine.getTimeline();
  const metrics = simulatedEngine.getBrokerMetrics();
  const dlqMessages = simulatedEngine.getDlqMessages();
  const shadowDiffs = simulatedEngine.getShadowDiffs();
  const chaosActive = simulatedEngine.isChaosEnabled();

  const handleUpdateRoute = (pathPattern: string, mode: RouteMode, canaryWeightPercent = 0) => {
    simulatedEngine.updateRoute(pathPattern, mode, canaryWeightPercent);
  };

  const handleSubmitLoan = async (req: CreateLoanRequest) => {
    await simulatedEngine.submitLoan(req);
    // Switch to loan-journey tab so user watches saga live
    setActiveTab('loan-journey');
  };

  const handleToggleChaos = (enabled: boolean) => {
    simulatedEngine.setChaos(enabled);
  };

  const handleReplayDlq = async (msgId: string) => {
    await simulatedEngine.replayDlq(msgId);
  };

  const handleTriggerShadowRun = () => {
    simulatedEngine.triggerShadowRun();
  };

  const handleClearTimeline = () => {
    simulatedEngine.clearTimeline();
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col selection:bg-indigo-500 selection:text-white">
      <Header
        isDemoMode={isDemoMode}
        onToggleMode={() => setIsDemoMode(!isDemoMode)}
      />

      <Navigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        eventCount={timeline.length}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'control-room' && (
          <MigrationControlRoom
            routes={routes}
            onUpdateRoute={handleUpdateRoute}
          />
        )}

        {activeTab === 'loan-journey' && (
          <LoanJourney
            loans={loans}
            timeline={timeline}
            onSubmitLoan={handleSubmitLoan}
            onClearTimeline={handleClearTimeline}
            chaosActive={chaosActive}
          />
        )}

        {activeTab === 'broker' && (
          <BrokerInspector
            metrics={metrics}
            dlqMessages={dlqMessages}
            onReplayDlq={handleReplayDlq}
            chaosEnabled={chaosActive}
            onToggleChaos={handleToggleChaos}
          />
        )}

        {activeTab === 'shadow-diff' && (
          <ShadowDiffViewer
            diffs={shadowDiffs}
            onTriggerShadowRun={handleTriggerShadowRun}
          />
        )}

        {activeTab === 'docs' && <DocsViewer />}
      </main>

      {/* Fintech Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <strong>LendStrangler</strong> • Modernizing Corporate Lending with the Strangler Fig Pattern
          </div>
          <div className="font-mono text-slate-400">
            Node 20 • TypeScript • React 18 • Vite • Tailwind • RabbitMQ
          </div>
        </div>
      </footer>
    </div>
  );
};
export default App;
