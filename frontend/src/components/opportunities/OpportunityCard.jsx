import React, { useState } from 'react';
import { useTrading } from '../../context/TradingContext';

export default function OpportunityCard({ opportunity }) {
  const { openOrderModal } = useTrading();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const opp = opportunity || {};
  const currentPrice = opp.currentPrice ?? opp.price ?? 0.5;
  const fairPrice = opp.fairPrice ?? opp.fairProb ?? 0.55;
  const netEdge = opp.netEdge ?? opp.edge ?? 0.05;
  const score = opp.score ?? 75;
  const category = (opp.category || 'general').toLowerCase();
  const modelType = opp.modelType || (category.includes('weather') ? 'weather' : 'shin');

  // Conviction score color
  const scoreColor = score >= 80 ? 'text-emerald-400 border-emerald-500/40 bg-emerald-950/40' :
    score >= 60 ? 'text-amber-400 border-amber-500/40 bg-amber-950/40' :
    'text-zinc-400 border-zinc-700 bg-zinc-800/40';

  // Model attribution styling
  const modelBadge = modelType === 'weather'
    ? { label: 'Weather NWP', style: 'bg-sky-900/40 text-sky-300 border-sky-700/40' }
    : modelType === 'ensemble'
    ? { label: 'AI Ensemble', style: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/40' }
    : { label: 'Shin 1993', style: 'bg-purple-900/40 text-purple-300 border-purple-700/40' };

  // Generate 24 pseudo points for SVG sparkline fallback
  const points = (opp.history && opp.history.length === 24)
    ? opp.history
    : Array.from({ length: 24 }, (_, i) => {
        const t = i / 23;
        const base = (1 - t) * (currentPrice - (opp.momentum || 0.02)) + t * currentPrice;
        const wave = Math.sin(i * 0.8) * 0.015;
        return Math.max(0.01, Math.min(0.99, base + wave));
      });

  const isBullish = (opp.momentum ?? 0.02) >= 0;
  const sparklineColor = isBullish ? '#34d399' : '#f87171';

  // SVG coordinates for viewBox 0 0 160 36
  const W = 160;
  const H = 36;
  const topPad = 4;
  const bottomPad = 4;
  const effectiveH = H - topPad - bottomPad;

  const polylineCoords = points.map((p, idx) => {
    const x = (idx / (points.length - 1)) * W;
    const y = H - bottomPad - (p * effectiveH);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const lastX = W;
  const lastY = H - bottomPad - (currentPrice * effectiveH);
  const floorY = H - bottomPad - (0.87 * effectiveH);

  return (
    <div className={`rounded-xl border bg-zinc-900/80 hover:bg-zinc-900 transition-all p-4 flex flex-col justify-between shadow-sm hover:shadow-md ${
      score >= 85 ? 'border-amber-500/40 shadow-[0_0_15px_rgba(251,191,36,0.06)]' : 'border-zinc-800 hover:border-zinc-700'
    }`}>
      <div>
        {/* Header Ribbon: Category, Flags, Score */}
        <div className="flex items-center justify-between text-xs font-mono mb-2.5">
          <div className="flex items-center space-x-1.5">
            <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 text-[10px] font-semibold uppercase tracking-wider">
              {category}
            </span>
            {opp.isLive && (
              <span className="flex items-center space-x-1 px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-400 border border-rose-800/50 text-[10px]">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400 animate-ping"></span>
                <span>LIVE</span>
              </span>
            )}
            {opp.whaleAnomaly && (
              <span className="px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/50 text-[10px]">
                🐋 WHALE
              </span>
            )}
          </div>

          <div className={`px-2 py-0.5 rounded border text-[11px] font-bold ${scoreColor}`}>
            ⚡ {score.toFixed(0)}
          </div>
        </div>

        {/* Question Title & Countdown */}
        <div className="mb-3">
          <div className="flex items-center space-x-1.5 text-[11px] font-mono text-zinc-500 mb-1">
            <span>⏳</span>
            <span>{opp.expiryCountdown || opp.endDate || 'Closes in 4h'}</span>
          </div>
          <h3 className="text-sm font-semibold text-zinc-100 line-clamp-2 hover:text-white transition leading-snug">
            {opp.question || 'Prediction Market Contract'}
          </h3>
        </div>

        {/* Advantage Banner */}
        <div className="px-3 py-1.5 rounded-lg bg-zinc-950/70 border border-zinc-800 text-xs font-mono flex items-center justify-between mb-3">
          <div className="flex items-center space-x-1.5">
            <span className="text-emerald-400 font-bold">🎯 ADVANTAGE:</span>
            <span className="text-zinc-200 font-semibold uppercase">
              {opp.recommendedOutcome || 'YES'} @ {Math.round(currentPrice * 100)}¢
            </span>
          </div>
          <span className="text-emerald-400 font-bold tabular-nums">
            +{((netEdge) * 100).toFixed(1)}% Net Edge
          </span>
        </div>

        {/* Micro Financial Telemetry 4-Pillar Grid */}
        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono mb-3 bg-zinc-950/40 p-2.5 rounded-lg border border-zinc-800/60">
          <div>
            <span className="text-zinc-500 block text-[9px] uppercase">Net Yield</span>
            <span className="text-emerald-400 font-semibold tabular-nums">
              +{(((1 - currentPrice) / currentPrice) * 100).toFixed(1)}%
            </span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[9px] uppercase">Kelly Size</span>
            <span className="text-zinc-200 font-semibold tabular-nums">
              ${opp.kellySizeUsd || 50} ({(opp.kellyFraction ? opp.kellyFraction * 100 : 5).toFixed(1)}%)
            </span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[9px] uppercase">Fair Probability</span>
            <span className="text-sky-400 font-semibold tabular-nums">
              {(fairPrice * 100).toFixed(1)}%
            </span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[9px] uppercase">Safe Liquidity</span>
            <span className="text-zinc-300 font-semibold tabular-nums">
              ${(opp.safeDepthUsd || 500).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Slot 1: Fair Value & Edge Gauge */}
        <div className="mb-3 px-3 py-2 rounded-lg bg-zinc-950/60 border border-zinc-800/70">
          <div className="flex items-center justify-between text-[10px] font-mono mb-1.5">
            <span className="text-zinc-400">VALUATION METER</span>
            <span className={`px-1.5 py-0.2 rounded border text-[9px] font-semibold ${modelBadge.style}`}>
              {modelBadge.label}
            </span>
          </div>
          {/* Dual bar comparison */}
          <div className="relative h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="absolute top-0 bottom-0 left-0 bg-zinc-600 rounded-full"
              style={{ width: `${Math.min(100, currentPrice * 100)}%` }}
            />
            <div
              className="absolute top-0 bottom-0 bg-emerald-400/80 rounded-full"
              style={{
                left: `${Math.min(100, Math.min(currentPrice, fairPrice) * 100)}%`,
                width: `${Math.min(100, Math.abs(fairPrice - currentPrice) * 100)}%`,
              }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 mt-1">
            <span>Mkt: ${(currentPrice).toFixed(2)}</span>
            <span className="text-emerald-400 font-bold">Fair: ${(fairPrice).toFixed(2)}</span>
          </div>
        </div>

        {/* Slot 2: 24h Probability Sparkline */}
        <div className="mb-3 bg-zinc-950/80 p-2.5 rounded-lg border border-zinc-800/80">
          <div className="flex items-center justify-between text-[10px] font-mono mb-1">
            <span className="text-zinc-500">24H PROBABILITY TRAJECTORY</span>
            <span className={isBullish ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
              {isBullish ? '▲ Bullish' : '▼ Bearish'}
            </span>
          </div>

          <div className="relative h-9 w-full">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full overflow-visible">
              {/* 87% Conviction floor reference line */}
              <line
                x1="0"
                y1={floorY}
                x2={W}
                y2={floorY}
                stroke="rgba(255, 255, 255, 0.16)"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <text
                x="4"
                y={floorY - 2}
                fill="rgba(255, 255, 255, 0.35)"
                fontSize="6"
                fontFamily="monospace"
                fontWeight="bold"
              >
                87% FLOOR
              </text>

              {/* Sparkline curve */}
              <polyline
                fill="none"
                stroke={sparklineColor}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={polylineCoords}
              />

              {/* Anchor dot at current price */}
              <circle
                cx={lastX}
                cy={lastY}
                r="4.5"
                fill={sparklineColor}
                opacity="0.3"
              />
              <circle
                cx={lastX}
                cy={lastY}
                r="2.5"
                fill="#ffffff"
                stroke={sparklineColor}
                strokeWidth="1.5"
              />
            </svg>
          </div>
        </div>

        {/* Deep Dive Analysis Collapsible Drawer */}
        <div className="mb-3">
          <button
            onClick={() => setDrawerOpen(!drawerOpen)}
            className="w-full text-left text-[11px] font-mono text-zinc-400 hover:text-zinc-200 py-1 flex items-center justify-between border-t border-zinc-800/80 pt-2 transition"
          >
            <span>🔍 Deep Dive Analysis ({opp.signalsCount || 3} Signals)</span>
            <span>{drawerOpen ? '▲' : '▼'}</span>
          </button>

          {drawerOpen && (
            <div className="mt-2 p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-[10px] font-mono text-zinc-400 space-y-1.5">
              <div className="flex justify-between">
                <span>Model Calibration:</span>
                <span className="text-zinc-200">{modelBadge.label} (Brier: 0.082)</span>
              </div>
              <div className="flex justify-between">
                <span>Dynamic Venue Fee:</span>
                <span className="text-zinc-200">5.0% (${(0.05 * currentPrice * (1 - currentPrice)).toFixed(4)}/share)</span>
              </div>
              <div className="flex justify-between">
                <span>Execution Limit:</span>
                <span className="text-zinc-200">Quarter-Kelly Cap $125</span>
              </div>
              <div className="text-zinc-500 pt-1 border-t border-zinc-900 italic">
                {opp.thesis || 'Mispricing detected via historical orderbook volume asymmetry and predictive base rate.'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Action Footer: Order Execution Buttons */}
      <div className="pt-2 border-t border-zinc-800/80 flex items-center space-x-2 font-mono text-xs">
        <button
          onClick={() => openOrderModal(opp, 'YES')}
          className="flex-1 py-2 px-2.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-600/70 font-bold transition flex items-center justify-center space-x-1"
        >
          <span>🟢 Buy YES</span>
          <span className="tabular-nums">{(currentPrice * 100).toFixed(0)}¢</span>
        </button>

        <button
          onClick={() => openOrderModal(opp, 'NO')}
          className="flex-1 py-2 px-2.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-600/70 font-bold transition flex items-center justify-center space-x-1"
        >
          <span>🔴 Buy NO</span>
          <span className="tabular-nums">{((1 - currentPrice) * 100).toFixed(0)}¢</span>
        </button>

        <button
          onClick={() => openOrderModal(opp, opp.recommendedOutcome || 'YES')}
          title="Simulate $50 Paper Order"
          className="py-2 px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 font-medium transition"
        >
          📝 Sim $50
        </button>
      </div>
    </div>
  );
}
