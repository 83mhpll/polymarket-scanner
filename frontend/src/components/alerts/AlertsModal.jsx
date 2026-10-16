import React from 'react';
import { useTrading } from '../../context/TradingContext';

export default function AlertsModal() {
  const {
    alertsModalOpen,
    closeAlertsModal,
    alertsList,
    opportunities,
    openOrderModal,
  } = useTrading();

  if (!alertsModalOpen) return null;

  // Derive high conviction alerts from server alerts or active high-edge opps
  const displayAlerts = (alertsList && alertsList.length > 0)
    ? alertsList
    : (opportunities || []).filter(o => (o.score || 0) >= 80 || (o.netEdgePct && o.netEdgePct >= 5)).slice(0, 15);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col font-mono text-xs max-h-[80vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/90">
          <div>
            <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-ping"></span>
              High-Conviction Signals & Alerts
            </h2>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Filtered deals with Conviction Score &ge; 80 or Net Edge &ge; 5%
            </p>
          </div>

          <button
            onClick={closeAlertsModal}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Alerts List */}
        <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
          {displayAlerts.length === 0 ? (
            <div className="p-8 text-center text-zinc-500">
              No active high-conviction alerts detected. Scanner scans every 60s.
            </div>
          ) : (
            displayAlerts.map((item, idx) => {
              const question = item.question || item.marketTopic || item.topic || 'Prediction Market Event';
              const price = item.price ?? item.currentPrice ?? 0.5;
              const score = item.score ?? 85;
              const netEdge = item.netEdgePct ?? (item.netEdge ? item.netEdge * 100 : 5.2);

              return (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-zinc-950/70 border border-zinc-800 hover:border-zinc-700 transition flex items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2 mb-1">
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                        SCORE: {score}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">
                        EDGE: {netEdge > 0 ? `+${netEdge.toFixed(1)}%` : `${netEdge.toFixed(1)}%`}
                      </span>
                      {item.category && (
                        <span className="text-[10px] text-zinc-500 uppercase">
                          {item.category}
                        </span>
                      )}
                    </div>
                    <div className="text-zinc-200 font-semibold truncate text-xs">
                      {question}
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 shrink-0">
                    <div className="text-right">
                      <div className="text-[10px] text-zinc-500 uppercase">Implied</div>
                      <div className="text-zinc-100 font-bold tabular-nums">
                        {(price * 100).toFixed(1)}c
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        closeAlertsModal();
                        openOrderModal(item, 'YES');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-zinc-950 font-bold text-xs transition"
                    >
                      Trade
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-950/50 flex items-center justify-between text-zinc-500">
          <span>{displayAlerts.length} High Priority Alerts Active</span>
          <button
            onClick={closeAlertsModal}
            className="px-4 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
