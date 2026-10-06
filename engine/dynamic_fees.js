/**
 * engine/dynamic_fees.js
 * 
 * Dynamic Polymarket Venue Fee Schedule and Net Edge Model.
 * Implements non-linear taker fee formula C * feeRate * p * (1 - p),
 * maker zero-fee policy with maker rebates, and category schedules.
 */

// Category dynamic fee rates (Polymarket CLOB fee schedules)
export const CATEGORY_FEE_RATES = {
  weather: 0.05,
  crypto: 0.07,
  sports: 0.05,
  politics: 0.04,
  finance: 0.04,
  tech: 0.04,
  mentions: 0.04,
  geopolitics: 0.00,
  default: 0.05
};

// Maker rebate proportion of collected taker fees
export const CATEGORY_MAKER_REBATES = {
  weather: 0.25,
  crypto: 0.20,
  sports: 0.15,
  politics: 0.25,
  finance: 0.25,
  tech: 0.25,
  mentions: 0.25,
  geopolitics: 0.00,
  default: 0.25
};

/**
 * Retrieve taker fee rate for a given market category.
 * @param {string} category - Market category tag (e.g. 'weather', 'crypto')
 * @returns {number} Fee rate decimal (e.g. 0.05 for 5%)
 */
export function getFeeRate(category = 'weather') {
  if (!category || typeof category !== 'string') {
    return CATEGORY_FEE_RATES.default;
  }
  const normalized = category.toLowerCase().trim();
  return CATEGORY_FEE_RATES[normalized] ?? CATEGORY_FEE_RATES.default;
}

/**
 * Retrieve maker rebate rate for a given market category.
 * @param {string} category
 * @returns {number}
 */
export function getMakerRebateRate(category = 'weather') {
  if (!category || typeof category !== 'string') {
    return CATEGORY_MAKER_REBATES.default;
  }
  const normalized = category.toLowerCase().trim();
  return CATEGORY_MAKER_REBATES[normalized] ?? CATEGORY_MAKER_REBATES.default;
}

/**
 * Calculate per-share taker fee for an order.
 * Formula: feeRate * p * (1 - p)
 * 
 * @param {number} price - Share price p in (0, 1)
 * @param {string} category - Market category
 * @returns {number} Fee per share in USDC
 */
export function calculateTakerFeePerShare(price, category = 'weather') {
  if (price <= 0 || price >= 1) return 0.0;
  const rate = getFeeRate(category);
  return rate * price * (1.0 - price);
}

/**
 * Calculate dynamic taker fee in USDC for an order of size C shares at price p.
 * Non-linear formula: Fee = shares * feeRate * price * (1 - price) USDC.
 * Precision: Rounded to 5 decimal places; trades with fee < 0.00001 USDC round to 0.
 * 
 * Interface Contract (PROJECT.md):
 * calculateDynamicFee(shares: number, price: number, category?: string): number
 * 
 * @param {number} shares - Number of shares (C)
 * @param {number} price - Execution price p in (0, 1)
 * @param {string} category - Market category (default: 'weather')
 * @returns {number} Fee in USDC rounded to 5 decimal places
 */
export function calculateDynamicFee(shares, price, category = 'weather') {
  if (!shares || shares <= 0 || !price || price <= 0 || price >= 1) {
    return 0.0;
  }

  const rate = getFeeRate(category);
  const rawFee = shares * rate * price * (1.0 - price);
  const roundedFee = Math.round(rawFee * 100000) / 100000;

  if (roundedFee < 0.00001) {
    return 0.0;
  }

  return roundedFee;
}

/**
 * Calculate maker trading fee.
 * Makers pay 0 fee on Polymarket.
 * @returns {number} 0.0
 */
export function calculateMakerFee(shares, price, category = 'weather') {
  return 0.0;
}

/**
 * Calculate maker rebate in USDC earned by passive liquidity providers.
 * Rebate = shares * feeRate * p * (1 - p) * makerRebateRate.
 * 
 * @param {number} shares
 * @param {number} price
 * @param {string} category
 * @returns {number} Rebate amount in USDC
 */
