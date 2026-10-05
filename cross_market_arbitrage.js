// ══════════════════════════════════════════════════════════════════════
//  cross_market_arbitrage.js — Cross-Market & Correlated Market Lag Tracker
// ══════════════════════════════════════════════════════════════════════

import { getCategory } from './scanner.js';

export function scanCrossMarketOpps(markets) {
  const results = [];
  
  // Classify parent (macro) and child (micro/regional) markets
  const parentMarkets = [];
  const childMarkets = [];

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

    const q = (m.question || '').toLowerCase();
    const vol24 = parseFloat(m.volume24hr ?? 0);
    const liq = parseFloat(m.liquidityNum ?? m.liquidity ?? 0);

    const yesIdx = outcomes.findIndex(o => String(o).toLowerCase() === 'yes');
    if (yesIdx === -1) continue;

    const item = {
      id: m.id,
      question: m.question,
      price: prices[yesIdx],
      vol24hr: vol24,
      liquidity: liq,
      category: getCategory(m),
      tokenID: clobTokenIds[yesIdx] || null,
      url: `https://polymarket.com/event/${m.slug || ''}`
    };

    // Flag Macro vs Regional
    if (q.includes('presidential election') || q.includes('control senate') || q.includes('fed decrease') || q.includes('gta vi')) {
      parentMarkets.push(item);
    } else if (q.includes('win pennsylvania') || q.includes('win georgia') || q.includes('win wisconsin') || q.includes('by 50+ bps') || q.includes('by 25 bps')) {
      childMarkets.push(item);
    }
  }

  // Cross-reference correlation pairs
  for (const child of childMarkets) {
    for (const parent of parentMarkets) {
      // Check if they share keywords (e.g. Trump, Fed, Ceasefire)
      const childWords = child.question.toLowerCase().split(/\s+/);
      const parentWords = parent.question.toLowerCase().split(/\s+/);
      
      const sharedWords = childWords.filter(w => w.length > 3 && parentWords.includes(w));

      if (sharedWords.length >= 2) {
        // Compute probability divergence
        const divergence = Math.abs(parent.price - child.price);
        
        // If high divergence (e.g., Parent is 85% while child is lagging at 65%)
        if (divergence >= 0.12 && parent.vol24hr > child.vol24hr) {
          const lagSpreadPercent = Math.round(divergence * 100);

          // Calculate Kelly Criterion
          // b = odds for child = (1 / child.price) - 1
          const b = (1.0 / child.price) - 1;
          const p = parent.price; // expected probability is parent's price
          const q = 1 - p;
          let kelly = b > 0 ? (b * p - q) / b : 0;
          kelly = Math.max(0, Math.min(1, kelly)); // Cap at 100%

          // Confidence based on divergence, volume
          let confidence = 40 + (divergence * 100); 
          if (parent.vol24hr > 10000) confidence += 10;
          if (child.vol24hr > 1000) confidence += 10;
          confidence = Math.min(100, Math.max(0, Math.round(confidence)));

          results.push({
            type: 'cross_market_lag',
            parentQuestion: parent.question,
            parentPrice: parseFloat(parent.price.toFixed(2)),
            parentVolume: Math.round(parent.vol24hr),
            childQuestion: child.question,
            childPrice: parseFloat(child.price.toFixed(2)),
            childVolume: Math.round(child.vol24hr),
            lagSpreadPercent: lagSpreadPercent,
            kellyPositionPercent: parseFloat((kelly * 100).toFixed(2)),
            confidence: confidence,
            expectedAdjustment: parent.price > child.price ? 'BUY CHILD (Lagging Up)' : 'SELL CHILD (Lagging Down)',
            tokenID: child.tokenID,
            url: child.url,
            category: child.category,
            detectedAt: new Date().toISOString()
          });
        }
      }
    }
  }

  // Sort by largest price divergence/lag spread
  return results.sort((a, b) => b.lagSpreadPercent - a.lagSpreadPercent);
}
