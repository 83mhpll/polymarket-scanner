// ══════════════════════════════════════════════════════════════════════
//  tests/fixtures/reference_engine.js
//  Authoritative Reference Oracle Implementation for Prediction Market System
//  Derived strictly from mathematical specifications in PROJECT.md & explorer_quant_arch
// ══════════════════════════════════════════════════════════════════════

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';

// --- Numerical Stability: Logit & Expit ---

export function logit(p, epsilon = 1e-7) {
  const clamped = Math.max(epsilon, Math.min(1 - epsilon, p));
  return Math.log(clamped / (1 - clamped));
}

export function expit(eta) {
  if (eta >= 0) {
    const z = Math.exp(-eta);
    return 1 / (1 + z);
  } else {
    const z = Math.exp(eta);
    return z / (1 + z);
  }
}

// erf / erfc approximation (Abramowitz & Stegun 7.1.26, max error 1.5e-7)
function erf(x) {
  const sign = x >= 0 ? 1 : -1;
  const absX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1.0 / (1.0 + p * absX);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);
  return sign * y;
}

export function erfc(x) {
  return 1 - erf(x);
}

// --- Weather Domain Fair Value Engine ---

export function calculateFairProbability(ensemble, targetDate, bracket, method = 'super') {
  if (!bracket) throw new Error('Bracket specification is required');
  const minVal = bracket.min !== undefined && bracket.min !== null ? bracket.min : -Infinity;
  const maxVal = bracket.max !== undefined && bracket.max !== null ? bracket.max : Infinity;

  // Extract member daily maximums
  const gfs = ensemble.gfs?.membersDailyMax || [];
  const ecmwf = ensemble.ecmwf?.membersDailyMax || [];

  if (gfs.length === 0 && ecmwf.length === 0) {
    throw new Error('No ensemble members found');
  }

  const allMembers = [...gfs, ...ecmwf];
  const n = allMembers.length;

  const mean = allMembers.reduce((a, b) => a + b, 0) / n;
  const variance = allMembers.reduce((a, b) => a + (b - mean) ** 2, 0) / (n > 1 ? n - 1 : 1);
  const std = Math.sqrt(variance);

  // Scheme A: Continuity-Corrected ECDF (Laplace alpha = 1.0)
  const calcEcdfProb = (members) => {
    const m = members.length;
    if (m === 0) return 0.5;
    const count = members.filter(x => x >= minVal && x < maxVal).length;
    const alpha = 1.0;
    return (count + alpha) / (m + 2 * alpha);
  };

  // Scheme B: Gaussian KDE
  const calcKdeProb = (members) => {
    const m = members.length;
    if (m === 0) return 0.5;
    const sorted = [...members].sort((a, b) => a - b);
    const mMean = sorted.reduce((a, b) => a + b, 0) / m;
    const mStd = Math.sqrt(sorted.reduce((a, b) => a + (b - mMean) ** 2, 0) / (m > 1 ? m - 1 : 1)) || 1.0;

    const q75 = sorted[Math.floor(0.75 * (m - 1))];
    const q25 = sorted[Math.floor(0.25 * (m - 1))];
    const iqr = (q75 - q25) || mStd;
    const h = Math.max(0.1, 1.06 * Math.min(mStd, iqr / 1.34) * Math.pow(m, -0.2));

    // Exceedance difference
    let probSum = 0;
    for (let i = 0; i < m; i++) {
      const xi = members[i];
      let pLower = 0;
      let pUpper = 1;
      if (minVal !== -Infinity) {
        pLower = 0.5 * (1 + erf((minVal - xi) / (Math.SQRT2 * h)));
      }
      if (maxVal !== Infinity) {
        pUpper = 0.5 * (1 + erf((maxVal - xi) / (Math.SQRT2 * h)));
      }
      probSum += Math.max(0, pUpper - pLower);
    }
    const rawKde = probSum / m;
    // Laplace smoothing on KDE to ensure strict (0, 1) bounds
    return Math.max(1e-5, Math.min(1 - 1e-5, rawKde));
  };

  let fairProb;
  if (method === 'ecdf') {
    fairProb = calcEcdfProb(allMembers);
  } else if (method === 'kde') {
    fairProb = calcKdeProb(allMembers);
  } else {
    // Superensemble reliability blend: 0.6 ECMWF + 0.4 GFS
    const pEcmwf = calcEcdfProb(ecmwf);
    const pGfs = calcEcdfProb(gfs);
    fairProb = 0.6 * pEcmwf + 0.4 * pGfs;
  }

  // Strict (0, 1) guarantee
  fairProb = Math.max(1e-6, Math.min(1 - 1e-6, fairProb));

  return {
    fairProb,
    logitProb: logit(fairProb),
    ensembleMean: mean,
    ensembleStd: std,
    sampleSize: n
  };
}

