import React, { useState } from 'react';
import { useTrading } from '../../context/TradingContext';

export default function TxFlowTelemetryWidget() {
  const {
    executionMode,
    txflowStatus,
    refreshTxFlowStatus,
    claimFaucet,
    transferCollateral,
  } = useTrading();

  const [actionNotice, setActionNotice] = useState(null);
  const [transferAmount, setTransferAmount] = useState('1000');
  const [copiedKey, setCopiedKey] = useState(null);

  // Widget renders when executionMode is 'txflow'
  if (executionMode !== 'txflow') {
    return null;
  }

  const handleCopy = (keyName, text) => {
    if (!text) return;
    try {
      navigator.clipboard.writeText(text);
      setCopiedKey(keyName);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (_) {}
  };

  const handleClaimFaucet = async () => {
    setActionNotice(null);
    try {
      const res = await claimFaucet();
      setActionNotice({
        type: 'success',
        text: `✓ Faucet claimed +${res.amount || '1,000'} USDC to Perp sub-account (tx: ${(res.txHash || '').substring(0, 14)}...)`,
      });
    } catch (err) {
      setActionNotice({
        type: 'error',
        text: `Faucet request failed: ${err.message}`,
      });
    }
  };

  const handleTransfer = async () => {
    setActionNotice(null);
    const amt = parseFloat(transferAmount) || 1000;
    try {
      const res = await transferCollateral(amt);
      setActionNotice({
        type: 'success',
        text: `✓ Transferred $${res.amount || amt} USDC from Perp to Outcome sub-account (tx: ${(res.txHash || '').substring(0, 14)}...)`,
      });
    } catch (err) {
      setActionNotice({
        type: 'error',
        text: `Transfer failed: ${err.message}`,
      });
    }
  };

  const masterAddr = txflowStatus.masterAddress || '0x49f2b8a36c5d1e7e8a9b0c1d2e3f4a5b6c7d8e9f';
  const agentAddr = txflowStatus.agentAddress || '0x88b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5';
  const perpBalance = Number(txflowStatus.perpBalanceUsd || 0);
  const outcomeBalance = Number(txflowStatus.outcomeBalanceUsd || 0);
  const isApproved = !!txflowStatus.isAgentApproved;

  // Combine recent orders and traces for real-time queue display
  const traces = (txflowStatus.recentOrders && txflowStatus.recentOrders.length > 0)
    ? txflowStatus.recentOrders
    : (txflowStatus.recentTraces || []);

  return (
    <div className="bg-gradient-to-r from-purple-950/40 via-zinc-900 to-zinc-900 border border-purple-800/50 hover:border-purple-700/80 rounded-xl p-4 sm:p-5 mb-5 shadow-xl transition font-mono">
      {/* Header Strip */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-purple-900/40">
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-lg bg-purple-950/80 border border-purple-500/50 flex items-center justify-center text-xl shrink-0 shadow-inner">
            ⚡
          </div>
          <div>
            <div className="flex items-center space-x-2.5">
              <h3 className="text-sm sm:text-base font-bold text-zinc-100 flex items-center space-x-2">
                <span>TxFlow Testnet Settlement & Orderbook Telemetry</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-700/60 font-semibold">
                  TIP 3: Outcome Markets
                </span>
              </h3>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-400 mt-0.5">
              <span>Chain ID: <strong className="text-purple-300">{txflowStatus.chainId || 2511}</strong></span>
              <span className="text-zinc-600">•</span>
              <span>RPC: <code className="text-zinc-300">https://rpc.txflow-testnet.xyz</code></span>
              <span className="text-zinc-600">•</span>
              <span className="flex items-center space-x-1 text-emerald-400">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Gateway Connected</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 self-start md:self-auto">
          <button
            type="button"
            onClick={() => refreshTxFlowStatus()}
            className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs border border-zinc-700 transition flex items-center space-x-1"
            title="Refresh TxFlow Telemetry"
          >
            <span>🔄</span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div
          className={`mt-3 p-2.5 rounded-lg text-xs font-semibold flex items-center justify-between border ${
            actionNotice.type === 'success'
              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
              : 'bg-rose-950/80 text-rose-300 border-rose-700'
          }`}
        >
          <span>{actionNotice.text}</span>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            className="text-zinc-400 hover:text-white ml-2"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Grid: Keys & Balances */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-4">
        {/* Master Account Card */}
        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase">
            <span>MASTER ACCOUNT</span>
            <button
              type="button"
              onClick={() => handleCopy('master', masterAddr)}
              className="text-purple-400 hover:text-purple-300 text-[10px]"
            >
              {copiedKey === 'master' ? 'COPIED!' : 'COPY'}
            </button>
          </div>
          <div className="text-xs text-zinc-200 font-semibold truncate mt-1" title={masterAddr}>
            {masterAddr ? `${masterAddr.substring(0, 8)}...${masterAddr.substring(masterAddr.length - 6)}` : 'Not loaded'}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1 flex items-center space-x-1">
            <span>Authority:</span>
            <span className="text-zinc-400 font-medium">Faucet / Transfer / Approve</span>
          </div>
        </div>

        {/* Agent Key Card & Authorization Status */}
        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase">
            <span>AGENT KEY (DELEGATE)</span>
            <button
              type="button"
              onClick={() => handleCopy('agent', agentAddr)}
              className="text-purple-400 hover:text-purple-300 text-[10px]"
            >
              {copiedKey === 'agent' ? 'COPIED!' : 'COPY'}
            </button>
          </div>
          <div className="text-xs text-zinc-200 font-semibold truncate mt-1" title={agentAddr}>
            {agentAddr ? `${agentAddr.substring(0, 8)}...${agentAddr.substring(agentAddr.length - 6)}` : 'Not loaded'}
          </div>
          <div className="mt-1.5 flex items-center">
            {isApproved ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-emerald-950/90 text-emerald-400 border border-emerald-600 flex items-center space-x-1">
                <span>✓</span>
                <span>AGENT KEY AUTHORIZED</span>
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-amber-950/90 text-amber-400 border border-amber-600 animate-pulse flex items-center space-x-1">
                <span>⚠️</span>
                <span>APPROVE AGENT REQUIRED</span>
              </span>
            )}
          </div>
        </div>

        {/* Perp Sub-Account Card */}
        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase">
            <span>PERP SUB-ACCOUNT</span>
            <span className="text-[10px] text-zinc-500">FAUCET VAULT</span>
          </div>
          <div className="text-base font-bold text-zinc-100 tabular-nums mt-1">
            ${perpBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="text-xs text-zinc-500 font-normal ml-1">USDC</span>
          </div>
          <div className="mt-2">
            <button
              type="button"
              onClick={handleClaimFaucet}
              disabled={txflowStatus.faucetLoading}
              className={`w-full py-1 px-2 rounded-md text-[11px] font-bold transition flex items-center justify-center space-x-1.5 border shadow-sm ${
                txflowStatus.faucetLoading
                  ? 'bg-purple-950/40 text-purple-400 border-purple-800 cursor-wait'
                  : 'bg-purple-950/80 hover:bg-purple-900 text-purple-200 border-purple-700/80'
              }`}
            >
              <span>{txflowStatus.faucetLoading ? '⏳' : '🎁'}</span>
              <span>{txflowStatus.faucetLoading ? 'Claiming Faucet...' : 'Claim Faucet (+1,000 USDC)'}</span>
            </button>
          </div>
        </div>

        {/* Outcome Sub-Account Card */}
        <div className="bg-zinc-950/70 border border-zinc-800/80 rounded-lg p-3">
          <div className="flex items-center justify-between text-[10px] text-zinc-500 uppercase">
            <span>OUTCOME SUB-ACCOUNT</span>
            <span className="text-[10px] text-purple-400 font-semibold">PREDICTION MARGIN</span>
          </div>
          <div className="text-base font-bold text-purple-300 tabular-nums mt-1">
            ${outcomeBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="text-xs text-zinc-500 font-normal ml-1">USDC</span>
          </div>
          <div className="mt-2">
            <button
              type="button"
              onClick={handleTransfer}
              disabled={txflowStatus.transferLoading || perpBalance <= 0}
              className={`w-full py-1 px-2 rounded-md text-[11px] font-bold transition flex items-center justify-center space-x-1.5 border shadow-sm ${
                txflowStatus.transferLoading || perpBalance <= 0
                  ? 'bg-zinc-900 text-zinc-600 border-zinc-800 cursor-not-allowed'
                  : 'bg-emerald-950/80 hover:bg-emerald-900 text-emerald-200 border-emerald-700/80'
              }`}
            >
              <span>{txflowStatus.transferLoading ? '⏳' : '⇄'}</span>
              <span>
                {txflowStatus.transferLoading
                  ? 'Rebalancing...'
                  : perpBalance > 0
                  ? 'Transfer Perp → Outcome'
                  : 'Deposit Faucet First'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Asynchronous Execution Queue Strip */}
      <div className="mt-4 pt-3 border-t border-zinc-800/70">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
              Asynchronous Order Execution Queue
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
              {traces.length} Traces Tracked
            </span>
          </div>
          <div className="flex items-center space-x-3 text-[10px] text-zinc-500 hidden sm:flex">
            <span className="flex items-center space-x-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
              <span>QUEUED</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400"></span>
              <span>MATCHED</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
              <span>FILLED</span>
            </span>
          </div>
        </div>

        {traces.length === 0 ? (
          <div className="py-4 text-center text-xs text-zinc-500 bg-zinc-950/40 rounded-lg border border-zinc-900">
            No TxFlow orders resting or queued. Place an order via the Order Modal in TxFlow mode to view on-chain traces.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 terminal-scrollbar">
            {traces.slice().reverse().map((t, idx) => {
              const traceId = t.traceId || t.cloid || `trace_${idx}`;
              const isQueued = t.status === 'QUEUED';
              const isMatched = t.status === 'RESTING' || t.status === 'MATCHED';
              const isFilled = t.status === 'FILLED';
              const isCancelled = t.status === 'CANCELLED';

              const badgeColor = isFilled
                ? 'bg-emerald-950/80 text-emerald-400 border-emerald-600'
                : isMatched
                ? 'bg-sky-950/80 text-sky-400 border-sky-600'
                : isQueued
                ? 'bg-amber-950/80 text-amber-400 border-amber-600 animate-pulse'
                : 'bg-zinc-800 text-zinc-400 border-zinc-700';

              const displayStatus = isFilled
                ? 'FILLED'
                : isMatched
                ? 'ON-CHAIN MATCHED'
                : isQueued
                ? `QUEUED: ${traceId.substring(0, 10)}...`
                : (t.status || 'UNKNOWN');

              return (
                <div
                  key={traceId + idx}
                  className="flex flex-wrap items-center justify-between p-2 rounded bg-zinc-950/60 border border-zinc-800/80 text-xs gap-2"
                >
                  <div className="flex items-center space-x-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badgeColor}`}>
                      {displayStatus}
                    </span>
                    <span className="text-zinc-400 font-mono text-[11px] truncate max-w-[140px] sm:max-w-xs" title={traceId}>
                      {traceId}
                    </span>
                  </div>

                  <div className="flex items-center space-x-3 text-[11px] text-zinc-400">
                    <span className="font-semibold text-zinc-200">
                      {t.side || (t.isBuy ? 'BUY' : 'SELL')} {t.size ? `${t.size} sh` : ''}
                    </span>
                    {t.price && (
                      <span className="text-zinc-300">
                        @ ${Number(t.price).toFixed(3)}
                      </span>
                    )}
                    <span className="text-zinc-500 text-[10px]">
                      {t.timestamp ? new Date(t.timestamp).toLocaleTimeString() : ''}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