export function calculateMakerRebate(shares, price, category = 'weather') {
  if (!shares || shares <= 0 || !price || price <= 0 || price >= 1) {
    return 0.0;
  }
  const perShare = calculateTakerFeePerShare(price, category);
  const rebateRate = getMakerRebateRate(category);
  const rawRebate = shares * perShare * rebateRate;
  return Math.round(rawRebate * 100000) / 100000;
}

/**
 * Calculate Net Edge for both YES and NO sides accounting for dynamic taker venue fees.
 * 
 * Buying YES:
 * - Taker crosses Ask a
 * - Gross Edge: p_fair - a
 * - Taker Fee: feeRate * a * (1 - a)
 * - Net Edge YES: (p_fair - a) - feeRate * a * (1 - a)
 * 
 * Buying NO (selling YES at Bid b):
 * - Taker crosses Ask NO = 1 - b
 * - Gross Edge: (1 - p_fair) - (1 - b) = b - p_fair
 * - Taker Fee: feeRate * b * (1 - b)
 * - Net Edge NO: (b - p_fair) - feeRate * b * (1 - b)
 * 
 * Interface Contract (PROJECT.md):
 * calculateNetEdge(fairProb: number, askPrice: number, bidPrice: number, category?: string): {
 *   netEdgeYes: number,
 *   netEdgeNo: number,
 *   grossEdgeYes: number,
 *   takerFeePerShare: number,
 *   ...
 * }
 * 
 * @param {number} fairProb - Model fair value probability p_fair in (0, 1)
 * @param {number} askPrice - Best market ask for YES (0 < askPrice < 1)
 * @param {number} bidPrice - Best market bid for YES (0 < bidPrice < 1)
 * @param {string} category - Market category
 * @returns {object} Net and gross edges with fee breakdown
 */
export function calculateNetEdge(fairProb, askPrice, bidPrice, category = 'weather') {
  if (typeof fairProb !== 'number' || isNaN(fairProb)) {
    throw new TypeError(`Invalid fairProb: ${fairProb}`);
  }
  if (typeof askPrice !== 'number' || isNaN(askPrice)) {
    throw new TypeError(`Invalid askPrice: ${askPrice}`);
  }
  if (typeof bidPrice !== 'number' || isNaN(bidPrice)) {
    throw new TypeError(`Invalid bidPrice: ${bidPrice}`);
  }

  const rate = getFeeRate(category);

  // YES outcome (buying at askPrice)
  const grossEdgeYes = fairProb - askPrice;
  const takerFeePerShareYes = calculateTakerFeePerShare(askPrice, category);
  const netEdgeYes = grossEdgeYes - takerFeePerShareYes;

  // NO outcome (buying at 1 - bidPrice)
  const grossEdgeNo = bidPrice - fairProb;
  const takerFeePerShareNo = calculateTakerFeePerShare(bidPrice, category);
  const netEdgeNo = grossEdgeNo - takerFeePerShareNo;

  // Break-even prices
  const breakEvenAskYes = askPrice + takerFeePerShareYes;
  const breakEvenBidNo = bidPrice - takerFeePerShareNo;

  return {
    netEdgeYes: Math.round(netEdgeYes * 100000) / 100000,
    netEdgeNo: Math.round(netEdgeNo * 100000) / 100000,
    grossEdgeYes: Math.round(grossEdgeYes * 100000) / 100000,
    grossEdgeNo: Math.round(grossEdgeNo * 100000) / 100000,
    takerFeePerShare: Math.round(takerFeePerShareYes * 100000) / 100000,
    takerFeePerShareYes: Math.round(takerFeePerShareYes * 100000) / 100000,
    takerFeePerShareNo: Math.round(takerFeePerShareNo * 100000) / 100000,
    breakEvenAskYes: Math.round(breakEvenAskYes * 100000) / 100000,
    breakEvenBidNo: Math.round(breakEvenBidNo * 100000) / 100000,
    category,
    feeRate: rate
  };
}
