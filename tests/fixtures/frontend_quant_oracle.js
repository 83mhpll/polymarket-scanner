// ══════════════════════════════════════════════════════════════════════
//  tests/fixtures/frontend_quant_oracle.js
//  Authoritative Reference Oracle for Polymarket Institutional Frontend
//  Mined strictly from spec_report.md, PROJECT.md, and engine/*.js
// ══════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';

// ─── 1. Fee Rate Constants (Dynamic Fees Specification) ──────────────
export const CATEGORY_FEE_RATES = {
  crypto: 0.07,
  weather: 0.05,
  sports: 0.05,
  politics: 0.04,
  finance: 0.04,
  geopolitics: 0.00,
  default: 0.05,
};

export function getCategoryFeeRate(category) {
  if (!category) return CATEGORY_FEE_RATES.default;
  const key = String(category).toLowerCase();
  return Object.prototype.hasOwnProperty.call(CATEGORY_FEE_RATES, key)
    ? CATEGORY_FEE_RATES[key]
    : CATEGORY_FEE_RATES.default;
}

export function calculateDynamicTakerFee(price, category = 'default') {
  const p = Math.max(0.001, Math.min(0.999, Number(price)));
  const rate = getCategoryFeeRate(category);
  // Polymarket taker fee curve: C * feeRate * p * (1 - p)
  return rate * p * (1 - p);
}

// ─── 2. 24h Probability Sparkline & Geometry ──────────────────────────
export function calculateMomentum(pointsOrPrices, currentPrice) {
  if (!Array.isArray(pointsOrPrices) || pointsOrPrices.length < 2) {
    return {
      delta: 0,
      deltaPct: 0,
      direction: 'neutral',
      color: '#38bdf8',
      symbol: '■',
      badgeText: '■ 0.0%',
    };
  }
  const p0 = pointsOrPrices[0];
  const pEnd = currentPrice !== undefined ? currentPrice : pointsOrPrices[pointsOrPrices.length - 1];
  const delta = pEnd - p0;
  const deltaPct = delta * 100;

  if (delta > 0.005) {
    return {
      delta,
      deltaPct,
      direction: 'bullish',
      color: '#34d399',
      symbol: '▲',
      badgeText: `▲ +${deltaPct.toFixed(1)}%`,
    };
  } else if (delta < -0.005) {
    return {
      delta,
      deltaPct,
      direction: 'bearish',
      color: '#f87171',
      symbol: '▼',
      badgeText: `▼ ${deltaPct.toFixed(1)}%`,
    };
  } else {
    return {
      delta,
      deltaPct,
      direction: 'neutral',
      color: '#38bdf8',
      symbol: '■',
      badgeText: '■ 0.0%',
    };
  }
}

export function generateBrownianBridge(p0, pEnd, numPoints = 24, seed = 42) {
  const N = Math.max(2, numPoints);
  const delta = Math.abs(pEnd - p0);
  const sigma = Math.max(0.015, Math.min(0.06, delta * 0.8));
  const points = [];

  for (let i = 0; i < N; i++) {
    const tau = i / (N - 1);
    const xi = Math.sin(seed * 12.9898 + i * 78.233);
    let p = (1 - tau) * p0 + tau * pEnd + sigma * Math.sqrt(tau * (1 - tau)) * xi;
    p = Math.max(0.01, Math.min(0.99, p));
    points.push(Number(p.toFixed(4)));
  }
  points[N - 1] = Number(pEnd.toFixed(4));
  return points;
}

export function generateSparklineGeometry(points, width = 160, height = 40, options = {}) {
  const mTop = options.mTop !== undefined ? options.mTop : 5;
  const mBottom = options.mBottom !== undefined ? options.mBottom : 5;
  const hEff = height - mTop - mBottom; // 30px for height=40
  const N = points.length;
  if (N < 2) throw new Error('Sparkline requires at least 2 points');

  const coords = [];
  for (let i = 0; i < N; i++) {
    const p = Math.max(0.01, Math.min(0.99, points[i]));
    const x = (i / (N - 1)) * width;
    let y = height - mBottom - p * hEff;
    // Enforce 4px safety vertical padding
    y = Math.max(4, Math.min(height - 4, y));
    coords.push({ x: Number(x.toFixed(2)), y: Number(y.toFixed(2)), p });
  }

  const polylineStr = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const anchorDot = coords[coords.length - 1];
  const floorLine = getConvictionFloorLine(width, height, 0.87, mBottom, hEff);

  return {
    width,
    height,
    coords,
    polylineStr,
    anchorDot,
    floorLine,
  };
}

