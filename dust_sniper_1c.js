// ══════════════════════════════════════════════════════════════════════
//  dust_sniper_1c.js — Calibrated 1¢ Dust & Mispriced Share Sweeper Engine
//  Milestone M2: Empirical Probability, Calibrated Longshot Rates,
//  Dynamic Venue Fees & <= 0.5% Bankroll Cap
// ══════════════════════════════════════════════════════════════════════

import { getCategory } from './scanner.js';
import { calculateTakerFeePerShare } from './engine/dynamic_fees.js';

export const MAX_DUST_KELLY_PERCENT = 0.50; // Strict <= 0.5% institutional bankroll ceiling

/**
 * Scan markets for 1c-3c shares with positive expected value based on empirical probability.
 * @param {Array} markets - Polymarket market items
 * @param {Object} options - Optional configuration { filterPositiveEv }
 * @returns {Array} Flagged mispriced penny share opportunities
 */
export function scan1cOpps(markets = [], options = {}) {
  const results = [];
  const now = new Date();
  const filterPositiveEv = options.filterPositiveEv ?? true;

  for (const m of markets) {
    if (m.closed || !m.active) continue;

    let prices, outcomes, clobTokenIds;
    try {
      prices = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices || [];
      outcomes = typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : m.outcomes || [];
      clobTokenIds = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds || [];
      prices = prices.map(Number);
    } catch (e) {
      continue;
    }

    if (!prices.length || prices.length !== outcomes.length) continue;

    const rawEnd = m.endDateIso || m.endDate || '';
    const endDate = rawEnd ? new Date(rawEnd) : null;
    const hoursLeft = endDate && !isNaN(endDate.getTime()) ? (endDate - now) / 3_600_000 : 999;
    if (hoursLeft < -1) continue; // Ignore markets ended > 1 hour ago

    const eventSlug = Array.isArray(m.events) && m.events[0]?.slug ? m.events[0].slug : m.slug || '';
    const liq = parseFloat(m.liquidityNum ?? m.liquidity ?? 0);
    const vol24 = parseFloat(m.volume24hr ?? 0);
    const category = getCategory(m);
    const bookSum = prices.reduce((acc, v) => acc + v, 0);
    const numOutcomes = prices.length;

    prices.forEach((price, idx) => {
      // Look for 1c to 3c shares ($0.01 to $0.03)
      if (price >= 0.01 && price <= 0.03) {
        // Find maximum price among all sibling outcomes
        const siblingPrices = prices.filter((_, i) => i !== idx);
        const siblingMaxPrice = siblingPrices.length > 0 ? Math.max(...siblingPrices) : 0;

        // Residual unallocated probability pool (if leader is at 0.70, residual is 0.30)
        const residualPool = Math.max(0, 1.0 - siblingMaxPrice);
        // Fair share upper bound for any individual non-leader outcome
        const pFairShare = numOutcomes > 1 ? residualPool / (numOutcomes - 1) : price;

        // Time horizon multiplier: contracts ending in <24h have near-zero longshot value
        const timeFactor = hoursLeft <= 24 ? 0.2 : hoursLeft <= 168 ? 0.6 : 1.0;
        // Liquidity sanity multiplier (defaults to 1.0 if liquidity metadata is omitted)
        const hasLiq = m.liquidityNum !== undefined || m.liquidity !== undefined;
        const liqFactor = hasLiq ? Math.min(1.0, Math.max(0.5, Math.log10(Math.max(liq, 10)) / 4)) : 1.0;

        // Calibrated empirical probability calculation
        let estWinProb = price;

        if (numOutcomes > 2) {
          // Multi-outcome market: bounded strictly by fair share of residual unallocated pool
          if (bookSum > 0 && bookSum < 0.999) {
            // Underround book: normalized fair value
            const normalizedProb = price / bookSum;
            estWinProb = Math.min(pFairShare, normalizedProb * timeFactor * liqFactor);
          } else {
            // Standard/overround book: longshot is discounted by favorite-longshot bias
            estWinProb = Math.min(pFairShare, price * timeFactor * liqFactor);
          }
        } else {
          // Binary market:
          // If sum of asks < 1.0 (underround book), normalized prob:
          if (bookSum > 0 && bookSum < 0.999) {
            estWinProb = price / bookSum;
          } else {
            // Fair or overround binary book: no free lunch, bounded by price * timeFactor
            estWinProb = Math.min(price, (price / Math.max(1.0, bookSum)) * timeFactor);
          }
        }

        // Deduct dynamic taker venue fee via engine/dynamic_fees.js
        const takerFee = calculateTakerFeePerShare(price, category);
        const totalCost = price + takerFee;
        const ev = (estWinProb * 1.0) - totalCost;
        const expectedRoi = totalCost > 0 ? (ev / totalCost) * 100 : 0;

        // Kelly calculation for penny share:
        // b = odds = (Payout / totalCost) - 1
        const b = (1.0 / totalCost) - 1;
        const p = estWinProb;
        const q = 1 - p;
        const rawKelly = b > 0 ? (b * p - q) / b : 0;

        // Quarter-Kelly sizing strictly capped at institutional ceiling of 0.50%
        const kellyPositionPercent = ev > 0
          ? Math.min(MAX_DUST_KELLY_PERCENT, Math.max(0, parseFloat(((rawKelly * 0.25) * 100).toFixed(2))))
          : 0.0;

        // Filter: only include positive EV trades unless explicitly requested otherwise
        if (filterPositiveEv && (ev <= 0 || expectedRoi <= 0)) {
          return;
        }

        // Confidence based on liquidity and volume
        let confidence = 50;
        if (liq > 1000) confidence += 20;
        if (vol24 > 500) confidence += 15;
        if (estWinProb > 0.02) confidence += 15;
        confidence = Math.min(100, Math.max(0, confidence));

        results.push({
          type: '1c_dust',
          question: m.question,
          outcome: outcomes[idx] ?? `Outcome ${idx}`,
          price,
          payout: 1.0,
          estWinProb: parseFloat(estWinProb.toFixed(6)),
          takerFee: parseFloat(takerFee.toFixed(5)),
          totalCost: parseFloat(totalCost.toFixed(5)),
          expectedRoi: Math.round(expectedRoi),
          ev: parseFloat(ev.toFixed(4)),
          kellyPositionPercent,
          confidence,
          tokenID: clobTokenIds[idx] || null,
          url: `https://polymarket.com/event/${eventSlug}`,
          category,
          liquidity: liq,
          vol24hr: vol24,
          hoursLeft: Math.max(0, Math.round(hoursLeft)),
          detectedAt: new Date().toISOString()
        });
      }
    });
  }

  // Sort by highest EV
  return results.sort((a, b) => b.ev - a.ev);
}