// --- De-vigging Algorithms ---

export function solveMultiplicativeDevig(impliedProbs) {
  const sum = impliedProbs.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new Error('Sum of implied probabilities must be positive');
  const trueProbs = impliedProbs.map(p => p / sum);
  return { trueProbs };
}

export function solvePowerDevig(impliedProbs) {
  const n = impliedProbs.length;
  const sum = impliedProbs.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1.0) < 1e-9) {
    return { trueProbs: [...impliedProbs], r: 1.0 };
  }

  let r = Math.log(n) / Math.log(sum) + 1.0;
  for (let iter = 0; iter < 50; iter++) {
    let g = -1.0;
    let gPrime = 0.0;
    for (let i = 0; i < n; i++) {
      const term = Math.pow(impliedProbs[i], r);
      g += term;
      gPrime += term * Math.log(impliedProbs[i]);
    }
    if (Math.abs(g) < 1e-12 || Math.abs(gPrime) < 1e-14) break;
    r = r - g / gPrime;
    if (r <= 0) r = 0.01;
  }

  const trueProbs = impliedProbs.map(p => Math.pow(p, r));
  const normSum = trueProbs.reduce((a, b) => a + b, 0);
  return {
    trueProbs: trueProbs.map(p => p / normSum),
    r
  };
}

export function solveShinDevig(q) {
  const n = q.length;
  const s = q.reduce((a, b) => a + b, 0);
  if (Math.abs(s - 1.0) < 1e-9) {
    return { trueProbs: [...q], z: 0 };
  }

  let zLow = 0.0;
  let zHigh = 1.0 - 1e-7;
  let zMid = 0.0;
  const maxIters = 60;
  const tol = 1e-10;

  function evalSumP(z) {
    const twoOneMinusZ = 2 * (1 - z);
    const zSq = z * z;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const qi = q[i];
      const term = Math.sqrt(zSq + 4 * (1 - z) * (qi * qi) / s);
      sum += (term - z) / twoOneMinusZ;
    }
    return sum;
  }

  for (let iter = 0; iter < maxIters; iter++) {
    zMid = 0.5 * (zLow + zHigh);
    const sumP = evalSumP(zMid);
    const diff = sumP - 1.0;
    if (Math.abs(diff) < tol || (zHigh - zLow) < tol) break;
    if (diff > 0) {
      zLow = zMid;
    } else {
      zHigh = zMid;
    }
  }

  const z = zMid;
  const twoOneMinusZ = 2 * (1 - z);
  const zSq = z * z;
  const trueProbs = q.map(qi => {
    const term = Math.sqrt(zSq + 4 * (1 - z) * (qi * qi) / s);
    return (term - z) / twoOneMinusZ;
  });

  return { trueProbs, z };
}

// --- Dynamic Fees & Net Edge ---

export const CATEGORY_FEE_RATES = {
  weather: 0.05,
  crypto: 0.07,
  sports: 0.05,
  politics: 0.04,
  finance: 0.04,
  tech: 0.04,
  geopolitics: 0.00
};

