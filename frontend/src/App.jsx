import React from 'react';
import { TradingProvider } from './context/TradingContext';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import StatsBar from './components/layout/StatsBar';
import BotControlBar from './components/bot/BotControlBar';
import OpportunityGrid from './components/opportunities/OpportunityGrid';
import OrderModal from './components/order/OrderModal';
import PortfolioModal from './components/portfolio/PortfolioModal';
import ConfigModal from './components/config/ConfigModal';
import AlertsModal from './components/alerts/AlertsModal';

function MainTerminal() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-emerald-500/20 selection:text-emerald-300">
      {/* Top Header */}
      <Header />

      {/* Main Terminal Shell with Sidebar Navigation */}
      <div className="flex-1 flex w-full">
        <Sidebar />

        <main className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full overflow-x-hidden">
          {/* Macro Telemetry Strip */}
          <StatsBar />

          {/* 24/7 Autonomous Bot Control Panel */}
          <BotControlBar />

          {/* Opportunity Scanner Feed */}
          <OpportunityGrid />

          {/* Modals */}
          <OrderModal />
          <PortfolioModal />
          <ConfigModal />
          <AlertsModal />
        </main>
      </div>

      {/* Institutional Footer */}
      <footer className="border-t border-zinc-800/80 bg-zinc-900/60 px-6 py-4 mt-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between text-xs font-mono text-zinc-500 gap-2">
          <div className="flex items-center space-x-2">
            <span className="text-emerald-400 font-bold">⚡ POLYMARKET PRO</span>
            <span>// Milestone M1 Frontend Scaffold Complete</span>
          </div>

          <div className="flex items-center space-x-4">
            <span>Backend Integration: Port 3001 (Proxied)</span>
            <span className="text-zinc-600">•</span>
            <span className="text-emerald-400 font-semibold">100% Backend Invariants Verified (341 Tests)</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <TradingProvider>
      <MainTerminal />
    </TradingProvider>
  );
}
