import React from 'react';
import { useTrading } from '../../context/TradingContext';

export default function BotControlBar() {
  const {
    botStatus,
    toggleBot,
    runCycle,
    isCycling,
    riskStatus,
    triggerKillSwitch,
    resetKillSwitch,
    wsStatus,
    executionMode,
    setExecutionMode,
    txflowStatus,
  } = useTrading();

  const handleToggle = async () => {
    try {
      await toggleBot();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRunCycle = async () => {
    try {
      await runCycle();
    } catch (err) {
      alert('Error executing cycle: ' + err.message);
    }
  };

  const grossExposureUsd = riskStatus.metrics?.grossExposureUsd || 0;
  const grossExposurePct = riskStatus.metrics?.grossExposurePct || 0;
  const drawdownPct = riskStatus.metrics?.currentDrawdownPct || 0;
  const tradesExecuted = executionMode === 'txflow'
    ? (txflowStatus.stats?.totalFilled || 0)
    : (botStatus.stats?.tradesExecuted || botStatus.closedPositionsCount || 0);
  const activeOrdersCount = executionMode === 'txflow'
    ? (txflowStatus.openOrdersCount || 0)
    : (botStatus.openPositionsCount || 0);

  return (
    <div className="bg-gradient-to-r from-zinc-900/95 via-zinc-900/90 to-zinc-800/90 border border-zinc-800 hover:border-zinc-700/80 rounded-xl p-4 mb-5 shadow-lg transition">
      {/* Top Row: Title, Model Attribution, Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-zinc-800/80">
        <div className="flex items-start sm:items-center space-x-3">
          <div className="h-10 w-10 rounded-lg bg-emerald-950/60 border border-emerald-500/40 flex items-center justify-center text-xl shrink-0 shadow-inner">
            {executionMode === 'txflow' ? '⚡' : '🤖'}
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h2 className="text-sm sm:text-base font-bold font-mono text-zinc-100">
                {executionMode === 'txflow'
                  ? 'TxFlow Testnet Autonomous CLOB Bot (TIP 3)'
                  : '24/7 Autonomous Paper-Trading Bot'}
              </h2>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase border ${
                  riskStatus.isKilled
                    ? 'bg-rose-950/80 text-rose-400 border-rose-700 animate-pulse'
                    : botStatus.running
                    ? 'bg-emerald-950/80 text-emerald-400 border-emerald-600/60 shadow-[0_0_10px_rgba(52,211,153,0.2)]'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}
              >
                {riskStatus.isKilled ? 'EMERGENCY KILLED' : botStatus.running ? 'ACTIVE & MONITORING' : 'PAUSED'}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-mono mt-0.5 hidden sm:block">
              {executionMode === 'txflow'
                ? 'TxFlow Testnet (Chain ID 2511) • EIP-712 Dual-Tier Signer • Integer Asset ID • Asynchronous Queue Tracking'
                : 'Ensemble Fair Value (M1) • Shin De-vigging • Dynamic Fee Net Edge • Quarter Kelly Sizing • Passive Queue Fill Simulator'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          {/* Start/Pause Bot Button */}
          <button
            onClick={handleToggle}
            disabled={riskStatus.isKilled}
            className={`px-3.5 py-1.5 rounded-lg font-bold transition flex items-center space-x-1.5 border shadow-sm ${
              riskStatus.isKilled
                ? 'bg-zinc-800/50 text-zinc-500 border-zinc-800 cursor-not-allowed'
                : botStatus.running
                ? 'bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border-amber-700/60'
                : 'bg-emerald-950/70 hover:bg-emerald-900/90 text-emerald-300 border-emerald-600/70'
            }`}
          >
            <span>{botStatus.running ? '⏸' : '▶'}</span>
            <span>{botStatus.running ? 'Pause Bot' : 'Start Autonomous Bot'}</span>
          </button>

          {/* Manual Run-Cycle Trigger */}
          <button
            onClick={handleRunCycle}
            disabled={isCycling || riskStatus.isKilled}
            className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center space-x-1.5 border ${
              isCycling || riskStatus.isKilled
                ? 'bg-zinc-800/50 text-zinc-500 border-zinc-800 cursor-not-allowed'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
            }`}
          >
            <span>{isCycling ? '⏳' : '⚡'}</span>
            <span>{isCycling ? 'Evaluating...' : 'Run Cycle Now'}</span>
          </button>

          {/* Emergency Kill / Reset Switch */}
          {riskStatus.isKilled ? (
            <button
              onClick={() => resetKillSwitch()}
              className="px-3 py-1.5 rounded-lg font-bold uppercase transition bg-emerald-950 text-emerald-300 border border-emerald-600 hover:bg-emerald-900"
            >
              🔄 Reset Kill-Switch
            </button>
          ) : (
            <button
              onClick={() => triggerKillSwitch('Manual operator emergency trigger from bot bar')}
              className="px-3 py-1.5 rounded-lg font-bold uppercase transition bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-700/80"
            >
              🛑 Hard Kill-Switch
            </button>
          )}
        </div>
      </div>

      {/* Bottom Row: Micro Telemetry Badges */}
      <div className="pt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs font-mono">
        <div className="flex flex-col">
          <span className="text-[10px] text-zinc-500 uppercase">EXECUTION PIPELINE</span>
          <button
            type="button"
            onClick={() => setExecutionMode(executionMode === 'paper' ? 'txflow' : 'paper')}
            className={`mt-0.5 px-2 py-0.5 rounded text-[10px] font-semibold transition border flex items-center space-x-1.5 w-fit ${
              executionMode === 'txflow'
                ? 'bg-purple-950/80 text-purple-300 border-purple-700 hover:bg-purple-900/80'
                : 'bg-zinc-800/80 text-emerald-400 border-zinc-700 hover:bg-zinc-700/80'
            }`}
            title="Toggle between Local Paper Simulation and TxFlow Testnet CLOB"
          >
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${executionMode === 'txflow' ? 'bg-purple-400 animate-pulse' : 'bg-emerald-400'}`}></span>
            <span>{executionMode === 'txflow' ? 'TxFlow Testnet CLOB' : 'Local Paper Sim'}</span>
          </button>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-zinc-500 uppercase">ACTIVE ORDERS</span>
          <span className="font-semibold text-emerald-400 tabular-nums">
            {activeOrdersCount} Open
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-zinc-500 uppercase">TRADES EXECUTED</span>
          <span className="font-semibold text-sky-400 tabular-nums">
            {tradesExecuted} Fills
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-zinc-500 uppercase">GROSS EXPOSURE</span>
          <span className="font-semibold text-amber-400 tabular-nums">
            ${grossExposureUsd.toFixed(0)} ({grossExposurePct.toFixed(1)}%)
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-zinc-500 uppercase">MAX DRAWDOWN</span>
          <span className="font-semibold text-zinc-300 tabular-nums">
            {drawdownPct.toFixed(2)}% <span className="text-zinc-600">/ 15%</span>
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-[10px] text-zinc-500 uppercase">CLOB STREAMER</span>
          <span className="font-semibold text-emerald-400 flex items-center space-x-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>{wsStatus === 'connected' ? 'Active L2 DOM' : wsStatus}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
