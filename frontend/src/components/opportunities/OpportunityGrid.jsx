import React, { useState, useMemo } from 'react';
import { useTrading } from '../../context/TradingContext';
import OpportunityCard from './OpportunityCard';

const CATEGORIES = ['All', 'Crypto', 'Weather', 'Politics', 'Sports', 'Finance'];
const SORT_OPTIONS = [
  { id: 'score', label: 'Conviction Score' },
  { id: 'netEdge', label: 'Net Edge (%)' },
  { id: 'price', label: 'Price (Low to High)' },
  { id: 'yield', label: 'Net Yield' },
];

export default function OpportunityGrid() {
  const { opportunities, loading, error, refreshOpportunities } = useTrading();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [sortBy, setSortBy] = useState('score');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshOpportunities(true);
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredOpportunities = useMemo(() => {
    return (opportunities || [])
      .filter((opp) => {
        const matchesCategory =
          selectedCategory === 'All' ||
          (opp.category && opp.category.toLowerCase().includes(selectedCategory.toLowerCase()));

        const matchesSearch =
          !searchTerm.trim() ||
          (opp.question && opp.question.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (opp.category && opp.category.toLowerCase().includes(searchTerm.toLowerCase()));

        return matchesCategory && matchesSearch;
      })
      .sort((a, b) => {
        if (sortBy === 'score') {
          return (b.score || 0) - (a.score || 0);
        }
        if (sortBy === 'netEdge') {
          return (b.netEdge || 0) - (a.netEdge || 0);
        }
        if (sortBy === 'price') {
          return (a.currentPrice || a.price || 0) - (b.currentPrice || b.price || 0);
        }
        if (sortBy === 'yield') {
          const yieldA = ((1 - (a.currentPrice || 0.5)) / (a.currentPrice || 0.5));
          const yieldB = ((1 - (b.currentPrice || 0.5)) / (b.currentPrice || 0.5));
          return yieldB - yieldA;
        }
        return 0;
      });
  }, [opportunities, selectedCategory, searchTerm, sortBy]);

  return (
    <div className="w-full">
      {/* Controls Bar: Search, Category Filters, Sort, Refresh */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3.5 mb-5 flex flex-col md:flex-row md:items-center justify-between gap-3 font-mono text-xs">
        {/* Left: Search input */}
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search markets by title, topic, token..."
            className="w-full bg-zinc-950/80 border border-zinc-800 focus:border-emerald-500 rounded-lg px-3 py-1.5 text-zinc-100 placeholder-zinc-500 text-xs outline-none transition"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1.5 text-zinc-500 hover:text-zinc-300"
            >
              ✕
            </button>
          )}
        </div>

        {/* Center: Category Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition shrink-0 ${
                selectedCategory === cat
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-zinc-800/60 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 border border-transparent'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Right: Sort and Force Refresh */}
        <div className="flex items-center space-x-2 shrink-0">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-lg px-2.5 py-1 text-zinc-300 text-xs outline-none cursor-pointer"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                Sort: {opt.label}
              </option>
            ))}
          </select>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-900 border border-zinc-700 rounded-lg text-zinc-200 font-medium transition flex items-center space-x-1.5"
          >
            <span className={isRefreshing ? 'animate-spin inline-block' : ''}>🔄</span>
            <span>{isRefreshing ? 'Scanning...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Error notification banner */}
      {error && (
        <div className="mb-4 p-4 rounded-xl bg-rose-950/40 border border-rose-800/80 text-rose-300 text-xs font-mono flex items-center justify-between">
          <span>⚠️ {error} (Backend server communicating on port 3001)</span>
          <button
            onClick={handleRefresh}
            className="px-2 py-0.5 rounded bg-rose-900/60 hover:bg-rose-800 text-rose-200 uppercase font-bold"
          >
            Retry
          </button>
        </div>
      )}

      {/* Opportunities Card Grid */}
      {loading && opportunities.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div
              key={n}
              className="h-96 rounded-xl bg-zinc-900/40 border border-zinc-800 animate-pulse p-4 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="h-4 bg-zinc-800 rounded w-1/3"></div>
                <div className="h-6 bg-zinc-800 rounded w-full"></div>
                <div className="h-10 bg-zinc-800/70 rounded"></div>
                <div className="h-20 bg-zinc-800/50 rounded"></div>
              </div>
              <div className="h-10 bg-zinc-800 rounded"></div>
            </div>
          ))}
        </div>
      ) : filteredOpportunities.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-12 text-center text-zinc-500 font-mono text-sm">
          <div className="text-3xl mb-2">📡</div>
          <div className="text-zinc-300 font-semibold mb-1">No Market Opportunities Found</div>
          <div className="text-xs text-zinc-500 max-w-md mx-auto">
            {searchTerm || selectedCategory !== 'All'
              ? 'No opportunities match your current filter criteria. Try resetting filters or search.'
              : 'The background scanner has not detected alpha mispricings above the conviction threshold.'}
          </div>
          <button
            onClick={handleRefresh}
            className="mt-4 px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono border border-zinc-700"
          >
            Trigger Scanner Run
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOpportunities.map((opp, idx) => (
            <OpportunityCard
              key={opp.id || opp.tokenID || opp.conditionId || idx}
              opportunity={opp}
            />
          ))}
        </div>
      )}
    </div>
  );
}
