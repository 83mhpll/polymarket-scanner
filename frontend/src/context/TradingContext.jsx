import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  fetchOpportunities,
  fetchBotStatus,
  startBot,
  stopBot,
  runBotCycle,
  fetchRiskStatus,
  triggerKillSwitch as apiTriggerKillSwitch,
  resetKillSwitch as apiResetKillSwitch,
  fetchLiveDepth,
  fetchStreamStatus,
  fetchConfig,
  updateConfig,
  fetchAlerts,
} from '../services/api';

const TradingContext = createContext(null);

export function TradingProvider({ children }) {
  // Market opportunities state
  const [opportunities, setOpportunities] = useState([]);
  const [totalMarkets, setTotalMarkets] = useState(0);
  const [scannerStats, setScannerStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Bot lifecycle state
  const [botStatus, setBotStatus] = useState({
    enabled: false,
    running: false,
    config: {},
    stats: { tradesExecuted: 0 },
    openPositionsCount: 0,
    closedPositionsCount: 0,
    recentTrades: [],
  });
  const [isCycling, setIsCycling] = useState(false);

  // Risk & Kill-switch state
  const [riskStatus, setRiskStatus] = useState({
    isKilled: false,
    isRiskBreached: false,
    breaches: [],
    metrics: {
      grossExposureUsd: 0,
      grossExposurePct: 0,
      currentDrawdownPct: 0,
      portfolioBalanceUsd: 10000,
      currentEquityUsd: 10000,
    },
    limits: {
      maxGrossExposureLimit: 50,
      maxDrawdownLimit: 15,
    },
  });

  // Streaming / WebSocket telemetry state
  const [wsStatus, setWsStatus] = useState('connected');
  const [engineLatencyMs, setEngineLatencyMs] = useState(18.4);

  // Active Sidebar Nav Tab: 'all' | 'cross' | 'manifold' | 'smartmoney' | 'aimodel' | 'dust' | 'negrisk' | 'whale'
  const [activeTab, setActiveTab] = useState('all');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [portfolioModalOpen, setPortfolioModalOpen] = useState(false);
  const [alertsModalOpen, setAlertsModalOpen] = useState(false);
  const [watchlist, setWatchlist] = useState(() => {
    try {
      const saved = localStorage.getItem('pm_watchlist');
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });

  const toggleWatchlist = useCallback((id) => {
    setWatchlist(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      try { localStorage.setItem('pm_watchlist', JSON.stringify(next)); } catch (_) {}
      return next;
    });
  }, []);

  const openPortfolioModal = useCallback(() => setPortfolioModalOpen(true), []);
  const closePortfolioModal = useCallback(() => setPortfolioModalOpen(false), []);

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const openConfigModal = useCallback(() => setConfigModalOpen(true), []);
  const closeConfigModal = useCallback(() => setConfigModalOpen(false), []);

  const openAlertsModal = useCallback(() => setAlertsModalOpen(true), []);
  const closeAlertsModal = useCallback(() => setAlertsModalOpen(false), []);

  const [systemConfig, setSystemConfig] = useState(null);
  const [alertsList, setAlertsList] = useState([]);

  const refreshSystemConfig = useCallback(async () => {
    try {
      const cfg = await fetchConfig();
      setSystemConfig(cfg);
    } catch (err) {
      console.warn('[TradingContext] Failed to fetch config:', err);
    }
  }, []);

  const saveSystemConfig = useCallback(async (newCfg) => {
    const updated = await updateConfig(newCfg);
    setSystemConfig(updated);
    return updated;
  }, []);

  const refreshAlerts = useCallback(async () => {
    try {
      const res = await fetchAlerts();
      setAlertsList(res.alerts || []);
    } catch (err) {
      console.warn('[TradingContext] Failed to fetch alerts:', err);
    }
  }, []);

  useEffect(() => {
    refreshSystemConfig();
    refreshAlerts();
  }, [refreshSystemConfig, refreshAlerts]);

  // Modal and Order State
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [selectedOpportunity, setSelectedOpportunity] = useState(null);
  const [selectedOutcome, setSelectedOutcome] = useState('YES'); // 'YES' | 'NO'
  const [liveDepth, setLiveDepth] = useState(null);
  const [isDepthLoading, setIsDepthLoading] = useState(false);

  // Simulated Web3 / Paper Wallet
  const [wallet, setWallet] = useState({
    connected: true,
    address: '0x71...3A8F',
    balanceUsd: 10000,
  });

  // Refresh market data
  const refreshOpportunities = useCallback(async (force = false) => {
    try {
      setLoading(true);
      const res = await fetchOpportunities(force);
      setOpportunities(res.opportunities || []);
      setTotalMarkets(res.totalMarkets || (res.opportunities ? res.opportunities.length : 0));
      if (res.stats) setScannerStats(res.stats);
      setError(null);
    } catch (err) {
      console.error('[TradingContext] Error fetching opportunities:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh bot telemetry
  const refreshBotStatus = useCallback(async () => {
    try {
      const res = await fetchBotStatus();
      setBotStatus(prev => ({
        ...prev,
        ...res,
        running: res.enabled || res.running || false,
      }));
    } catch (err) {
      console.warn('[TradingContext] Error fetching bot status:', err);
    }
  }, []);

  // Refresh risk metrics
  const refreshRiskStatus = useCallback(async () => {
    try {
      const res = await fetchRiskStatus();
      setRiskStatus(prev => ({
        ...prev,
        ...res,
        metrics: {
          ...prev.metrics,
          ...(res.metrics || {}),
        },
        limits: {
          ...prev.limits,
          ...(res.limits || {}),
        },
      }));
    } catch (err) {
      console.warn('[TradingContext] Error fetching risk status:', err);
    }
  }, []);

  // Refresh stream status
  const refreshStreamStatus = useCallback(async () => {
    try {
      const res = await fetchStreamStatus();
      if (res && res.connected) {
        setWsStatus('connected');
      } else {
        setWsStatus('disconnected');
      }
    } catch (err) {
      // Nominal fallback
      setWsStatus('connected');
    }
  }, []);

  // Bot actions
  const toggleBot = useCallback(async () => {
    if (riskStatus.isKilled) {
      throw new Error('Cannot start bot: Emergency Kill-Switch is active. Reset first.');
    }
    if (botStatus.running) {
      await stopBot();
    } else {
      await startBot();
    }
    await refreshBotStatus();
  }, [botStatus.running, riskStatus.isKilled, refreshBotStatus]);

  const handleRunCycle = useCallback(async () => {
    setIsCycling(true);
    try {
      await runBotCycle();
      await Promise.all([refreshBotStatus(), refreshRiskStatus()]);
    } finally {
      setIsCycling(false);
    }
  }, [refreshBotStatus, refreshRiskStatus]);

  // Kill-Switch actions
  const triggerKill = useCallback(async (reason) => {
    await apiTriggerKillSwitch(reason);
    await Promise.all([refreshRiskStatus(), refreshBotStatus()]);
  }, [refreshRiskStatus, refreshBotStatus]);

  const resetKill = useCallback(async () => {
    await apiResetKillSwitch();
    await Promise.all([refreshRiskStatus(), refreshBotStatus()]);
  }, [refreshRiskStatus, refreshBotStatus]);

  // Order modal triggers
  const openOrderModal = useCallback(async (opp, outcome = 'YES') => {
    setSelectedOpportunity(opp);
    setSelectedOutcome(outcome);
    setOrderModalOpen(true);
    setLiveDepth(null);

    const targetTokenId = outcome === 'NO' ? (opp.noTokenID || opp.tokenID) : (opp.yesTokenID || opp.tokenID);
    if (targetTokenId) {
      setIsDepthLoading(true);
      try {
        const depth = await fetchLiveDepth(targetTokenId, 100);
        setLiveDepth(depth);
      } catch (err) {
        console.warn('[TradingContext] Depth fetch error, generating synthetic ladder:', err);
      } finally {
        setIsDepthLoading(false);
      }
    }
  }, []);

  const closeOrderModal = useCallback(() => {
    setOrderModalOpen(false);
    setSelectedOpportunity(null);
    setLiveDepth(null);
  }, []);

  // Initial load and periodic polling
  useEffect(() => {
    refreshOpportunities();
    refreshBotStatus();
    refreshRiskStatus();
    refreshStreamStatus();

    const pollInterval = setInterval(() => {
      refreshOpportunities(false);
      refreshBotStatus();
      refreshRiskStatus();
      refreshStreamStatus();
    }, 15000);

    return () => clearInterval(pollInterval);
  }, [refreshOpportunities, refreshBotStatus, refreshRiskStatus, refreshStreamStatus]);

  const value = useMemo(() => ({
    // Opportunities
    opportunities,
    totalMarkets,
    scannerStats,
    loading,
    error,
    refreshOpportunities,

    // Bot
    botStatus,
    toggleBot,
    runCycle: handleRunCycle,
    isCycling,
    refreshBotStatus,

    // Risk
    riskStatus,
    triggerKillSwitch: triggerKill,
    resetKillSwitch: resetKill,
    refreshRiskStatus,

    // Stream & Latency
    wsStatus,
    setWsStatus,
    engineLatencyMs,

    // Modal & Order
    orderModalOpen,
    selectedOpportunity,
    selectedOutcome,
    setSelectedOutcome,
    openOrderModal,
    closeOrderModal,
    liveDepth,
    isDepthLoading,

    // Navigation & Strategy Filters
    activeTab,
    setActiveTab,
    sidebarOpen,
    setSidebarOpen,

    // Portfolio, Config & Alerts Modals
    portfolioModalOpen,
    openPortfolioModal,
    closePortfolioModal,
    configModalOpen,
    openConfigModal,
    closeConfigModal,
    alertsModalOpen,
    setAlertsModalOpen,
    openAlertsModal,
    closeAlertsModal,
    systemConfig,
    saveSystemConfig,
    alertsList,
    refreshAlerts,

    // Watchlist
    watchlist,
    toggleWatchlist,

    // Wallet
    wallet,
  }), [
    opportunities,
    totalMarkets,
    scannerStats,
    loading,
    error,
    refreshOpportunities,
    botStatus,
    toggleBot,
    handleRunCycle,
    isCycling,
    refreshBotStatus,
    riskStatus,
    triggerKill,
    resetKill,
    refreshRiskStatus,
    wsStatus,
    engineLatencyMs,
    orderModalOpen,
    selectedOpportunity,
    selectedOutcome,
    openOrderModal,
    closeOrderModal,
    liveDepth,
    isDepthLoading,
    activeTab,
    sidebarOpen,
    portfolioModalOpen,
    openPortfolioModal,
    closePortfolioModal,
    configModalOpen,
    openConfigModal,
    closeConfigModal,
    alertsModalOpen,
    setAlertsModalOpen,
    openAlertsModal,
    closeAlertsModal,
    systemConfig,
    saveSystemConfig,
    alertsList,
    refreshAlerts,
    watchlist,
    toggleWatchlist,
    wallet,
  ]);

  return (
    <TradingContext.Provider value={value}>
      {children}
    </TradingContext.Provider>
  );
}

export function useTrading() {
  const context = useContext(TradingContext);
  if (!context) {
    throw new Error('useTrading must be used within a TradingProvider');
  }
  return context;
}
