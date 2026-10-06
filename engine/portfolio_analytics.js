// ══════════════════════════════════════════════════════════════════════
//  engine/portfolio_analytics.js — Institutional Equity Curve & Metrics
// ══════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const BACKTEST_FILE = path.join(__dir, '..', 'backtest.json');

function readJSON(filePath, fallback = []) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return fallback;
  }
}

/**
 * Compute institutional portfolio analytics and cumulative equity curve
 */
export function calculatePortfolioAnalytics(startingBankroll = 1000) {
  const trades = readJSON(BACKTEST_FILE, []);

  // Sort trades chronologically
  const sorted = [...trades].sort((a, b) => {
    return new Date(a.timestamp || 0) - new Date(b.timestamp || 0);
  });

  const totalTrades = trades.length;
  const openTrades = trades.filter(t => t.status === 'Open');
  const closedTrades = sorted.filter(t => t.status === 'Closed');

  let currentEquity = startingBankroll;
  let peakEquity = startingBankroll;
  let maxDrawdownUsd = 0;
  let maxDrawdownPct = 0;

  let grossProfit = 0;
  let grossLoss = 0;
  let wins = 0;
  let losses = 0;

  const returnSeries = [];
  const equityPoints = [
    {
      index: 0,
      timestamp: sorted.length ? sorted[0].timestamp : new Date().toISOString(),
      equity: startingBankroll,
      pnlUsd: 0,
      pnlPercent: 0,
      drawdownPct: 0
    }
  ];

  closedTrades.forEach((t, i) => {
    const tradeSize = parseFloat(t.amount || t.size || 50);
    const pnlPct = parseFloat(t.pnl || 0); // percentage PnL e.g. +11.2 or -100
    const pnlDollar = (tradeSize * pnlPct) / 100;

    if (t.result === 'Win' || pnlPct > 0) {
      wins++;
      grossProfit += Math.max(0, pnlDollar);
    } else if (t.result === 'Loss' || pnlPct < 0) {
      losses++;
      grossLoss += Math.abs(pnlDollar);
    }

    currentEquity += pnlDollar;
    if (currentEquity > peakEquity) {
      peakEquity = currentEquity;
    }
    const currentDdUsd = Math.max(0, peakEquity - currentEquity);
    const currentDdPct = peakEquity > 0 ? (currentDdUsd / peakEquity) * 100 : 0;

    if (currentDdPct > maxDrawdownPct) {
      maxDrawdownPct = currentDdPct;
      maxDrawdownUsd = currentDdUsd;
    }

    returnSeries.push(pnlPct / 100);

    equityPoints.push({
      index: i + 1,
      timestamp: t.timestamp || new Date().toISOString(),
      question: t.question,
      outcome: t.outcome,
      tradePnLUsd: parseFloat(pnlDollar.toFixed(2)),
      tradePnLPct: parseFloat(pnlPct.toFixed(2)),
      equity: parseFloat(currentEquity.toFixed(2)),
      pnlUsd: parseFloat((currentEquity - startingBankroll).toFixed(2)),
      pnlPercent: parseFloat((((currentEquity - startingBankroll) / startingBankroll) * 100).toFixed(2)),
      drawdownPct: parseFloat(currentDdPct.toFixed(2))
    });
  });

  // Calculate Sharpe Ratio (assuming risk-free rate ~ 4% annualized)
  let sharpeRatio = 0;
  if (returnSeries.length >= 2) {
    const mean = returnSeries.reduce((a, b) => a + b, 0) / returnSeries.length;
    const variance = returnSeries.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (returnSeries.length - 1);
    const stdev = Math.sqrt(variance);
    if (stdev > 0) {
      // Annualized assuming ~250 prediction market trading days
      sharpeRatio = parseFloat(((mean / stdev) * Math.sqrt(250)).toFixed(2));
    }
  }

  // Profit Factor
  const profitFactor = grossLoss > 0
    ? parseFloat((grossProfit / grossLoss).toFixed(2))
    : grossProfit > 0 ? 99.99 : 1.0;

  // Win rate
  const winRate = closedTrades.length > 0
    ? parseFloat(((wins / closedTrades.length) * 100).toFixed(1))
    : 0;

  // Category Breakdown
  const catMap = {};
  trades.forEach(t => {
    const cat = t.category || 'Other';
    if (!catMap[cat]) {
      catMap[cat] = { category: cat, total: 0, wins: 0, closed: 0, pnlUsd: 0 };
    }
    catMap[cat].total++;
    if (t.status === 'Closed') {
      catMap[cat].closed++;
      if (t.result === 'Win' || (t.pnl || 0) > 0) catMap[cat].wins++;
      const size = parseFloat(t.amount || t.size || 50);
      catMap[cat].pnlUsd += (size * (t.pnl || 0)) / 100;
    }
  });

  const categoryBreakdown = Object.values(catMap).map(c => ({
    ...c,
    winRate: c.closed > 0 ? parseFloat(((c.wins / c.closed) * 100).toFixed(1)) : 0,
    pnlUsd: parseFloat(c.pnlUsd.toFixed(2))
  }));

  // Brier Score calculation (Prediction Market Gold Standard Proper Scoring Rule: 0.0 is perfect, 0.25 is random coin-flip)
  let brierScore = null;
  let validBrierCount = 0;
  let totalBrierSquared = 0;
  closedTrades.forEach(t => {
    const entryProb = parseFloat(t.price || t.entryPrice || 0.5);
    const actualOutcome = (t.result === 'Win' || (t.pnl || 0) > 0) ? 1 : 0;
    totalBrierSquared += Math.pow(entryProb - actualOutcome, 2);
    validBrierCount++;
  });
  if (validBrierCount > 0) {
    brierScore = parseFloat((totalBrierSquared / validBrierCount).toFixed(4));
  }

  return {
    startingBankroll,
    currentEquity: parseFloat(currentEquity.toFixed(2)),
    netPnLUsd: parseFloat((currentEquity - startingBankroll).toFixed(2)),
    netPnLPercent: parseFloat((((currentEquity - startingBankroll) / startingBankroll) * 100).toFixed(2)),
    totalTrades,
    openPositions: openTrades.length,
    closedTradesCount: closedTrades.length,
    wins,
    losses,
    winRate,
    grossProfit: parseFloat(grossProfit.toFixed(2)),
    grossLoss: parseFloat(grossLoss.toFixed(2)),
    profitFactor,
    maxDrawdownPercent: parseFloat(maxDrawdownPct.toFixed(2)),
    maxDrawdownUsd: parseFloat(maxDrawdownUsd.toFixed(2)),
    sharpeRatio,
    brierScore,
    equityCurve: equityPoints,
    categoryBreakdown,
    generatedAt: new Date().toISOString()
  };
}