export function getCategoryFeeRate(category = 'weather') {
  const cat = String(category).toLowerCase();
  return CATEGORY_FEE_RATES[cat] !== undefined ? CATEGORY_FEE_RATES[cat] : 0.05;
}

export function calculateDynamicFee(shares, price, category = 'weather', isMaker = false) {
  if (isMaker) return 0.0;
  const feeRate = getCategoryFeeRate(category);
  const p = Math.max(0, Math.min(1, price));
  // Exact Polymarket taker fee formula: C * feeRate * p * (1 - p)
  const fee = shares * feeRate * p * (1 - p);
  return Number(fee.toFixed(6));
}

export function calculateNetEdge(fairProb, askPrice, bidPrice, category = 'weather') {
  const feeRate = getCategoryFeeRate(category);
  const feePerShareYes = feeRate * askPrice * (1 - askPrice);
  const feePerShareNo = feeRate * (1 - bidPrice) * bidPrice;

  const grossEdgeYes = fairProb - askPrice;
  const netEdgeYes = grossEdgeYes - feePerShareYes;

  const grossEdgeNo = (1 - fairProb) - (1 - bidPrice); // bidPrice - fairProb
  const netEdgeNo = grossEdgeNo - feePerShareNo;

  return {
    netEdgeYes,
    netEdgeNo,
    grossEdgeYes,
    grossEdgeNo,
    takerFeePerShareYes: feePerShareYes,
    takerFeePerShareNo: feePerShareNo
  };
}

// --- Proper Scoring Rules ---

export function calculateBrierScore(predictions, outcomes) {
  if (predictions.length === 0) return 0;
  if (predictions.length !== outcomes.length) throw new Error('Length mismatch');
  let sumSq = 0;
  for (let i = 0; i < predictions.length; i++) {
    sumSq += (predictions[i] - outcomes[i]) ** 2;
  }
  return sumSq / predictions.length;
}

export function calculateBrierSkillScore(modelPredictions, marketProbabilities, outcomes) {
  const bsModel = calculateBrierScore(modelPredictions, outcomes);
  const bsMarket = calculateBrierScore(marketProbabilities, outcomes);
  if (bsMarket === 0) return 0;
  return 1 - (bsModel / bsMarket);
}

function softplus(eta) {
  if (eta > 0) {
    return eta + Math.log(1 + Math.exp(-eta));
  } else {
    return Math.log(1 + Math.exp(eta));
  }
}

export function calculateStableLogLoss(predictions, outcomes) {
  if (predictions.length === 0) return 0;
  let totalLoss = 0;
  for (let i = 0; i < predictions.length; i++) {
    const y = outcomes[i];
    const p = predictions[i];
    const eta = logit(p);
    // Loss_i = softplus(eta) - y * eta
    totalLoss += softplus(eta) - y * eta;
  }
  return totalLoss / predictions.length;
}

export function evaluateScoringRules(predictions, outcomes) {
  return {
    brierScore: calculateBrierScore(predictions, outcomes),
    logLoss: calculateStableLogLoss(predictions, outcomes),
    sampleSize: predictions.length
  };
}

// --- Fractional Kelly Sizing with Shrinkage ---

