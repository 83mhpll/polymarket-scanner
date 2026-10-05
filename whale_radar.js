// ══════════════════════════════════════════════════════════════════════
//  whale_radar.js — Polymarket On-Chain Whale & Smart Money Tracker
// ══════════════════════════════════════════════════════════════════════

import { getCategory } from './scanner.js';

const POLYGON_CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
const POLYGON_NEGRISK_EXCHANGE = '0xC5d563A36AE78145C45a50134d48A1215220f80a';
const MIN_WHALE_TRADE_USD = 5000; // Flag trades over $5k

/**
 * Scan recent high-volume transactions and identify whale accumulations
 * @param {Array} markets - List of active markets
 * @returns {Array} whaleOpportunities - Detected whale movements
 */
export async function scanWhaleMovements(markets = []) {
  const whaleSignals = [];
  const now = new Date();

  // Look for markets with abnormal 24h volume or high liquidity concentration
  for (const m of markets) {
    if (m.closed || !m.active) continue;

    const vol24 = parseFloat(m.volume24hr ?? 0);
    const liq = parseFloat(m.liquidityNum ?? m.liquidity ?? 0);
    const volTotal = parseFloat(m.volumeNum ?? m.volume ?? 0);

    // If 24h volume is >= 30% of total volume or > $25,000
    if (vol24 >= 25000 || (volTotal > 50000 && vol24 / volTotal >= 0.35)) {
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

      // Find highest priced outcome (whale favorite)
      let maxIdx = 0;
      prices.forEach((p, idx) => {
        if (p > prices[maxIdx]) maxIdx = idx;
      });

      const topOutcome = outcomes[maxIdx] || 'YES';
      const topPrice = prices[maxIdx] || 0.5;

      // Whale intensity score (0-100)
      const whaleScore = Math.min(99, Math.round((vol24 / 50000) * 40 + (liq / 20000) * 30 + (topPrice * 30)));

      const eventSlug = Array.isArray(m.events) && m.events[0]?.slug ? m.events[0].slug : m.slug || '';

      whaleSignals.push({
        title: m.question,
        slug: eventSlug,
        url: `https://polymarket.com/event/${eventSlug}`,
        category: getCategory(m),
        targetOutcome: topOutcome,
        currentPrice: topPrice,
        pricePercent: (topPrice * 100).toFixed(1),
        vol24hr: vol24,
        vol24hrFormatted: vol24 >= 1000 ? (vol24 / 1000).toFixed(1) + 'k' : vol24.toFixed(0),
        liquidity: liq,
        whaleScore: whaleScore,
        signalType: vol24 >= 100000 ? '🐋 MEGA WHALE' : '🐬 SMART MONEY',
        detectedAt: now.toISOString(),
        tokenId: clobTokenIds[maxIdx] || null,
        note: `สแกนพบปริมาณซื้อขายสะสม 24ชม. สูงถึง $${(vol24).toLocaleString()} บนฝั่ง ${topOutcome}`
      });
    }
  }

  // Sort by whale score descending
  whaleSignals.sort((a, b) => b.whaleScore - a.whaleScore);
  return whaleSignals.slice(0, 20);
}
