import React from 'react';
import { useTrading } from '../../context/TradingContext';

export default function Sidebar() {
  const {
    activeTab,
    setActiveTab,
    opportunities,
    openPortfolioModal,
    setAlertsModalOpen,
    refreshOpportunities,
    watchlist,
    sidebarOpen,
    setSidebarOpen,
  } = useTrading();

  // Count items for badges
  const counts = React.useMemo(() => {
    const opps = opportunities || [];
    return {
      all: opps.length,
      negrisk: opps.filter(o => o.negRisk).length,
      dust: opps.filter(o => (o.currentPrice || o.price || 0.5) <= 0.05).length,
      cross: opps.filter(o => (o.netEdgePct && o.netEdgePct > 5) || o.category === 'Crypto').length,
      smartmoney: opps.filter(o => (o.score || 0) >= 80).length,
      aimodel: opps.filter(o => o.mispricing?.detected).length,
      whale: opps.filter(o => (o.vol24hr || 0) >= 50000).length,
      watchlist: (watchlist || []).length,
    };
  }, [opportunities, watchlist]);

  const navGroups = [
    {
      title: 'Market Feeds',
      items: [
        { id: 'all', label: 'All Opportunities', icon: '🌐', count: counts.all },
        { id: 'cross', label: 'Cross-Market Arb', icon: '⚡', count: counts.cross },
        { id: 'manifold', label: 'Manifold Arb', icon: '🔮', count: 0 },
        { id: 'smartmoney', label: 'Smart Money Feed', icon: '🐋', count: counts.smartmoney },
        { id: 'aimodel', label: 'AI Mispricing', icon: '🧠', count: counts.aimodel },
      ],
    },
    {
      title: 'Quant Strategies',
      items: [
        { id: 'dust', label: '1¢ Dust Sweeper', icon: '🎯', count: counts.dust },
        { id: 'negrisk', label: 'NegRisk Multi-Arb', icon: '⚖️', count: counts.negrisk },
        { id: 'whale', label: 'Whale Movements', icon: '🌊', count: counts.whale },
      ],
    },
    {
      title: 'Portfolio & Tools',
      items: [
        { id: 'portfolio', label: 'Portfolio & Orders', icon: '📊', action: openPortfolioModal },
        { id: 'watchlist', label: 'Watchlist', icon: '⭐', count: counts.watchlist },
        { id: 'alerts', label: 'High Alerts', icon: '🔔', action: () => setAlertsModalOpen(true) },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed lg:static top-0 bottom-0 left-0 z-40 w-64 bg-zinc-900/95 lg:bg-zinc-900/60 backdrop-blur-xl border-r border-zinc-800/80 flex flex-col transition-transform duration-200 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Top Logo & Title */}
        <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-base shadow-[0_0_12px_rgba(52,211,153,0.2)]">
              ⚡
            </div>
            <div>
              <div className="font-mono font-bold text-sm tracking-wide text-zinc-100 flex items-center gap-1.5">
                POLYMARKET <span className="text-emerald-400">PRO</span>
              </div>
              <div className="text-[10px] font-mono text-zinc-500">QUANT TERMINAL v3.0</div>
            </div>
          </div>

          <button
            className="lg:hidden text-zinc-400 hover:text-zinc-200 p-1"
            onClick={() => setSidebarOpen(false)}
          >
            ✕
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {navGroups.map((group) => (
            <div key={group.title}>
              <div className="px-3 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 mb-2">
                {group.title}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (item.action) {
                          item.action();
                        } else {
                          setActiveTab(item.id);
                        }
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-mono transition-all group ${
                        isActive
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-sm'
                          : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 truncate">
                        <span className="text-sm">{item.icon}</span>
                        <span className="truncate font-medium">{item.label}</span>
                      </div>

                      {item.count !== undefined && item.count > 0 && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold tabular-nums ${
                            isActive
                              ? 'bg-emerald-400 text-zinc-950'
                              : 'bg-zinc-800 text-zinc-400 group-hover:bg-zinc-700 group-hover:text-zinc-200'
                          }`}
                        >
                          {item.count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="p-3 border-t border-zinc-800/80 space-y-2 bg-zinc-950/40">
          <button
            onClick={() => refreshOpportunities(true)}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg bg-zinc-800/70 hover:bg-zinc-800 text-zinc-300 text-xs font-mono font-semibold transition border border-zinc-700/50"
          >
            <span>🔄</span>
            <span>Refresh All Feeds</span>
          </button>

          <a
            href="/classic"
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-emerald-400 text-xs font-mono font-medium transition border border-emerald-500/20"
          >
            <span>🏛️</span>
            <span>Classic Terminal View</span>
          </a>
        </div>
      </aside>
    </>
  );
}
