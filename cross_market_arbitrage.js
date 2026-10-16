// ══════════════════════════════════════════════════════════════════════
//  cross_market_arbitrage.js — Kolmogorov Bound & Cross-Market Arbitrage Engine
//  Milestone M2: Kolmogorov Probability Bounds, Strict Entity Resolution,
//  Dynamic Fees & 10% Kelly Cap
// ══════════════════════════════════════════════════════════════════════

import { getCategory } from './scanner.js';
import { calculateTakerFeePerShare } from './engine/dynamic_fees.js';

export const MAX_CROSS_KELLY_PERCENT = 10.0; // 10% institutional ceiling
export const MIN_CROSS_NET_EDGE = 0.005;     // Min 0.5% net edge floor

/**
 * Domain Ontologies for Strict Hierarchy Resolution
 */
export const ENTITY_ONTOLOGIES = [
  // 1. Rates: Fed Rate Cut Magnitude
  {
    domain: 'rates',
    match: (q) => /fed (?:decrease|cut|lower|rate cut)/i.test(q),
    extract: (q) => {
      const scopeMatch = q.match(/(january|february|march|april|may|june|july|august|september|october|november|december|\b202[4-6]\b)/i);
      const scope = scopeMatch ? scopeMatch[0].toLowerCase() : 'fomc_next';
      const bpsMatch = q.match(/(\d+)\+?\s*bps/i);
      const threshold = bpsMatch ? parseInt(bpsMatch[1], 10) : 0;
      return {
        domain: 'rates',
        subject: 'fed_rate_cut',
        scope,
        threshold, // 0 means any cut, 25 means 25+ bps, 50 means 50+ bps
        isHierarchy: true
      };
    },
    // Child is subset of Parent if child threshold > parent threshold in same scope
    isSubset: (childMeta, parentMeta) => {
      return childMeta.domain === 'rates' &&
        parentMeta.domain === 'rates' &&
        childMeta.scope === parentMeta.scope &&
        childMeta.threshold > parentMeta.threshold;
    }
  },

  // 2. Politics: Senate Seats Thresholds
  {
    domain: 'politics_seats',
    match: (q) => /(republican|gop|democrat|democratic).*(?:control.*senate|majority.*senate|win \d+\+? senate seats)/i.test(q),
    extract: (q) => {
      const subject = /republican|gop/i.test(q) ? 'gop' : /democrat|democratic/i.test(q) ? 'dem' : null;
      const scopeMatch = q.match(/202[4-8]/);
      const scope = scopeMatch ? scopeMatch[0] : '2024';
      const seatsMatch = q.match(/(\d+)\+? senate seats/i);
      const threshold = seatsMatch ? parseInt(seatsMatch[1], 10) : 51; // Control implies >= 51
      return {
        domain: 'politics_seats',
        subject,
        scope,
        threshold,
        isHierarchy: true
      };
    },
    // Child is subset of Parent if same party & scope, and child seats > parent seats
    isSubset: (childMeta, parentMeta) => {
      return childMeta.domain === 'politics_seats' &&
        parentMeta.domain === 'politics_seats' &&
        childMeta.subject && parentMeta.subject &&
        childMeta.subject === parentMeta.subject &&
        childMeta.scope === parentMeta.scope &&
        childMeta.threshold > parentMeta.threshold;
    }
  },

  // 3. Politics: Presidential Nomination vs General Election
  {
    domain: 'politics_nomination',
    match: (q) => /win (?:the )?202[4-8] (?:democratic|republican) presidential nomination|win (?:the )?202[4-8] presidential election/i.test(q),
    extract: (q) => {
      const candidateMatch = q.match(/will ([a-z\s\.\-]+) win/i);
      const rawCandidate = candidateMatch ? candidateMatch[1].trim().toLowerCase() : '';
      const scopeMatch = q.match(/202[4-8]/);
      const scope = scopeMatch ? scopeMatch[0] : '2024';
      const isGeneral = /presidential election/i.test(q);
      const isNomination = /presidential nomination/i.test(q);
      return {
        domain: 'politics_nomination',
        subject: rawCandidate,
        scope,
        role: isGeneral ? 'child' : isNomination ? 'parent' : 'unknown',
        isHierarchy: true
      };
    },
    // Winning presidency (child) implies winning nomination (parent) for partisan candidates
    isSubset: (childMeta, parentMeta) => {
      return childMeta.domain === 'politics_nomination' &&
        parentMeta.domain === 'politics_nomination' &&
        childMeta.subject && parentMeta.subject &&
        childMeta.subject === parentMeta.subject &&
        childMeta.scope === parentMeta.scope &&
        childMeta.role === 'child' &&
        parentMeta.role === 'parent';
    }
  },

  // 4. Crypto: Strike Price Thresholds
  {
    domain: 'crypto_strike',
    match: (q) => /(bitcoin|btc|ethereum|eth|solana|sol) (?:reach|hit|above|over) \$?([\d,]+k?)/i.test(q),
    extract: (q) => {
      const subject = /btc|bitcoin/i.test(q) ? 'btc' : /eth|ethereum/i.test(q) ? 'eth' : /sol|solana/i.test(q) ? 'sol' : null;
      const strikeMatch = q.match(/\$?([\d,]+)(k)?/i);
      let threshold = 0;
      if (strikeMatch) {
        threshold = parseFloat(strikeMatch[1].replace(/,/g, ''));
        if (strikeMatch[2]?.toLowerCase() === 'k') threshold *= 1000;
      }
      const scopeMatch = q.match(/202[4-8]|in [a-z]+/i);
      const scope = scopeMatch ? scopeMatch[0].toLowerCase() : 'global';
      return {
        domain: 'crypto_strike',
        subject,
        scope,
        threshold,
        isHierarchy: true
      };
    },
    // Higher strike price is subset of lower strike price: P(BTC >= 120k) <= P(BTC >= 100k)
    isSubset: (childMeta, parentMeta) => {
      return childMeta.domain === 'crypto_strike' &&
        parentMeta.domain === 'crypto_strike' &&
        childMeta.subject && parentMeta.subject &&
        childMeta.subject === parentMeta.subject &&
        childMeta.scope === parentMeta.scope &&
        childMeta.threshold > parentMeta.threshold;
    }
  }
];