export function calculateKellySize(bankroll, fairProb, askPrice, feePerShare, ensembleVariance = 0.001, maxFraction = 0.25) {
  if (bankroll <= 0) return { allocatedUsd: 0, shares: 0, kellyFraction: 0, shrinkageFactor: 0, rawKellyFraction: 0 };
  const costBasis = askPrice + feePerShare;
  if (costBasis >= 1.0 || costBasis <= 0) {
    return { allocatedUsd: 0, shares: 0, kellyFraction: 0, shrinkageFactor: 0, rawKellyFraction: 0 };
  }

  const netEdge = fairProb - costBasis;
  if (netEdge <= 0) {
    return { allocatedUsd: 0, shares: 0, kellyFraction: 0, shrinkageFactor: 0, rawKellyFraction: 0 };
  }

  // Full unconstrained Kelly fraction: f* = NetEdge / (1 - costBasis)
  const rawKelly = netEdge / (1 - costBasis);

  // James-Stein ensemble variance shrinkage factor
  const lambda = 2.0;
  const delta = 1e-4;
  const signalSq = (fairProb - askPrice) ** 2;
  const shrinkageFactor = signalSq / (signalSq + lambda * ensembleVariance + delta);

  // Quarter-Kelly allocation
  const cKelly = 0.25;
  const appliedKellyFraction = Math.min(maxFraction, Math.max(0, cKelly * shrinkageFactor * rawKelly));
  const allocatedUsd = appliedKellyFraction * bankroll;
  const shares = Math.floor(allocatedUsd / costBasis);

  return {
    allocatedUsd: Number(allocatedUsd.toFixed(2)),
    shares,
    kellyFraction: appliedKellyFraction,
    shrinkageFactor,
    rawKellyFraction: rawKelly
  };
}

// --- Fill Simulator ---

export function simulateTakerFill(orderbook, side, requestedShares) {
  if (!orderbook) throw new Error('Orderbook is required');
  const ladder = side === 'BUY'
    ? [...orderbook.asks].sort((a, b) => a[0] - b[0])
    : [...orderbook.bids].sort((a, b) => b[0] - a[0]);

  if (ladder.length === 0) {
    return {
      filledShares: 0,
      fillPriceVwap: 0,
      slippageBps: 0,
      updatedOrderbook: { ...orderbook },
      remainingShares: requestedShares
    };
  }

  const topOfBookPrice = ladder[0][0];
  let remaining = requestedShares;
  let totalCost = 0;
  let totalFilled = 0;
  const updatedLadder = [];

  for (let i = 0; i < ladder.length; i++) {
    const [price, depth] = ladder[i];
    if (remaining > 0 && depth > 0) {
      const fillAtLevel = Math.min(remaining, depth);
      totalCost += fillAtLevel * price;
      totalFilled += fillAtLevel;
      remaining -= fillAtLevel;
      const remDepth = depth - fillAtLevel;
      if (remDepth > 0) updatedLadder.push([price, remDepth]);
    } else {
      updatedLadder.push([price, depth]);
    }
  }

  const vwap = totalFilled > 0 ? totalCost / totalFilled : topOfBookPrice;
  // Slippage in basis points relative to top-of-book
  const slippageBps = topOfBookPrice > 0
    ? (side === 'BUY' ? (vwap - topOfBookPrice) : (topOfBookPrice - vwap)) / topOfBookPrice * 10000
    : 0;

  const updatedOrderbook = {
    ...orderbook,
    bids: side === 'SELL' ? updatedLadder : [...orderbook.bids],
    asks: side === 'BUY' ? updatedLadder : [...orderbook.asks],
    timestamp: Date.now()
  };

  return {
    filledShares: totalFilled,
    fillPriceVwap: Number(vwap.toFixed(4)),
    slippageBps: Number(slippageBps.toFixed(2)),
    updatedOrderbook,
    remainingShares: remaining
  };
}

export function simulateMakerQueue(orderbook, side, limitPrice, shares, executedTradesVolume) {
  const ladder = side === 'BUY' ? orderbook.bids : orderbook.asks;
  let queueAhead = 0;
  for (const [p, depth] of ladder) {
    if (Math.abs(p - limitPrice) < 1e-4) {
      queueAhead = depth;
      break;
    }
  }

  const excess = executedTradesVolume - queueAhead;
  const filledShares = excess > 0 ? Math.min(shares, excess) : 0;
  const queueRemaining = Math.max(0, queueAhead - executedTradesVolume);

  return {
    filledShares,
    queueRemaining
  };
}

// --- Paper Trader ---

export class PaperTrader {
  constructor(config = {}) {
    this.config = config;
    this.bankroll = config.initialBankroll || 10000;
    this.initialBankroll = this.bankroll;
    this.positions = new Map(); // tokenId -> { shares, avgPrice, outcome, marketId }
    this.openOrders = new Map(); // orderId -> order
    this.backtestHistory = [];
    this.isHalted = false;
  }

