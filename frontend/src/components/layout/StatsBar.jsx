import React from 'react';
import { useTrading } from '../../context/TradingContext';

export default function StatsBar() {
  const {
    totalMarkets,
    opportunities,
    botStatus,
    riskStatus,
    wallet,
  } = useTrading();

  // Compute max net edge across all opportunities
  const maxNetEdge = opportunities.reduce((max, opp) => {
    const edge = typeof opp.netEdge === 'number' ? opp.netEdge : (opp.edge || 0);
    return Math.max(max, edge);
  }, 0);

  const grossExposureUsd = riskStatus.metrics?.grossExposureUsd || 0;
  const grossExposurePct = riskStatus.metrics?.grossExposurePct || 0;
  const drawdownPct = riskStatus.metrics?.currentDrawdownPct || 0;
  const maxDrawdownLimit = riskStatus.limits?.maxDrawdownLimit || 15;
  const portfolioBalanceUsd = wallet?.balanceUsd || riskStatus.metrics?.portfolioBalanceUsd || 10000;
  const currentEquityUsd = riskStatus.metrics?.currentEquityUsd || portfolioBalanceUsd;
  const equityDeltaPct = portfolioBalanceUsd > 0
    ? (((currentEquityUsd - portfolioBalanceUsd) / portfolioBalanceUsd) * 100)
    : 0;

  return (
    <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl p-3 sm:p-4 mb-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 shadow-sm">
      {/* Pillar 1: Scanned Markets & Opportunities */}
      <div className="flex flex-col justify-between border-r border-zinc-800/60 pr-2">
        <div className="text-[10px] sm:text-[11px] font-bold text-zinc-400 tracking-wider uppercase font-mono">
          MARKETS / OPPS
        </div>
        <div className="text-base sm:text-lg lg:text-xl font-extrabold font-mono text-zinc-100 tabular-nums">
          {totalMarkets.toLocaleString()} <span className="text-zinc-500 font-normal text-xs sm:text-sm">/</span>{' '}
          <span className="text-emerald-400">{opportunities.length}</span>
        </div>
        <div className="text-[10px] text-zinc-500 font-mono">
          Gamma Scan Engine Active
        </div>
      </div>

      {/* Pillar 2: Maximum Net Edge */}
      <div className="flex flex-col justify-between border-r border-zinc-800/60 pr-2">
        <div className="text-[10px] sm:text-[11px] font-bold text-zinc-400 tracking-wider uppercase font-mono">
          MAX NET EDGE
        </div>
        <div className="text-base sm:text-lg lg:text-xl font-extrabold font-mono text-emerald-400 tabular-nums">
          {maxNetEdge > 0 ? `+${(maxNetEdge * 100).toFixed(1)}%` : '+0.0%'}
        </div>
        <div className="text-[10px] text-zinc-500 font-mono">
          Post-Fee Venue Alpha
        </div>
      </div>

      {/* Pillar 3: Portfolio Balance & Equity */}
      <div className="flex flex-col justify-between border-r border-zinc-800/60 pr-2">
        <div className="text-[10px] sm:text-[11px] font-bold text-zinc-400 tracking-wider uppercase font-mono">
          PORTFOLIO BALANCE
        </div>
        <div className="text-base sm:text-lg lg:text-xl font-extrabold font-mono text-zinc-100 tabular-nums">
          ${portfolioBalanceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className={`text-[10px] font-mono font-semibold tabular-nums ${equityDeltaPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
          Equity: ${currentEquityUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })} ({equityDeltaPct >= 0 ? '+' : ''}{equityDeltaPct.toFixed(2)}%)
        </div>
      </div>

      {/* Pillar 4: Autonomous Bot Telemetry */}
      <div className="flex flex-col justify-between border-r border-zinc-800/60 pr-2">
        <div className="text-[10px] sm:text-[11px] font-bold text-zinc-400 tracking-wider uppercase font-mono">
          BOT LIFECYCLE
        </div>
        <div className="flex items-center space-x-2">
          <span
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              riskStatus.isKilled
                ? 'bg-rose-500 animate-pulse'
                : botStatus.running
                ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]'
                : 'bg-zinc-500'
            }`}
          />
          <span className="text-base sm:text-lg font-bold font-mono text-zinc-100 uppercase">
            {riskStatus.isKilled ? 'HALTED' : botStatus.running ? 'RUNNING' : 'PAUSED'}
          </span>
        </div>
        <div className="text-[10px] text-zinc-500 font-mono">
          Orders: <span className="text-zinc-300 tabular-nums">{botStatus.openPositionsCount || 0} Open</span>
        </div>
      </div>

      {/* Pillar 5: Risk Exposure & Drawdown Limit */}
      <div className="flex flex-col justify-between col-span-2 sm:col-span-1">
        <div className="text-[10px] sm:text-[11px] font-bold text-zinc-400 tracking-wider uppercase font-mono">
          RISK & DRAWDOWN
        </div>
        <div className="text-base sm:text-lg lg:text-xl font-extrabold font-mono text-zinc-100 tabular-nums">
          ${grossExposureUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}{' '}
          <span className="text-xs text-amber-400 font-normal">({grossExposurePct.toFixed(1)}%)</span>
        </div>
        <div className={`text-[10px] font-mono ${drawdownPct >= maxDrawdownLimit * 0.8 ? 'text-rose-400 font-bold' : 'text-zinc-500'}`}>
          Drawdown: <span className="tabular-nums">{drawdownPct.toFixed(2)}%</span> / {maxDrawdownLimit}% Limit
        </div>
      </div>
    </div>
  );
}
