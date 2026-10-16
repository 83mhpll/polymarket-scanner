import React from 'react';
import { useTrading } from '../../context/TradingContext';

export default function PortfolioModal() {
  const {
    portfolioModalOpen,
    closePortfolioModal,
    botStatus,
    riskStatus,
    wallet,
    triggerKillSwitch,
    resetKillSwitch,
  } = useTrading();

  if (!portfolioModalOpen) return null;

  const closedCount = botStatus.closedPositionsCount || 0;
  const openCount = botStatus.openPositionsCount || 0;
  const totalVolume = botStatus.stats?.totalVolumeUsd || 0;
  const tradesExecuted = botStatus.stats?.tradesExecuted || 0;
  const drawdownPct = riskStatus.metrics?.currentDrawdownPct || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="relative w-full max-w-3xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/90">
          <div className="flex items-center space-x-3">
            <span className="text-xl">📊</span>
            <div>
              <h2 className="text-base font-mono font-bold text-zinc-100">
                Institutional Portfolio & Ledger
              </h2>
              <p className="text-xs font-mono text-zinc-400">
                Paper-Trading Execution Telemetry & Backtest Positions
              </p>
            </div>
          </div>

          <button
            onClick={closePortfolioModal}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
              <div className="text-[10px] text-zinc-500 uppercase font-semibold">Available Capital</div>
              <div className="text-lg font-bold text-emerald-400 mt-0.5">
                ${(wallet.balanceUsd || 10000).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
              <div className="text-[10px] text-zinc-500 uppercase font-semibold">Open Positions</div>
              <div className="text-lg font-bold text-zinc-100 mt-0.5">{openCount}</div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
              <div className="text-[10px] text-zinc-500 uppercase font-semibold">Closed Trades</div>
              <div className="text-lg font-bold text-sky-400 mt-0.5">{closedCount}</div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
              <div className="text-[10px] text-zinc-500 uppercase font-semibold">Max Drawdown</div>
              <div className="text-lg font-bold text-emerald-400 mt-0.5">
                {drawdownPct.toFixed(2)}% <span className="text-[10px] text-zinc-500">(Limit: 15%)</span>
              </div>
            </div>
          </div>

          {/* Risk & Kill-Switch Controller */}
          <div className="p-4 rounded-xl bg-zinc-950/40 border border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-bold text-zinc-200">Emergency Risk Guard</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    riskStatus.isKilled
                      ? 'bg-rose-950/80 text-rose-400 border-rose-800'
                      : 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                  }`}
                >
                  {riskStatus.isKilled ? '🚨 HARD KILL-SWITCH ACTIVE' : '🛡️ SYSTEM ARMED & NORMAL'}
                </span>
              </div>
              <p className="text-xs text-zinc-500 mt-1">
                Sub-second circuit breaker cancels active bids/asks and freezes automated orders.
              </p>
            </div>

            <div className="flex items-center space-x-2 w-full sm:w-auto">
              {riskStatus.isKilled ? (
                <button
                  onClick={() => resetKillSwitch()}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs transition"
                >
                  🔄 Reset Kill-Switch
                </button>
              ) : (
                <button
                  onClick={() => triggerKillSwitch('Triggered from Portfolio Modal')}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg bg-rose-600/90 hover:bg-rose-600 text-white font-bold text-xs transition shadow-lg shadow-rose-900/30"
                >
                  🛑 Trigger Kill-Switch
                </button>
              )}
            </div>
          </div>

          {/* Recent Trades Table / Ledger */}
          <div className="space-y-3 font-mono">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">
                Ledger History (`backtest.json`)
              </h3>
              <span className="text-[11px] text-zinc-500">Atomic Persistence: Active</span>
            </div>

            <div className="rounded-xl border border-zinc-800/80 overflow-hidden bg-zinc-950/40">
              <div className="p-8 text-center text-zinc-500 text-xs">
                <div className="text-2xl mb-2">📋</div>
                <div>Ledger records {closedCount} historical trades logged with timestamp, slippage, and rationale.</div>
                <div className="text-[11px] text-zinc-600 mt-1">Paper executions strictly avoid live capital risk.</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-800/80 bg-zinc-950/50 flex items-center justify-between text-xs font-mono text-zinc-500">
          <span>Fractional Kelly (0.25) • Market Shrinkage (0.50)</span>
          <button
            onClick={closePortfolioModal}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
