import React, { useState, useEffect } from 'react';
import { useTrading } from '../../context/TradingContext';

export default function ConfigModal() {
  const {
    configModalOpen,
    closeConfigModal,
    systemConfig,
    saveSystemConfig,
  } = useTrading();

  const [form, setForm] = useState({
    scanIntervalMs: 60000,
    bankroll: 10000,
    minNetEdgePct: 3.5,
    maxPositionPct: 5,
    kellyFraction: 0.25,
    marketShrinkage: 0.5,
    executionMode: 'PASSIVE',
    autoRebalance: true,
  });
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);

  useEffect(() => {
    if (systemConfig) {
      setForm(prev => ({
        ...prev,
        ...systemConfig,
      }));
    }
  }, [systemConfig]);

  if (!configModalOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    try {
      await saveSystemConfig(form);
      setSaveMessage('Configuration updated successfully.');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setSaveMessage('Error saving: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
      <div className="relative w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col font-mono text-xs">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/90">
          <div>
            <h2 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
              Quant Bot & Engine Configuration
            </h2>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Tune Kelly sizing, edge thresholds, and execution modes
            </p>
          </div>

          <button
            onClick={closeConfigModal}
            className="p-1 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          {saveMessage && (
            <div className={`p-2.5 rounded-lg text-xs font-semibold ${
              saveMessage.includes('Error') ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
            }`}>
              {saveMessage}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] text-zinc-400 uppercase font-semibold block mb-1">
                Bankroll Capital (USD)
              </label>
              <input
                type="number"
                value={form.bankroll || 10000}
                onChange={e => setForm({ ...form, bankroll: parseFloat(e.target.value) || 0 })}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-zinc-100 outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] text-zinc-400 uppercase font-semibold block mb-1">
                Scan Interval (Seconds)
              </label>
              <input
                type="number"
                value={(form.scanIntervalMs || 60000) / 1000}
                onChange={e => setForm({ ...form, scanIntervalMs: (parseFloat(e.target.value) || 60) * 1000 })}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-zinc-100 outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] text-zinc-400 uppercase font-semibold block mb-1">
                Min Net Edge (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={form.minNetEdgePct ?? 3.5}
                onChange={e => setForm({ ...form, minNetEdgePct: parseFloat(e.target.value) || 0 })}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-zinc-100 outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] text-zinc-400 uppercase font-semibold block mb-1">
                Max Position Cap (%)
              </label>
              <input
                type="number"
                step="0.5"
                value={form.maxPositionPct ?? 5}
                onChange={e => setForm({ ...form, maxPositionPct: parseFloat(e.target.value) || 0 })}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-zinc-100 outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] text-zinc-400 uppercase font-semibold block mb-1">
                Fractional Kelly (0.1 - 1.0)
              </label>
              <input
                type="number"
                step="0.05"
                min="0.05"
                max="1.0"
                value={form.kellyFraction ?? 0.25}
                onChange={e => setForm({ ...form, kellyFraction: parseFloat(e.target.value) || 0.25 })}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-zinc-100 outline-none"
              />
            </div>

            <div>
              <label className="text-[11px] text-zinc-400 uppercase font-semibold block mb-1">
                Market Shrinkage (0 - 1.0)
              </label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1.0"
                value={form.marketShrinkage ?? 0.5}
                onChange={e => setForm({ ...form, marketShrinkage: parseFloat(e.target.value) || 0.5 })}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-zinc-100 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] text-zinc-400 uppercase font-semibold block mb-1">
              Execution Routing Mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm({ ...form, executionMode: 'PASSIVE' })}
                className={`py-2 px-3 rounded-lg border font-semibold text-center transition ${
                  form.executionMode === 'PASSIVE'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                }`}
              >
                PASSIVE (Maker / Rebates)
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, executionMode: 'AGGRESSIVE' })}
                className={`py-2 px-3 rounded-lg border font-semibold text-center transition ${
                  form.executionMode === 'AGGRESSIVE'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-zinc-200'
                }`}
              >
                AGGRESSIVE (Taker / Instant)
              </button>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-zinc-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={closeConfigModal}
              className="px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold transition disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