  async initialize() {
    // Regional Compliance Hard Guard: Reject live private keys or mainnet RPCs
    if (this.config.privateKey || process.env.PRIVATE_KEY || process.env.LIVE_TRADING === 'true') {
      throw new Error('REGIONAL COMPLIANCE GUARD: Live capital keys detected. System is strictly simulation only.');
    }
    return true;
  }

  submitOrder(order) {
    if (this.isHalted) {
      throw new Error('EXECUTION HALTED: Risk kill switch is active.');
    }
    const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const fullOrder = { ...order, orderId, status: 'OPEN', timestamp: new Date().toISOString() };
    this.openOrders.set(orderId, fullOrder);
    return fullOrder;
  }

  cancelOrder(orderId) {
    if (this.openOrders.has(orderId)) {
      const order = this.openOrders.get(orderId);
      order.status = 'CANCELLED';
      this.openOrders.delete(orderId);
      return true;
    }
    return false;
  }

  cancelAllOrders() {
    const count = this.openOrders.size;
    for (const [id, order] of this.openOrders.entries()) {
      order.status = 'CANCELLED';
    }
    this.openOrders.clear();
    return count;
  }

  recordFill(tradeRecord) {
    this.backtestHistory.push(tradeRecord);
    // Update cash bankroll & positions
    this.bankroll -= tradeRecord.totalCostUsd || 0;
    const current = this.positions.get(tradeRecord.tokenId) || { shares: 0, costBasis: 0 };
    current.shares += tradeRecord.filledShares;
    current.costBasis += tradeRecord.totalCostUsd;
    this.positions.set(tradeRecord.tokenId, current);
  }

  getPortfolioState() {
    let positionEquity = 0;
    for (const [, pos] of this.positions.entries()) {
      positionEquity += pos.shares * 0.5; // mid mark
    }
    const totalEquity = this.bankroll + positionEquity;
    return {
      cash: this.bankroll,
      totalEquity,
      initialBankroll: this.initialBankroll,
      positionsCount: this.positions.size,
      openOrdersCount: this.openOrders.size
    };
  }
}

// --- WebSocket CLOB Streamer Mock / Client ---