/**
 * Scan markets for Kolmogorov conditional probability bound violations.
 * An anomaly occurs if and only if P(Child) > P(Parent) for Child subset of Parent.
 * 
 * @param {Array} markets - Polymarket market items
 * @param {Object} options - Optional configuration { minNetEdge }
 * @returns {Array} Flagged statistical/arbitrage opportunities
 */
export function scanCrossMarketOpps(markets = [], options = {}) {
  const results = [];
  const minNetEdge = options.minNetEdge ?? MIN_CROSS_NET_EDGE;
  const classifiedMarkets = [];

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

    const yesIdx = outcomes.findIndex(o => String(o).toLowerCase() === 'yes');
    if (yesIdx === -1) continue;

    const price = prices[yesIdx];
    if (typeof price !== 'number' || isNaN(price) || price <= 0 || price >= 1.0) continue;

    const vol24 = parseFloat(m.volume24hr ?? 0);
    const liq = parseFloat(m.liquidityNum ?? m.liquidity ?? 0);
    const category = getCategory(m);
    const q = m.question || '';

    // Match against domain ontologies
    for (const ontology of ENTITY_ONTOLOGIES) {
      if (ontology.match(q)) {
        const meta = ontology.extract(q);
        if (meta && meta.isHierarchy) {
          classifiedMarkets.push({
            m,
            question: q,
            price,
            vol24hr: vol24,
            liquidity: liq,
            category,
            tokenID: clobTokenIds[yesIdx] || null,
            url: `https://polymarket.com/event/${m.slug || ''}`,
            meta,
            ontology
          });
        }
      }
    }
  }

  // Cross-reference all pairs for subset relationships
  for (let i = 0; i < classifiedMarkets.length; i++) {
    for (let j = 0; j < classifiedMarkets.length; j++) {
      if (i === j) continue;

      const candChild = classifiedMarkets[i];
      const candParent = classifiedMarkets[j];

      // Must share identical ontology domain
      if (candChild.ontology.domain !== candParent.ontology.domain) continue;

      // Check if candChild is a strict subset of candParent
      const isSubset = candChild.ontology.isSubset(candChild.meta, candParent.meta);
      if (!isSubset) continue;

      // Kolmogorov conditional probability bound:
      // Invariant: P(Child) <= P(Parent)
      // Violation: P(Child) > P(Parent)
      if (candChild.price <= candParent.price) {
        // Mathematically sound subset relationship — not an arbitrage violation
        continue;
      }

      // Compute gross spread and dynamic taker venue fees
      const grossSpread = candChild.price - candParent.price;
      const feeChild = calculateTakerFeePerShare(candChild.price, candChild.category);
      const feeParent = calculateTakerFeePerShare(candParent.price, candParent.category);
      const totalFees = feeChild + feeParent;
      const netEdge = grossSpread - totalFees;

      if (netEdge < minNetEdge) continue;

      // Fractional Kelly sizing on overpriced child contract
      // Selling child (or buying child NO at 1 - child.price)
      // Odds b = (1.0 / child.price) - 1
      // Theoretical win probability for NO is at least 1 - parent.price
      const fStar = 1.0 - (candParent.price / candChild.price);
      const rawKelly = Math.max(0, (fStar * 0.5) * 100);
      const kellyPositionPercent = Math.min(MAX_CROSS_KELLY_PERCENT, Math.max(0, parseFloat(rawKelly.toFixed(2))));

      const lagSpreadPercent = Math.round(grossSpread * 100);
      let confidence = Math.min(99, Math.max(50, Math.round(50 + (netEdge * 100))));
      if (candParent.vol24hr > 10000) confidence += 5;
      if (candChild.vol24hr > 1000) confidence += 5;
      confidence = Math.min(100, confidence);

      results.push({
        type: 'cross_market_lag',
        parentQuestion: candParent.question,
        parentPrice: parseFloat(candParent.price.toFixed(3)),
        parentVolume: Math.round(candParent.vol24hr),
        childQuestion: candChild.question,
        childPrice: parseFloat(candChild.price.toFixed(3)),
        childVolume: Math.round(candChild.vol24hr),
        lagSpreadPercent,
        grossSpread: parseFloat(grossSpread.toFixed(4)),
        totalFeesUsd: parseFloat(totalFees.toFixed(4)),
        netEdge: parseFloat(netEdge.toFixed(4)),
        kellyPositionPercent,
        confidence,
        expectedAdjustment: 'SELL CHILD (Violates P(Child) <= P(Parent))',
        tokenID: candChild.tokenID,
        url: candChild.url,
        category: candChild.category,
        domain: candChild.ontology.domain,
        detectedAt: new Date().toISOString()
      });
    }
  }

  // Sort by highest net edge
  return results.sort((a, b) => b.netEdge - a.netEdge);
}
