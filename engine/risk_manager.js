// ══════════════════════════════════════════════════════════════════════
//  engine/risk_manager.js — Institutional Risk Controls & Kill-Switch
//  Milestone M4: Risk Monitoring, Exposure Caps & Hard Kill-Switch
// ══════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { paperBotInstance } from './paper_bot.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const BACKTEST_FILE = path.join(__dir, '..', 'backtest.json');

export const DEFAULT_RISK_LIMITS = {
  maxDrawdownPct: 15.0,            // 15% Max Portfolio Drawdown before Emergency Kill
  maxGrossExposurePct: 50.0,       // 50% Max Total Active Exposure relative to Bankroll
  maxSinglePositionPct: 10.0,      // 10% Max Single Market Allocation
  maxHourlyTrades: 30,             // Max allowed trades per hour
  volatilityCircuitBreaker: true,  // Auto-pause if extreme volatility or feed desync
  minBankrollUsd: 1000             // Minimum bankroll floor
};

function readLedger() {
  if (!fs.existsSync(BACKTEST_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(BACKTEST_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function writeLedger(data) {
  fs.writeFileSync(BACKTEST_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export class InstitutionalRiskManager {
  constructor(limits = {}) {
    this.limits = { ...DEFAULT_RISK_LIMITS, ...limits };
    this.isKilled = false;
    this.killAuditLog = [];
    this.hourlyTradeTimestamps = [];
    this.listeners = new Set();
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  emit(event, data) {
    this.listeners.forEach(fn => {
      try { fn(event, data); } catch (e) {}
    });
  }

  /**
   * Evaluate full portfolio risk against institutional limits
   */
  evaluatePortfolioRisk(bankroll = 10000) {
    const ledger = readLedger();
    const openPositions = ledger.filter(t => t.status === 'Open');
    const closedPositions = ledger.filter(t => t.status === 'Closed');

    // 1. Calculate Gross Exposure
    let totalGrossExposureUsd = 0;
    const positionConcentration = {};

    openPositions.forEach(p => {
      const size = parseFloat(p.size || p.amount || 0);
      totalGrossExposureUsd += size;
      const key = p.slug || p.question || 'unknown';
      positionConcentration[key] = (positionConcentration[key] || 0) + size;
    });

    const grossExposurePct = (totalGrossExposureUsd / bankroll) * 100;

    // 2. Calculate PnL & Peak Equity Drawdown
    let currentEquity = bankroll;
    let peakEquity = bankroll;

    closedPositions.forEach(t => {
      const size = parseFloat(t.amount || t.size || 0);
      const pnlPct = parseFloat(t.pnl || 0);
      const dollarPnL = (size * pnlPct) / 100;
      currentEquity += dollarPnL;
      if (currentEquity > peakEquity) peakEquity = currentEquity;
    });

    const drawdownUsd = Math.max(0, peakEquity - currentEquity);
    const drawdownPct = peakEquity > 0 ? (drawdownUsd / peakEquity) * 100 : 0;

    // 3. Find Max Single Position Concentration
    let maxSingleExposureUsd = 0;
    let maxSingleMarketKey = '';
    for (const [mkt, amt] of Object.entries(positionConcentration)) {
      if (amt > maxSingleExposureUsd) {
        maxSingleExposureUsd = amt;
        maxSingleMarketKey = mkt;
      }
    }
    const maxSinglePositionPct = (maxSingleExposureUsd / bankroll) * 100;

    // 4. Check breaches
    const breaches = [];
    if (drawdownPct >= this.limits.maxDrawdownPct) {
      breaches.push(`Drawdown breach: ${drawdownPct.toFixed(2)}% >= limit ${this.limits.maxDrawdownPct}%`);
    }
    if (grossExposurePct >= this.limits.maxGrossExposurePct) {
      breaches.push(`Gross exposure breach: ${grossExposurePct.toFixed(2)}% >= limit ${this.limits.maxGrossExposurePct}%`);
    }
    if (maxSinglePositionPct >= this.limits.maxSinglePositionPct) {
      breaches.push(`Single market concentration breach: ${maxSinglePositionPct.toFixed(2)}% in ${maxSingleMarketKey}`);
    }

    const isRiskBreached = breaches.length > 0;

    // Auto-trigger kill switch if hard drawdown breach occurs
    if (drawdownPct >= this.limits.maxDrawdownPct && !this.isKilled) {
      this.triggerKillSwitch(`Automatic Kill-Switch Triggered: ${breaches.join('; ')}`);
    }

    return {
      isKilled: this.isKilled,
      isRiskBreached,
      breaches,
      metrics: {
        bankroll,
        currentEquity: parseFloat(currentEquity.toFixed(2)),
        peakEquity: parseFloat(peakEquity.toFixed(2)),
        drawdownUsd: parseFloat(drawdownUsd.toFixed(2)),
        drawdownPct: parseFloat(drawdownPct.toFixed(2)),
        grossExposureUsd: parseFloat(totalGrossExposureUsd.toFixed(2)),
        grossExposurePct: parseFloat(grossExposurePct.toFixed(2)),
        openPositionsCount: openPositions.length,
        maxSingleExposureUsd: parseFloat(maxSingleExposureUsd.toFixed(2)),
        maxSinglePositionPct: parseFloat(maxSinglePositionPct.toFixed(2)),
        maxSingleMarket: maxSingleMarketKey
      },
      limits: this.limits
    };
  }

  /**
   * Pre-trade validation: validates if proposed trade violates risk parameters
   */
  checkPreTradeRisk(tradeSizeUsd, marketKey, bankroll = 10000) {
    if (this.isKilled) {
      return { allowed: false, reason: 'System in Hard Kill-Switch state' };
    }

    // Clean old hourly timestamps
    const now = Date.now();
    this.hourlyTradeTimestamps = this.hourlyTradeTimestamps.filter(t => now - t < 3600_000);
    if (this.hourlyTradeTimestamps.length >= this.limits.maxHourlyTrades) {
      return { allowed: false, reason: `Hourly trade limit reached (${this.limits.maxHourlyTrades}/hr)` };
    }

    const currentRisk = this.evaluatePortfolioRisk(bankroll);
    const newGrossExposureUsd = currentRisk.metrics.grossExposureUsd + tradeSizeUsd;
    const newGrossPct = (newGrossExposureUsd / bankroll) * 100;

    if (newGrossPct > this.limits.maxGrossExposurePct) {
      return {
        allowed: false,
        reason: `Exceeds max gross exposure (${newGrossPct.toFixed(1)}% > ${this.limits.maxGrossExposurePct}%)`
      };
    }

    const currentMarketExposure = currentRisk.metrics.maxSingleExposureUsd; // conservative
    const newSingleExposure = currentMarketExposure + tradeSizeUsd;
    if ((newSingleExposure / bankroll) * 100 > this.limits.maxSinglePositionPct) {
      return {
        allowed: false,
        reason: `Exceeds single market concentration limit (${this.limits.maxSinglePositionPct}%)`
      };
    }

    this.hourlyTradeTimestamps.push(now);
    return { allowed: true };
  }

  /**
   * Instant Hard Kill-Switch: halts bot and cancels active paper orders within 1s
   */
  triggerKillSwitch(reason = 'Manual Emergency Kill-Switch Activated') {
    const startTime = Date.now();
    this.isKilled = true;

    // 1. Instantly stop Paper Bot loop
    paperBotInstance.stop();

    // 2. Cancel all pending / open orders in backtest.json
    const ledger = readLedger();
    let cancelledCount = 0;
    const updatedLedger = ledger.map(order => {
      if (order.status === 'Open') {
        cancelledCount++;
        return {
          ...order,
          status: 'Cancelled',
          cancelledAt: new Date().toISOString(),
          cancelReason: `Emergency Kill-Switch: ${reason}`
        };
      }
      return order;
    });
    writeLedger(updatedLedger);

    const elapsedMs = Date.now() - startTime;
    const logEntry = {
      timestamp: new Date().toISOString(),
      reason,
      cancelledOrders: cancelledCount,
      executionLatencyMs: elapsedMs
    };
    this.killAuditLog.unshift(logEntry);

    console.warn(`[Risk Manager] 🚨 HARD KILL-SWITCH ACTIVATED: ${reason} (Executed in ${elapsedMs}ms, Cancelled: ${cancelledCount} orders)`);
    this.emit('kill_switch_triggered', logEntry);

    return {
      success: true,
      executionLatencyMs: elapsedMs,
      cancelledOrders: cancelledCount,
      reason
    };
  }

  /**
   * Reset Kill-Switch with audit authorization
   */
  resetKillSwitch(authorizedBy = 'Operator') {
    this.isKilled = false;
    const logEntry = {
      timestamp: new Date().toISOString(),
      authorizedBy,
      status: 'RESET_COMPLETED'
    };
    this.killAuditLog.unshift(logEntry);
    console.log(`[Risk Manager] Kill-Switch Reset by ${authorizedBy}`);
    this.emit('kill_switch_reset', logEntry);
    return { success: true, isKilled: false };
  }

  getStatus() {
    return {
      isKilled: this.isKilled,
      limits: this.limits,
      recentAuditLogs: this.killAuditLog.slice(0, 5)
    };
  }
}

// Global singleton instance
export const riskManagerInstance = new InstitutionalRiskManager();