export function getConvictionFloorLine(width = 160, height = 40, floorProb = 0.87, mBottom = 5, hEff = 30) {
  // y87 = 40 - 5 - (0.87 * 30) = 8.9px
  const y = height - mBottom - floorProb * hEff;
  return {
    y: Number(y.toFixed(2)),
    x1: 0,
    x2: width,
    dashArray: '3,3',
    label: '87% CONVICTION FLOOR',
  };
}

// ─── 3. L2 DOM Depth Ladder & Fill Bars ───────────────────────────────
export function calculateDepthLadder(rawBids = [], rawAsks = [], maxLevels = 5) {
  // Bids sorted strictly descending
  const sortedBids = [...rawBids]
    .map((b) => (Array.isArray(b) ? { price: Number(b[0]), size: Number(b[1]) } : { price: Number(b.price), size: Number(b.size) }))
    .sort((a, b) => b.price - a.price)
    .slice(0, maxLevels)
    .map((b) => ({
      price: b.price,
      size: b.size,
      depthUsd: Number((b.price * b.size).toFixed(2)),
    }));

  // Asks sorted strictly ascending
  const sortedAsks = [...rawAsks]
    .map((a) => (Array.isArray(a) ? { price: Number(a[0]), size: Number(a[1]) } : { price: Number(a.price), size: Number(a.size) }))
    .sort((a, b) => a.price - b.price)
    .slice(0, maxLevels)
    .map((a) => ({
      price: a.price,
      size: a.size,
      depthUsd: Number((a.price * a.size).toFixed(2)),
    }));

  const allDepths = [...sortedBids.map((b) => b.depthUsd), ...sortedAsks.map((a) => a.depthUsd)];
  const maxDepthUsd = Math.max(...allDepths, 1.0);

  const ladderBids = sortedBids.map((b) => {
    const rawPct = (b.depthUsd / maxDepthUsd) * 100;
    const widthPct = Math.min(100, Math.max(4, Number(rawPct.toFixed(1))));
    return {
      ...b,
      widthPct,
      fillColor: 'rgba(52, 211, 153, 0.16)',
      textColor: '#34d399',
      side: 'bids',
    };
  });

  const ladderAsks = sortedAsks.map((a) => {
    const rawPct = (a.depthUsd / maxDepthUsd) * 100;
    const widthPct = Math.min(100, Math.max(4, Number(rawPct.toFixed(1))));
    return {
      ...a,
      widthPct,
      fillColor: 'rgba(248, 113, 113, 0.16)',
      textColor: '#f87171',
      side: 'asks',
    };
  });

  return {
    ladderBids,
    ladderAsks,
    maxDepthUsd,
    totalBidsDepthUsd: Number(sortedBids.reduce((s, b) => s + b.depthUsd, 0).toFixed(2)),
    totalAsksDepthUsd: Number(sortedAsks.reduce((s, a) => s + a.depthUsd, 0).toFixed(2)),
  };
}

// ─── 4. Explainable Edge & Fair Value Gauge ───────────────────────────
export const MODEL_CONFIGS = {
  shin: {
    name: 'Shin 1993',
    badgeClass: 'bg-purple-900/40 text-purple-300 border-purple-500/30',
    color: '#c084fc',
    description: 'De-vigged via Shin (1993) microstructure model eliminating insider overround',
  },
  weather_nwp: {
    name: 'Weather NWP',
    badgeClass: 'bg-sky-900/40 text-sky-300 border-sky-500/30',
    color: '#38bdf8',
    description: 'Calibrated GFS + ECMWF superensemble with Laplace ECDF / KDE',
  },
  ai_ensemble: {
    name: 'AI Ensemble',
    badgeClass: 'bg-emerald-900/40 text-emerald-300 border-emerald-500/30',
    color: '#34d399',
    description: 'Bayesian multi-signal ensemble combining historical base rates & order flow',
  },
};

