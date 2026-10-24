import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Sparkles,
  Calculator,
  ChevronDown,
  ChevronUp,
  Clock,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { calculateEMI, CreateLoanRequest, LoanApplication } from '@lendstrangler/contracts';
import { TimelineEventItem } from '../simulated-backend/simulated-engine.js';

interface LoanJourneyProps {
  loans: LoanApplication[];
  timeline: TimelineEventItem[];
  onSubmitLoan: (req: CreateLoanRequest) => Promise<void>;
  onClearTimeline: () => void;
  chaosActive?: boolean;
}

export const LoanJourney: React.FC<LoanJourneyProps> = ({
  loans,
  timeline,
  onSubmitLoan,
  onClearTimeline,
}) => {
  const [fullName, setFullName] = useState('Apex Industrial Logistics');
  const [email, setEmail] = useState('finance@apexlogistics.com');
  const [monthlyIncome, setMonthlyIncome] = useState(180000);
  const [existingMonthlyEmi, setExistingMonthlyEmi] = useState(15000);
  const [amount, setAmount] = useState(500000);
  const [tenureMonths, setTenureMonths] = useState(36);
  const [purpose, setPurpose] = useState<CreateLoanRequest['purpose']>('BUSINESS_EXPANSION');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Live reducing-balance EMI calculation
  const emiResult = calculateEMI(amount, 10.5, tenureMonths);
  const proposedTotalDebt = existingMonthlyEmi + emiResult.monthlyEmi;
  const dtiRatio = monthlyIncome > 0 ? (proposedTotalDebt / monthlyIncome) * 100 : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSubmitLoan({
        fullName,
        email,
        monthlyIncome,
        existingMonthlyEmi,
        amount,
        tenureMonths,
        purpose,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const applyPreset = (preset: 'prime' | 'borderline' | 'chaos') => {
    if (preset === 'prime') {
      setFullName('Apex Industrial Logistics');
      setEmail('finance@apexlogistics.com');
      setMonthlyIncome(200000);
      setExistingMonthlyEmi(12000);
      setAmount(450000);
      setTenureMonths(36);
      setPurpose('BUSINESS_EXPANSION');
    } else if (preset === 'borderline') {
      setFullName('Overextended Retail LLC');
      setEmail('treasury@overextended.com');
      setMonthlyIncome(32000);
      setExistingMonthlyEmi(18000); // High DTI
      setAmount(300000);
      setTenureMonths(12);
      setPurpose('DEBT_CONSOLIDATION');
    } else if (preset === 'chaos') {
      setFullName('Titan Heavy Machinery');
      setEmail('treasury@titanheavy.com');
      setMonthlyIncome(150000);
      setExistingMonthlyEmi(10000);
      setAmount(200000);
      setTenureMonths(24);
      setPurpose('BUSINESS_EXPANSION');
    }
  };

  const latestLoan = loans[0];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Left Column: Loan Origination Form & Live Financial Calculator */}
      <div className="lg:col-span-5 space-y-6">
        <div className="glass-card rounded-2xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Send className="w-5 h-5 text-indigo-400" />
              <h3 className="text-lg font-bold text-white">Originate Corporate Loan</h3>
            </div>
            <span className="text-xs text-slate-400">REST API Gateway Ingress</span>
          </div>

          {/* Preset Buttons */}
          <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => applyPreset('prime')}
              className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-medium whitespace-nowrap transition-colors"
            >
              🌟 Prime Approval
            </button>
            <button
              type="button"
              onClick={() => applyPreset('borderline')}
              className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-medium whitespace-nowrap transition-colors"
            >
              ⚠️ High DTI Rejection
            </button>
            <button
              type="button"
              onClick={() => applyPreset('chaos')}
              className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-medium whitespace-nowrap transition-colors"
            >
              💥 Transfer Timeout
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Company / Applicant Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Corporate Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Monthly Income ($)</label>
                <input
                  type="number"
                  min="5000"
                  step="5000"
                  value={monthlyIncome}
                  onChange={(e) => setMonthlyIncome(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Existing EMI ($)</label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={existingMonthlyEmi}
                  onChange={(e) => setExistingMonthlyEmi(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Loan Amount ($)</label>
                <input
                  type="number"
                  min="10000"
                  step="10000"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Tenure (Months)</label>
                <select
                  value={tenureMonths}
                  onChange={(e) => setTenureMonths(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value={12}>12 Months (1 yr)</option>
                  <option value={24}>24 Months (2 yrs)</option>
                  <option value={36}>36 Months (3 yrs)</option>
                  <option value={48}>48 Months (4 yrs)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Purpose</label>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value as CreateLoanRequest['purpose'])}
                className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="BUSINESS_EXPANSION">Business Expansion</option>
                <option value="DEBT_CONSOLIDATION">Debt Consolidation</option>
                <option value="HOME_IMPROVEMENT">Commercial Infrastructure</option>
                <option value="PERSONAL">Corporate Liquidity</option>
              </select>
            </div>

            {/* Live Reducing-Balance Calculation Preview Card */}
            <div className="p-3.5 bg-indigo-950/30 rounded-xl border border-indigo-500/20 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300">
                <Calculator className="w-3.5 h-3.5" />
                <span>Reducing-Balance EMI Calculation (10.5% p.a.)</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center pt-1">
                <div className="bg-black/30 p-2 rounded-lg">
                  <div className="text-[10px] text-slate-400">Monthly EMI</div>
                  <div className="font-mono font-bold text-white text-xs sm:text-sm">
                    ${emiResult.monthlyEmi.toLocaleString()}
                  </div>
                </div>
                <div className="bg-black/30 p-2 rounded-lg">
                  <div className="text-[10px] text-slate-400">Total Interest</div>
                  <div className="font-mono font-bold text-amber-300 text-xs sm:text-sm">
                    ${emiResult.totalInterestPayable.toLocaleString()}
                  </div>
                </div>
                <div className="bg-black/30 p-2 rounded-lg">
                  <div className="text-[10px] text-slate-400">DTI Ratio</div>
                  <div className={`font-mono font-bold text-xs sm:text-sm ${
                    dtiRatio > 50 ? 'text-rose-400' : 'text-emerald-400'
                  }`}>
                    {dtiRatio.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              {isSubmitting ? 'Initiating Saga...' : 'Submit Loan Application'}
            </button>
          </form>
        </div>
      </div>

      {/* Right Column: Live Saga Event Choreography Timeline */}
      <div className="lg:col-span-7 space-y-6">
        {/* Latest Application Status Banner */}
        {latestLoan && (
          <div className="glass-card rounded-2xl p-5 border border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-xs text-slate-400">Current Application</span>
                <h4 className="text-base font-bold text-white">{latestLoan.applicant.fullName}</h4>
              </div>
              <div className="text-right">
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${
                  latestLoan.status === 'DISBURSED'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : latestLoan.status === 'APPROVED'
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : latestLoan.status === 'REJECTED'
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : latestLoan.status === 'FAILED'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                }`}>
                  {latestLoan.status}
                </span>
                <div className="text-[11px] font-mono text-slate-400 mt-1">ID: {latestLoan.id}</div>
              </div>
            </div>

            {/* Stepper Progress Bar */}
            <div className="grid grid-cols-4 gap-2 pt-2">
              {[
                { label: 'Submitted', done: true },
                {
                  label: 'Credit Evaluated',
                  done: ['APPROVED', 'REJECTED', 'DISBURSED', 'FAILED'].includes(latestLoan.status),
                  error: latestLoan.status === 'REJECTED',
                },
                {
                  label: 'Disbursing',
                  done: ['DISBURSED', 'FAILED'].includes(latestLoan.status),
                  error: latestLoan.status === 'FAILED',
                },
                {
                  label: 'Disbursed',
                  done: latestLoan.status === 'DISBURSED',
                  error: latestLoan.status === 'FAILED',
                },
              ].map((step) => (
                <div key={step.label} className="text-center">
                  <div
                    className={`h-1.5 rounded-full mb-1.5 transition-all ${
                      step.error
                        ? 'bg-rose-500'
                        : step.done
                        ? 'bg-indigo-500'
                        : 'bg-slate-800'
                    }`}
                  />
                  <span className="text-[10px] text-slate-400">{step.label}</span>
                </div>
              ))}
            </div>

            {latestLoan.disbursementReference && (
              <div className="mt-3 p-2 bg-emerald-950/20 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 flex items-center justify-between">
                <span>Bank Transfer Reference:</span>
                <span className="font-mono font-bold">{latestLoan.disbursementReference}</span>
              </div>
            )}

            {latestLoan.rejectionReason && (
              <div className="mt-3 p-2 bg-rose-950/20 border border-rose-500/30 rounded-lg text-xs text-rose-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{latestLoan.rejectionReason}</span>
              </div>
            )}
          </div>
        )}

        {/* Live Broker Event Timeline */}
        <div className="glass-card rounded-2xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-400" />
              <h3 className="text-base font-bold text-white">Live Saga Choreography Timeline</h3>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onClearTimeline}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-400 hover:text-white transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Clear
              </button>
            </div>
          </div>

          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
            {timeline.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">
                No events emitted yet. Submit a loan application to watch the saga choreography!
              </div>
            ) : (
              timeline.map((event) => {
                const isExpanded = expandedEventId === event.id;
                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            event.status === 'success'
                              ? 'bg-emerald-400 shadow-sm shadow-emerald-400'
                              : event.status === 'error'
                              ? 'bg-rose-400 shadow-sm shadow-rose-400'
                              : event.status === 'warning'
                              ? 'bg-amber-400 shadow-sm shadow-amber-400'
                              : 'bg-indigo-400 shadow-sm shadow-indigo-400'
                          }`}
                        />
                        <span className="font-mono text-xs font-bold text-white">{event.name}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/60 font-mono">
                          {event.service}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="truncate max-w-[280px]">
                        Correlation: <span className="font-mono text-slate-300">{event.correlationId}</span>
                      </span>
                      <button
                        onClick={() => setExpandedEventId(isExpanded ? null : event.id)}
                        className="flex items-center gap-0.5 text-indigo-400 hover:text-indigo-300 font-medium"
                      >
                        <span>{isExpanded ? 'Hide' : 'Inspect'}</span>
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="pt-2 border-t border-slate-800"
                        >
                          <pre className="text-[10px] font-mono bg-black/60 p-2.5 rounded-lg text-emerald-300 overflow-x-auto border border-slate-800">
                            {JSON.stringify(event.payload, null, 2)}
                          </pre>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
