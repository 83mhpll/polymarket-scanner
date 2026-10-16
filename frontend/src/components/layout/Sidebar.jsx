import React from 'react';
import { useTrading } from '../../context/TradingContext';

// Clean SVG Icons (Zero Emojis)
const Icons = {
  Grid: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  ),
  Bolt: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  ),
  Target: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Trending: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  ),
  Cpu: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z" />
    </svg>
  ),
  Coins: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Scale: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
    </svg>
  ),
  Activity: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  ),
  Chart: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  Star: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
    </svg>
  ),
  Bell: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
    </svg>
  ),
  Gear: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  Refresh: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
    </svg>
  ),
  Terminal: () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
    </svg>
  ),
};

export default function Sidebar() {
  const {
    activeTab,
    setActiveTab,
    opportunities,
    openPortfolioModal,
    openConfigModal,
    openAlertsModal,
    refreshOpportunities,
    watchlist,
    alertsList,
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
      alerts: (alertsList || []).length || opps.filter(o => (o.score || 0) >= 85).length,
    };
  }, [opportunities, watchlist, alertsList]);

  const navGroups = [
    {
      title: 'Market Feeds',
      items: [
        { id: 'all', label: 'All Opportunities', Icon: Icons.Grid, count: counts.all },
        { id: 'cross', label: 'Cross-Market Arb', Icon: Icons.Bolt, count: counts.cross },
        { id: 'manifold', label: 'Manifold Arb', Icon: Icons.Target, count: 0 },
        { id: 'smartmoney', label: 'Smart Money Feed', Icon: Icons.Trending, count: counts.smartmoney },
        { id: 'aimodel', label: 'AI Mispricing', Icon: Icons.Cpu, count: counts.aimodel },
      ],
    },
    {
      title: 'Quant Strategies',
      items: [
        { id: 'dust', label: '1c Dust Sweeper', Icon: Icons.Coins, count: counts.dust },
        { id: 'negrisk', label: 'NegRisk Multi-Arb', Icon: Icons.Scale, count: counts.negrisk },
        { id: 'whale', label: 'Whale Movements', Icon: Icons.Activity, count: counts.whale },
      ],
    },
    {
      title: 'System & Tools',
      items: [
        { id: 'portfolio', label: 'Portfolio & Orders', Icon: Icons.Chart, action: openPortfolioModal },
        { id: 'watchlist', label: 'Watchlist', Icon: Icons.Star, count: counts.watchlist },
        { id: 'alerts', label: 'High Alerts', Icon: Icons.Bell, action: openAlertsModal, count: counts.alerts },
        { id: 'settings', label: 'Settings', Icon: Icons.Gear, action: openConfigModal },
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
        className={`fixed lg:static top-0 bottom-0 left-0 z-40 w-64 bg-zinc-900/95 lg:bg-zinc-900/70 backdrop-blur-xl border-r border-zinc-800/80 flex flex-col transition-transform duration-200 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Top Logo & Branding (No Emoji) */}
        <div className="p-4 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-mono font-bold text-xs tracking-tighter">
              PM
            </div>
            <div>
              <div className="font-mono font-bold text-sm tracking-wider text-zinc-100">
                POLYMARKET <span className="text-emerald-400">PRO</span>
              </div>
              <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">Quant Terminal v3.0</div>
            </div>
          </div>

          <button
            className="lg:hidden text-zinc-400 hover:text-zinc-200 p-1 font-mono text-xs"
            onClick={() => setSidebarOpen(false)}
          >
            CLOSE
          </button>
        </div>

        {/* Navigation Groups */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {navGroups.map((group) => (
            <div key={group.title}>
              <div className="px-3 text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-500 mb-2">
                {group.title}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = activeTab === item.id;
                  const Icon = item.Icon;
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
                        <span className={`${isActive ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
                          <Icon />
                        </span>
                        <span className="truncate font-medium">{item.label}</span>
                      </div>

                      {item.count !== undefined && item.count > 0 && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-bold tabular-nums ${
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

        {/* Bottom Actions (No Emoji) */}
        <div className="p-3 border-t border-zinc-800/80 space-y-2 bg-zinc-950/40">
          <button
            onClick={() => refreshOpportunities(true)}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg bg-zinc-800/70 hover:bg-zinc-800 text-zinc-300 text-xs font-mono font-semibold transition border border-zinc-700/50"
          >
            <Icons.Refresh />
            <span>Refresh All Feeds</span>
          </button>

          <a
            href="/classic"
            className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-emerald-400 text-xs font-mono font-medium transition border border-emerald-500/20"
          >
            <Icons.Terminal />
            <span>Classic Terminal View</span>
          </a>
        </div>
      </aside>
    </>
  );
}
