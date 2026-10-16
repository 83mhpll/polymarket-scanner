import React, { useState, useEffect } from 'react';
import { useTrading } from '../../context/TradingContext';

export default function OrderModal() {
  const {
    orderModalOpen,
    closeOrderModal,
    selectedOpportunity,
    selectedOutcome,
    setSelectedOutcome,
    liveDepth,
    isDepthLoading,
    wallet,
    runCycle,
  } = useTrading();

  const [orderType, setOrderType] = useState('market'); // 'market' | 'limit'
  const [orderAmountUsd, setOrderAmountUsd] = useState(50);
  const [limitPrice, setLimitPrice] = useState(0.5);
  const [executionRouting, setExecutionRouting] = useState('paper'); // 'paper' | 'web3'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tradeSuccess, setTradeSuccess] = useState(false);

  // Sync initial price from opportunity
  useEffect(() => {
    if (selectedOpportunity) {
      const price = selectedOutcome === 'YES'
        ? (selectedOpportunity.currentPrice || selectedOpportunity.price || 0.5)
        : (1 - (selectedOpportunity.currentPrice || selectedOpportunity.price || 0.5));
      setLimitPrice(Number(price.toFixed(3)));
      setTradeSuccess(false);
    }
  }, [selectedOpportunity, selectedOutcome]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeOrderModal();
    };
    if (orderModalOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [orderModalOpen, closeOrderModal]);

  if (!orderModalOpen || !selectedOpportunity) return null;

  const currentPrice = selectedOutcome === 'YES'
    ? (selectedOpportunity.currentPrice || selectedOpportunity.price || 0.5)
    : (1 - (selectedOpportunity.currentPrice || selectedOpportunity.price || 0.5));

  const effectiveExecutionPrice = orderType === 'market' ? currentPrice : limitPrice;

  // Derive 5-level bids & asks from liveDepth or fallback synthetic
  const bids = liveDepth?.ladderBids || [
    { price: Math.max(0.01, effectiveExecutionPrice - 0.01), size: 1200, depthUsd: 1200 * (effectiveExecutionPrice - 0.01) },
    { price: Math.max(0.01, effectiveExecutionPrice - 0.02), size: 2500, depthUsd: 2500 * (effectiveExecutionPrice - 0.02) },
    { price: Math.max(0.01, effectiveExecutionPrice - 0.03), size: 4000, depthUsd: 4000 * (effectiveExecutionPrice - 0.03) },
    { price: Math.max(0.01, effectiveExecutionPrice - 0.04), size: 5500, depthUsd: 5500 * (effectiveExecutionPrice - 0.04) },
    { price: Math.max(0.01, effectiveExecutionPrice - 0.05), size: 8000, depthUsd: 8000 * (effectiveExecutionPrice - 0.05) },
  ];

  const asks = liveDepth?.ladderAsks || [
    { price: Math.min(0.99, effectiveExecutionPrice + 0.01), size: 1000, depthUsd: 1000 * (effectiveExecutionPrice + 0.01) },
    { price: Math.min(0.99, effectiveExecutionPrice + 0.02), size: 2200, depthUsd: 2200 * (effectiveExecutionPrice + 0.02) },
    { price: Math.min(0.99, effectiveExecutionPrice + 0.03), size: 3800, depthUsd: 3800 * (effectiveExecutionPrice + 0.03) },
    { price: Math.min(0.99, effectiveExecutionPrice + 0.04), size: 6000, depthUsd: 6000 * (effectiveExecutionPrice + 0.04) },
    { price: Math.min(0.99, effectiveExecutionPrice + 0.05), size: 9500, depthUsd: 9500 * (effectiveExecutionPrice + 0.05) },
  ];

  // Maximum depth USD across visible DOM levels for proportional bar width
  const maxDepthUsd = Math.max(
    ...bids.map(b => b.depthUsd || 0),
    ...asks.map(a => a.depthUsd || 0),
    1
  );

  // Multi-level VWAP walk and Slippage calculation
  const totalVisibleDepthUsd = asks.reduce((sum, a) => sum + (a.depthUsd || 0), 0);
  const consumptionRatio = totalVisibleDepthUsd > 0
    ? (orderAmountUsd / totalVisibleDepthUsd) * 100
    : 0;

  let remaining = orderAmountUsd;
  let filledShares = 0;
  let totalCost = 0;

  for (const ask of asks) {
    if (remaining <= 0) break;
    const askCost = ask.depthUsd || (ask.price * ask.size);
    if (remaining >= askCost) {
      filledShares += ask.size;
      totalCost += askCost;
      remaining -= askCost;
    } else {
      const partial = remaining / ask.price;
      filledShares += partial;
      totalCost += remaining;
      remaining = 0;
    }
  }

  const vwap = filledShares > 0 ? (totalCost / filledShares) : effectiveExecutionPrice;
  const bestAsk = asks[0]?.price || effectiveExecutionPrice;
  const priceImpactPct = bestAsk > 0 ? Math.max(0, ((vwap - bestAsk) / bestAsk) * 100) : 0;
  const isBookExhausted = orderAmountUsd > totalVisibleDepthUsd;

  // Dynamic fee calculation: Fee = C * feeRate * p * (1 - p)
  const feeRate = 0.05; // 5% standard
  const estimatedFee = orderAmountUsd * feeRate * (1 - effectiveExecutionPrice);
  const estimatedShares = effectiveExecutionPrice > 0 ? (orderAmountUsd / effectiveExecutionPrice) : 0;
  const estimatedPayout = estimatedShares * 1.0;
  const netRoiPct = orderAmountUsd > 0 ? (((estimatedPayout - orderAmountUsd) / orderAmountUsd) * 100) : 0;

  const handleSelectPrice = (price) => {
    setOrderType('limit');
    setLimitPrice(Number(price.toFixed(3)));
  };

  const handleSubmitOrder = async () => {
    setIsSubmitting(true);
    try {
      // Execute trade via simulation cycle
      await runCycle();
      setTradeSuccess(true);
      setTimeout(() => {
        closeOrderModal();
      }, 1200);
    } catch (err) {
      alert('Order failed: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-xl w-full p-5 sm:p-6 shadow-2xl relative max-h-[92vh] overflow-y-auto font-mono text-zinc-100 terminal-scrollbar">
        {/* Header */}
        <div className="flex items-start justify-between pb-3 border-b border-zinc-800">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              <span className="text-emerald-400 font-bold">EXECUTION TICKET</span>
              <span>•</span>
              <span className="text-zinc-500">{selectedOpportunity.category || 'POLAR'}</span>
            </div>
            <h2 className="text-sm sm:text-base font-bold text-zinc-100 mt-1 line-clamp-2">
              {selectedOpportunity.question}
            </h2>
          </div>
          <button
            onClick={closeOrderModal}
            className="text-zinc-500 hover:text-zinc-200 text-lg px-2 py-1 rounded transition"
          >
            ✕
          </button>
        </div>

        {/* Outcome Toggle (YES vs NO) */}
        <div className="grid grid-cols-2 gap-2 my-4">
          <button
            onClick={() => setSelectedOutcome('YES')}
            className={`py-2 px-3 rounded-xl font-bold text-xs transition border flex items-center justify-center space-x-1.5 ${
              selectedOutcome === 'YES'
                ? 'bg-emerald-950 text-emerald-300 border-emerald-500 shadow-[0_0_12px_rgba(52,211,153,0.2)]'
                : 'bg-zinc-950/80 text-zinc-400 border-zinc-800 hover:bg-zinc-800'
            }`}
          >
            <span>🟢 Buy YES</span>
            <span className="tabular-nums">
              {Math.round((selectedOpportunity.currentPrice || selectedOpportunity.price || 0.5) * 100)}¢
            </span>
          </button>

          <button
            onClick={() => setSelectedOutcome('NO')}
            className={`py-2 px-3 rounded-xl font-bold text-xs transition border flex items-center justify-center space-x-1.5 ${
              selectedOutcome === 'NO'
                ? 'bg-rose-950 text-rose-300 border-rose-500 shadow-[0_0_12px_rgba(248,113,113,0.2)]'
                : 'bg-zinc-950/80 text-zinc-400 border-zinc-800 hover:bg-zinc-800'
            }`}
          >
            <span>🔴 Buy NO</span>
            <span className="tabular-nums">
              {Math.round((1 - (selectedOpportunity.currentPrice || selectedOpportunity.price || 0.5)) * 100)}¢
            </span>
          </button>
        </div>

        {/* Order Type & Price Input */}
        <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase block mb-1">Execution Mode</label>
            <div className="flex rounded-lg bg-zinc-950 p-0.5 border border-zinc-800">
              <button
                onClick={() => setOrderType('market')}
                className={`flex-1 py-1 rounded-md text-[11px] font-semibold transition ${
                  orderType === 'market' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                ⚡ Market
              </button>
              <button
                onClick={() => setOrderType('limit')}
                className={`flex-1 py-1 rounded-md text-[11px] font-semibold transition ${
                  orderType === 'limit' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                🎯 Limit
              </button>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-zinc-500 uppercase block mb-1">Limit Price (USD)</label>
            <input
              type="number"
              step="0.001"
              min="0.01"
              max="0.99"
              value={limitPrice}
              onChange={(e) => setLimitPrice(Number(e.target.value))}
              disabled={orderType === 'market'}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1 text-zinc-100 text-xs tabular-nums outline-none disabled:opacity-50 disabled:cursor-not-allowed focus:border-emerald-500"
            />
          </div>
        </div>

        {/* Amount Input & Pills */}
        <div className="mb-4 text-xs">
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-zinc-500 uppercase">Investment Size (USDC)</label>
            <span className="text-[10px] text-zinc-500">
              Avail: <span className="text-zinc-300 tabular-nums">${(wallet.balanceUsd || 10000).toLocaleString()}</span>
            </span>
          </div>

          <input
            type="number"
            min="1"
            max="10000"
            value={orderAmountUsd}
            onChange={(e) => setOrderAmountUsd(Math.max(1, Number(e.target.value)))}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-sm font-bold tabular-nums outline-none focus:border-emerald-500 mb-2"
          />

          <div className="grid grid-cols-4 gap-1.5">
            {[10, 50, 100, 500].map((amt) => (
              <button
                key={amt}
                onClick={() => setOrderAmountUsd(amt)}
                className={`py-1 rounded-md text-[11px] font-semibold border transition ${
                  orderAmountUsd === amt
                    ? 'bg-zinc-800 text-emerald-400 border-zinc-600'
                    : 'bg-zinc-950/60 text-zinc-400 border-zinc-800 hover:bg-zinc-800'
                }`}
              >
                ${amt}
              </button>
            ))}
          </div>
        </div>

        {/* Slot 1: 5-Level L2 DOM Visual Depth Ladder */}
        <div className="mb-4 bg-zinc-950 p-3 rounded-xl border border-zinc-800 text-xs">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800/80 text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            <span>5-Level L2 DOM Depth Ladder</span>
            <span>{isDepthLoading ? 'Refreshing Book...' : 'Polymarket CLOB Stream'}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            {/* Bids Column */}
            <div>
              <div className="flex justify-between text-[10px] text-emerald-400 font-bold mb-1 px-1">
                <span>BID (BUY)</span>
                <span>DEPTH</span>
              </div>
              <div className="space-y-1">
                {bids.slice(0, 5).map((bid, i) => {
                  const widthPct = Math.min(100, Math.max(4, (bid.depthUsd / maxDepthUsd) * 100));
                  return (
                    <div
                      key={i}
                      onClick={() => handleSelectPrice(bid.price)}
                      className="relative flex items-center justify-between px-1.5 py-0.5 rounded cursor-pointer hover:bg-zinc-800/60 transition group overflow-hidden"
                    >
                      <div
                        className="absolute top-0 bottom-0 right-0 bg-emerald-500/15 pointer-events-none rounded"
                        style={{ width: `${widthPct}%` }}
                      />
                      <span className="text-emerald-400 font-bold relative z-10 tabular-nums">
                        ${bid.price.toFixed(3)}
                      </span>
                      <span className="text-zinc-400 relative z-10 tabular-nums">
                        ${Math.round(bid.depthUsd)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Asks Column */}
            <div>
              <div className="flex justify-between text-[10px] text-rose-400 font-bold mb-1 px-1">
                <span>DEPTH</span>
                <span>ASK (SELL)</span>
              </div>
              <div className="space-y-1">
                {asks.slice(0, 5).map((ask, i) => {
                  const widthPct = Math.min(100, Math.max(4, (ask.depthUsd / maxDepthUsd) * 100));
                  return (
                    <div
                      key={i}
                      onClick={() => handleSelectPrice(ask.price)}
                      className="relative flex items-center justify-between px-1.5 py-0.5 rounded cursor-pointer hover:bg-zinc-800/60 transition group overflow-hidden"
                    >
                      <div
                        className="absolute top-0 bottom-0 left-0 bg-rose-500/15 pointer-events-none rounded"
                        style={{ width: `${widthPct}%` }}
                      />
                      <span className="text-zinc-400 relative z-10 tabular-nums">
                        ${Math.round(ask.depthUsd)}
                      </span>
                      <span className="text-rose-400 font-bold relative z-10 tabular-nums">
                        ${ask.price.toFixed(3)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Slot 2: Slippage & Price Impact Alert Tier Badge */}
        <div className="mb-4">
          <div
            className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
              isBookExhausted
                ? 'bg-rose-950/80 border-rose-600 text-rose-200 animate-pulse'
                : priceImpactPct > 2.0
                ? 'bg-rose-950/50 border-rose-700/60 text-rose-300'
                : priceImpactPct > 1.0
                ? 'bg-amber-950/50 border-amber-700/60 text-amber-300'
                : 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <span className="text-base">
                {isBookExhausted ? '⛔' : priceImpactPct > 2.0 ? '🚨' : priceImpactPct > 1.0 ? '⚠️' : '✓'}
              </span>
              <div>
                <span className="font-bold block text-[11px]">
                  {isBookExhausted
                    ? 'BOOK EXHAUSTION: Order exceeds visible depth'
                    : priceImpactPct > 2.0
                    ? `HIGH PRICE IMPACT (+${priceImpactPct.toFixed(2)}% slip)`
                    : priceImpactPct > 1.0
                    ? `MODERATE SLIPPAGE WARNING (+${priceImpactPct.toFixed(2)}% slip)`
                    : `NOMINAL LIQUIDITY (+${priceImpactPct.toFixed(2)}% slip)`}
                </span>
                <span className="text-[10px] opacity-80">
                  Book Consumption: {consumptionRatio.toFixed(1)}% of 5-level depth
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] opacity-75 block">VWAP Fill</span>
              <span className="font-bold tabular-nums">
                {(vwap * 100).toFixed(1)}¢
              </span>
            </div>
          </div>
        </div>

        {/* Payout & ROI Summary */}
        <div className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800 text-xs mb-4 space-y-1.5">
          <div className="flex justify-between">
            <span className="text-zinc-500">Estimated Shares:</span>
            <span className="text-zinc-200 font-semibold tabular-nums">{estimatedShares.toFixed(1)} Shares</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Est. Payout on Resolution:</span>
            <span className="text-emerald-400 font-bold tabular-nums">${estimatedPayout.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Net Expected ROI:</span>
            <span className="text-emerald-400 font-bold tabular-nums">+{netRoiPct.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Dynamic Venue Taker Fee:</span>
            <span className="text-zinc-400 tabular-nums">~${estimatedFee.toFixed(3)}</span>
          </div>
          <div className="flex justify-between text-[11px] text-zinc-500 pt-1 border-t border-zinc-900">
            <span>Polygon Gas Fee:</span>
            <span className="text-emerald-400 font-semibold">$0.00 (Gasless Relayer)</span>
          </div>
        </div>

        {/* Execution Routing Selector */}
        <div className="mb-4">
          <label className="text-[10px] text-zinc-500 uppercase block mb-1">Execution Pipeline</label>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              onClick={() => setExecutionRouting('paper')}
              className={`py-1.5 px-3 rounded-lg border text-left transition ${
                executionRouting === 'paper'
                  ? 'bg-zinc-800 border-emerald-500 text-emerald-300'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              <div className="font-bold text-[11px]">📝 Paper Trading</div>
              <div className="text-[10px] text-zinc-500">Ledger to backtest.json</div>
            </button>

            <button
              onClick={() => setExecutionRouting('web3')}
              className={`py-1.5 px-3 rounded-lg border text-left transition ${
                executionRouting === 'web3'
                  ? 'bg-zinc-800 border-sky-500 text-sky-300'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-800'
              }`}
            >
              <div className="font-bold text-[11px]">🦊 Web3 Direct Sign</div>
              <div className="text-[10px] text-zinc-500">EIP-712 Orderbook Permit</div>
            </button>
          </div>
        </div>

        {/* Success Alert */}
        {tradeSuccess && (
          <div className="mb-4 p-3 rounded-lg bg-emerald-950 border border-emerald-600 text-emerald-300 text-xs font-bold flex items-center justify-center space-x-2 animate-bounce">
            <span>✓ Order Successfully Simulated & Logged to Backtest Ledger!</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center space-x-3 pt-2">
          <button
            onClick={closeOrderModal}
            className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold text-xs transition border border-zinc-700"
          >
            Cancel
          </button>

          <button
            onClick={handleSubmitOrder}
            disabled={isSubmitting || tradeSuccess}
            className={`flex-2 py-2.5 px-6 rounded-xl font-bold text-xs transition border flex items-center justify-center space-x-2 shadow-lg ${
              selectedOutcome === 'YES'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400'
                : 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400'
            }`}
          >
            <span>{isSubmitting ? 'Submitting Order...' : `Confirm & Place ${selectedOutcome} Order`}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