export function getModelAttributionBadge(modelType) {
  const key = String(modelType || 'shin').toLowerCase().replace(/\s+/g, '_');
  if (key.includes('weather')) return MODEL_CONFIGS.weather_nwp;
  if (key.includes('ai') || key.includes('ensemble')) return MODEL_CONFIGS.ai_ensemble;
  return MODEL_CONFIGS.shin;
}

export function getValuationTier(netEdgePct) {
  const edge = Number(netEdgePct);
  if (edge > 3.0) {
    return {
      state: 'UNDERPRICED',
      label: `UNDERPRICED (+${edge.toFixed(1)}%)`,
      color: '#34d399',
      badgeClass: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
      actionRecommendation: 'BUY',
    };
  } else if (edge >= 0.5) {
    return {
      state: 'MODERATE_EDGE',
      label: `MODERATE EDGE (+${edge.toFixed(1)}%)`,
      color: '#a3e635',
      badgeClass: 'bg-lime-500/20 text-lime-400 border-lime-500/40',
      actionRecommendation: 'LEAN_BUY',
    };
  } else if (edge > -0.5) {
    return {
      state: 'FAIR_VALUE',
      label: 'FAIR VALUE',
      color: '#94a3b8',
      badgeClass: 'bg-slate-500/20 text-slate-400 border-slate-500/40',
      actionRecommendation: 'HOLD',
    };
  } else {
    return {
      state: 'OVERPRICED',
      label: `OVERPRICED (${edge.toFixed(1)}%)`,
      color: '#f87171',
      badgeClass: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
      actionRecommendation: 'SELL_OR_AVOID',
    };
  }
}

export function calculateExplainableEdge(marketPrice, fairPrice, category = 'default', modelType = 'shin', side = 'YES') {
  const mkt = Number(marketPrice);
  const fair = Number(fairPrice);
  const feeRate = getCategoryFeeRate(category);

  // Dynamic fee per share: feeRate * p * (1 - p)
  const feePerShare = feeRate * mkt * (1 - mkt);

  let grossEdge = 0;
  let netEdge = 0;

  if (side === 'YES') {
    grossEdge = fair - mkt;
    netEdge = grossEdge - feePerShare;
  } else {
    grossEdge = mkt - fair;
    netEdge = grossEdge - feePerShare;
  }

  const grossEdgePct = Number((grossEdge * 100).toFixed(2));
  const netEdgePct = Number((netEdge * 100).toFixed(1));
  const feePct = Number((feePerShare * 100).toFixed(2));
  const valuation = getValuationTier(netEdgePct);
  const modelAttribution = getModelAttributionBadge(modelType);

  return {
    marketPrice: mkt,
    fairPrice: fair,
    category,
    feeRate,
    feePerShare: Number(feePerShare.toFixed(5)),
    feePct,
    grossEdge: Number(grossEdge.toFixed(4)),
    grossEdgePct,
    netEdge: Number(netEdge.toFixed(4)),
    netEdgePct,
    valuation,
    modelAttribution,
  };
}