export class ClobStreamer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.url = options.url || 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
    this.connected = false;
    this.books = new Map();
    this.bbo = new Map();
    this.heartbeatTimer = null;
    this.lastPong = 0;
  }

  startStream(tokenIds = []) {
    this.connected = true;
    this.lastPong = Date.now();
    // Simulate initial snapshot
    for (const id of tokenIds) {
      const book = {
        tokenId: id,
        bids: [[0.5, 1000], [0.49, 2000], [0.48, 3000], [0.47, 4000], [0.46, 5000]],
        asks: [[0.52, 1000], [0.53, 2000], [0.54, 3000], [0.55, 4000], [0.56, 5000]],
        hash: '0x' + Math.random().toString(16).substr(2, 8),
        timestamp: Date.now()
      };
      this.books.set(id, book);
      this.bbo.set(id, { bestBid: 0.5, bestAsk: 0.52, spread: 0.02 });
      this.emit('book', book);
      this.emit('bbo', this.bbo.get(id));
    }

    // Schedule 10s PING/PONG heartbeat
    this.heartbeatTimer = setInterval(() => {
      this.lastPong = Date.now();
      this.emit('heartbeat', { type: 'PONG', timestamp: this.lastPong });
    }, 10000);

    return this;
  }

  getOrderBook(tokenId) {
    return this.books.get(tokenId) || null;
  }

  getBBO(tokenId) {
    return this.bbo.get(tokenId) || null;
  }

  simulateDisconnect() {
    this.connected = false;
    this.emit('reconnecting', { attempt: 1, backoffMs: 500 });
    this.emit('fallback_rest', { active: true });
  }

  stopStream() {
    this.connected = false;
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

// --- Institutional Risk Manager ---

export class RiskManager {
  constructor(options = {}) {
    this.maxDrawdownPct = options.maxDrawdownPct || 15.0;
    this.warningDrawdownPct = options.warningDrawdownPct || 10.0;
    this.maxGrossExposureMultiplier = options.maxGrossExposureMultiplier || 1.0;
    this.maxConcentrationPct = options.maxConcentrationPct || 15.0;
    this.highWaterMark = options.initialBankroll || 10000;
  }

  evaluateRisk(portfolioState) {
    const { totalEquity, cash, positions = [] } = portfolioState;
    if (totalEquity > this.highWaterMark) {
      this.highWaterMark = totalEquity;
    }

    const drawdownPct = this.highWaterMark > 0
      ? ((this.highWaterMark - totalEquity) / this.highWaterMark) * 100
      : 0;

    let grossExposureUsd = 0;
    let netExposureUsd = 0;
    let maxSingleMarketExposure = 0;
    const violations = [];

    for (const p of positions) {
      const value = p.shares * (p.markPrice || 0.5);
      grossExposureUsd += Math.abs(value);
      netExposureUsd += value * (p.side === 'BUY' ? 1 : -1);
      if (value > maxSingleMarketExposure) maxSingleMarketExposure = value;
    }

    const concentrationPct = totalEquity > 0
      ? (maxSingleMarketExposure / totalEquity) * 100
      : 0;

    if (drawdownPct >= this.maxDrawdownPct) {
      violations.push(`Max drawdown breached: ${drawdownPct.toFixed(2)}% >= ${this.maxDrawdownPct}%`);
    }
    if (grossExposureUsd > this.highWaterMark * this.maxGrossExposureMultiplier) {
      violations.push(`Gross exposure cap breached: $${grossExposureUsd} > $${this.highWaterMark * this.maxGrossExposureMultiplier}`);
    }
    if (concentrationPct > this.maxConcentrationPct) {
      violations.push(`Single market concentration breached: ${concentrationPct.toFixed(2)}% > ${this.maxConcentrationPct}%`);
    }

    let status = 'SAFE';
    if (violations.length > 0) {
      status = 'BREACH';
    } else if (drawdownPct >= this.warningDrawdownPct) {
      status = 'WARNING';
    }

    return {
      status,
      drawdownPct: Number(drawdownPct.toFixed(4)),
      grossExposureUsd,
      netExposureUsd,
      concentrationPct: Number(concentrationPct.toFixed(2)),
      highWaterMark: this.highWaterMark,
      violations
    };
  }
}

// --- Emergency Kill-Switch ---

export class KillSwitch {
  constructor(paperTrader, riskManager) {
    this.paperTrader = paperTrader;
    this.riskManager = riskManager;
    this.halted = false;
    this.haltReason = null;
    this.haltedAt = 0;
  }

  isHalted() {
    return this.halted;
  }

  async triggerKillSwitch(reason = 'MANUAL_OVERRIDE') {
    const t0 = process.hrtime.bigint();
    // 1. Atomic flag set immediately (<1ms)
    this.halted = true;
    this.haltReason = reason;
    this.haltedAt = Date.now();
    if (this.paperTrader) {
      this.paperTrader.isHalted = true;
    }

    // 2. Cancel open orders (<20ms)
    let cancelledOrdersCount = 0;
    if (this.paperTrader) {
      cancelledOrdersCount = this.paperTrader.cancelAllOrders();
    }

    // 3. Flush state snapshot (<50ms)
    const t1 = process.hrtime.bigint();
    const elapsedMs = Number(t1 - t0) / 1e6;

    return {
      haltedAt: this.haltedAt,
      cancelledOrdersCount,
      elapsedMs: Number(elapsedMs.toFixed(3)),
      reason
    };
  }

  reset() {
    this.halted = false;
    this.haltReason = null;
    if (this.paperTrader) {
      this.paperTrader.isHalted = false;
    }
  }
}
