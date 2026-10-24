import React from 'react';
import { Sliders, Send, Network, SplitSquareVertical, BookOpen } from 'lucide-react';

export type TabType = 'control-room' | 'loan-journey' | 'broker' | 'shadow-diff' | 'docs';

interface NavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  eventCount: number;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange, eventCount }) => {
  const tabs = [
    {
      id: 'control-room' as TabType,
      label: 'Migration Control Room',
      icon: Sliders,
      badge: 'Interactive',
    },
    {
      id: 'loan-journey' as TabType,
      label: 'Loan Journey (Saga)',
      icon: Send,
      badge: eventCount > 0 ? `${eventCount} events` : undefined,
    },
    {
      id: 'broker' as TabType,
      label: 'Broker & DLQ Inspector',
      icon: Network,
    },
    {
      id: 'shadow-diff' as TabType,
      label: 'Shadow Diff Viewer',
      icon: SplitSquareVertical,
    },
    {
      id: 'docs' as TabType,
      label: 'Architecture Docs & ADRs',
      icon: BookOpen,
    },
  ];

  return (
    <nav className="border-b border-slate-800 bg-slate-900/40 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex space-x-1 sm:space-x-2 overflow-x-auto py-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                    isActive
                      ? 'bg-indigo-500/20 text-indigo-300'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