// ─── 5. Discrete VWAP Walk & Price Impact System ───────────────────────
export function calculateDiscreteVwap(ladderAsks, orderSizeUsd, category = 'default', fallbackBestAsk = 0.5) {
  const sorted = [...ladderAsks].sort((a, b) => a.price - b.price);
  const bestAsk = sorted.length > 0 ? sorted[0].price : fallbackBestAsk;
  const totalDepthUsd = sorted.reduce((sum, l) => sum + (l.depthUsd || l.price * l.size), 0);

  let remainingUsd = orderSizeUsd;
  let totalSharesFilled = 0;
  let totalSpentUsd = 0;

  for (const level of sorted) {
    if (remainingUsd <= 0) break;
    const price = level.price;
    const sharesAvailable = level.size;
    const levelCost = sharesAvailable * price;

    if (remainingUsd >= levelCost) {
      totalSharesFilled += sharesAvailable;
      totalSpentUsd += levelCost;
      remainingUsd -= levelCost;
    } else {
      const partialShares = remainingUsd / price;
      totalSharesFilled += partialShares;
      totalSpentUsd += remainingUsd;
      remainingUsd = 0;
    }
  }

  const isFullyFilled = remainingUsd <= 0;
  const vwap = totalSharesFilled > 0 ? totalSpentUsd / totalSharesFilled : bestAsk;
  const priceImpactPct = bestAsk > 0 ? ((vwap - bestAsk) / bestAsk) * 100 : 0;
  const consumptionRatio = totalDepthUsd > 0 ? (orderSizeUsd / totalDepthUsd) * 100 : 0;

  // Dynamic fee calculation
  const feeRate = getCategoryFeeRate(category);
  const estimatedFeeUsd = totalSpentUsd * feeRate;
  const netVwap = totalSharesFilled > 0 ? (totalSpentUsd + estimatedFeeUsd) / totalSharesFilled : vwap;
  const breakEvenProb = netVwap;

  const warning = getSlippageWarningTier(orderSizeUsd, totalDepthUsd, priceImpactPct, consumptionRatio);

  return {
    orderSizeUsd,
    totalDepthUsd: Number(totalDepthUsd.toFixed(2)),
    totalSharesFilled: Number(totalSharesFilled.toFixed(2)),
    totalSpentUsd: Number(totalSpentUsd.toFixed(2)),
    remainingUsd: Number(remainingUsd.toFixed(2)),
    isFullyFilled,
    vwap: Number(vwap.toFixed(4)),
    priceImpactPct: Number(priceImpactPct.toFixed(2)),
    consumptionRatio: Number(consumptionRatio.toFixed(2)),
    feeRate,
    estimatedFeeUsd: Number(estimatedFeeUsd.toFixed(4)),
    netVwap: Number(netVwap.toFixed(4)),
    breakEvenProb: Number(breakEvenProb.toFixed(4)),
    warning,
  };
}

export function getSlippageWarningTier(orderSizeUsd, totalDepthUsd, priceImpactPct, consumptionRatio) {
  const rho = consumptionRatio !== undefined ? consumptionRatio : (totalDepthUsd > 0 ? (orderSizeUsd / totalDepthUsd) * 100 : 0);

  if (orderSizeUsd > totalDepthUsd) {
    return {
      tier: 'exhaustion',
      title: 'BOOK EXHAUSTION',
      symbol: '⛔',
      badgeClass: 'bg-red-950 text-red-300 animate-pulse border-red-500',
      color: '#dc2626',
      canExecute: false,
      description: 'Order exceeds total visible book depth. Unfilled liquidity would cause extreme slippage.',
    };
  } else if (rho > 2.0) {
    return {
      tier: 'danger',
      title: `HIGH SLIPPAGE RISK (${rho.toFixed(1)}% Depth)`,
      symbol: '🚨',
      badgeClass: 'bg-rose-900/30 text-rose-400 border-rose-600/50',
      color: '#f87171',
      canExecute: true,
      description: 'Order consumes >2.0% of visible depth. Expected slippage exceeds institutional limit.',
    };
  } else if (rho > 1.0) {
    return {
      tier: 'warning',
      title: `LIQUIDITY WARNING (${rho.toFixed(1)}% Depth)`,
      symbol: '⚠️',
      badgeClass: 'bg-amber-900/30 text-amber-400 border-amber-600/50',
      color: '#fbbf24',
      canExecute: true,
      description: 'Order consumes noticeable share of book depth (1.0% - 2.0%). Check average fill price.',
    };
  } else {
    return {
      tier: 'nominal',
      title: 'MINIMAL IMPACT (<1.0% Depth)',
      symbol: '🟢',
      badgeClass: 'bg-emerald-900/30 text-emerald-400',
      color: '#34d399',
      canExecute: true,
      description: 'Order is within safe institutional execution capacity.',
    };
  }
}

// ─── 6. Scaffolding & Proxy Validation ────────────────────────────────
export function validateFrontendScaffolding(frontendDir) {
  const packageJsonPath = path.join(frontendDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`frontend/package.json does not exist at ${packageJsonPath}`);
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const hasReact = !!(pkg.dependencies?.react && pkg.dependencies?.['react-dom']);
  const hasVite = !!pkg.devDependencies?.vite;
  const hasTailwind = !!pkg.devDependencies?.tailwindcss;
  const hasBuildScript = pkg.scripts && typeof pkg.scripts.build === 'string';
  const hasDevScript = pkg.scripts && typeof pkg.scripts.dev === 'string';

  return {
    valid: hasReact && hasVite && hasTailwind && hasBuildScript && hasDevScript,
    pkg,
    hasReact,
    hasVite,
    hasTailwind,
    hasBuildScript,
    hasDevScript,
  };
}
