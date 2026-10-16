import React from 'react';
import { useTrading } from '../../context/TradingContext';

export default function Header() {
  const {
    wsStatus,
    opportunities,
    totalMarkets,
    botStatus,
    riskStatus,
    triggerKillSwitch,
    resetKillSwitch,
    wallet,
    engineLatencyMs,
    sidebarOpen,
    setSidebarOpen,
  } = useTrading();

  const handleKillSwitch = async () => {
    if (riskStatus.isKilled) {
      if (window.confirm('Reset Emergency Kill-Switch and resume trading capability?')) {
        try {
          await resetKillSwitch();
        } catch (err) {
          alert('Failed to reset kill switch: ' + err.message);
        }
      }
    } else {
      if (window.confirm('⚠️ EMERGENCY HALT: Are you sure you want to trigger the Hard Kill-Switch?\nThis will immediately halt automated trading and cancel open orders.')) {
        try {
          await triggerKillSwitch('Manual operator emergency trigger from UI');
        } catch (err) {
          alert('Failed to activate kill switch: ' + err.message);
        }
      }
    }
  };

  return (
    <header className="border-b border-zinc-800 bg-zinc-900/90 backdrop-blur-md px-4 sm:px-6 py-3 sticky top-0 z-40 transition-colors">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        {/* Left: Branding & Status */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition"
            title="Toggle Menu Sidebar"
          >
            ☰
          </button>

          <div className="relative flex items-center justify-center">
            <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </div>

          <div className="flex items-baseline space-x-2">
            <h1 className="text-base sm:text-lg font-bold font-mono tracking-wider text-zinc-100">
              POLYMARKET<span className="text-emerald-400">PRO</span>
            </h1>
            <span className="text-xs font-mono text-zinc-500 font-medium">
              // TERMINAL
            </span>
          </div>

          <div className="hidden sm:flex items-center space-x-1.5 px-2 py-0.5 rounded bg-zinc-800/80 border border-zinc-700/50 text-[11px] font-mono text-zinc-400">
            <span className="text-emerald-400">⚡</span>
            <span>{engineLatencyMs || 18.4}ms CLOB</span>
          </div>

          <a
            href="/classic"
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-500/40 text-[11px] font-mono font-semibold transition-colors"
            title="Switch to Classic Terminal with full Sidebar Menu"
          >
            <span>🏛️</span>
            <span className="hidden sm:inline">Classic Menu UI</span>
          </a>
        </div>

        {/* Center: Market Summary */}
        <div className="hidden lg:flex items-center space-x-2 text-xs font-mono text-zinc-400">
          <span className="text-zinc-200 font-semibold tabular-nums">{totalMarkets.toLocaleString()}</span>
          <span>Markets Monitored</span>
          <span className="text-zinc-600">•</span>
          <span className="text-emerald-400 font-semibold tabular-nums">{opportunities.length}</span>
          <span>Active Opportunities</span>
        </div>

        {/* Right: Controls, Telemetry & Wallet */}
        <div className="flex items-center space-x-3 sm:space-x-4 text-xs font-mono justify-between md:justify-end">
          {/* WS Stream Status */}
          <div className="flex items-center space-x-1.5">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                wsStatus === 'connected'
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                  : wsStatus === 'reconnecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-rose-500'
              }`}
            />
            <span className="text-[11px] text-zinc-400 uppercase hidden sm:inline">
              CLOB L2: {wsStatus}
            </span>
          </div>

          {/* Bot State Badge */}
          <div className="flex items-center space-x-1">
            <span className="text-zinc-500 hidden sm:inline">BOT:</span>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-semibold border ${
                riskStatus.isKilled
                  ? 'bg-rose-950/80 text-rose-400 border-rose-800 animate-pulse'
                  : botStatus.running
                  ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                  : 'bg-zinc-800 text-zinc-400 border-zinc-700'
              }`}
            >
              {riskStatus.isKilled ? 'HALTED' : botStatus.running ? 'RUNNING' : 'PAUSED'}
            </span>
          </div>

          {/* Kill-Switch Button */}
          <button
            onClick={handleKillSwitch}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition flex items-center space-x-1.5 border shadow-sm ${
              riskStatus.isKilled
                ? 'bg-rose-950 text-rose-300 border-rose-600 hover:bg-rose-900 animate-pulse'
                : 'bg-rose-950/60 hover:bg-rose-900 text-rose-300 border-rose-800/80'
            }`}
          >
            <span>{riskStatus.isKilled ? '🚨' : '🛑'}</span>
            <span>{riskStatus.isKilled ? 'KILL-SWITCH ACTIVE (RESET)' : 'KILL-SWITCH'}</span>
          </button>

          {/* Wallet / Bankroll Pill */}
          <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/60 border border-zinc-700/60 text-zinc-300 text-[11px]">
            <span className="text-zinc-500">USDC:</span>
            <span className="font-semibold text-emerald-400 tabular-nums">
              ${(wallet.balanceUsd || 10000).toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
