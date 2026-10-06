// ══════════════════════════════════════════════════════════════════════
//  engine/manifold_matcher.js — Zero-Key Public Manifold Markets Arbitrage
// ══════════════════════════════════════════════════════════════════════

import { getCategory } from '../scanner.js';

const MANIFOLD_API = 'https://api.manifold.markets/v0';

/**
 * Fetch top active binary markets from Manifold Markets (100% Free Public API)
 */
export async function fetchManifoldMarkets() {
  const allMarkets = [];
  try {
    const urls = [
      `${MANIFOLD_API}/markets?limit=100&sort=last-bet-time`,
      `${MANIFOLD_API}/markets?limit=100&sort=newest`
    ];

    for (const url of urls) {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(tid);
        if (res.ok) {
          const list = await res.json();
          if (Array.isArray(list)) {
            for (const m of list) {
              if (m.outcomeType === 'BINARY' && typeof m.probability === 'number') {
                allMarkets.push({
                  id: m.id,
                  question: m.question,
                  probability: m.probability,
                  probPercent: (m.probability * 100).toFixed(1),
                  volume24h: m.volume24Hours || 0,
                  totalVolume: m.volume || 0,
                  url: m.url || `https://manifold.markets/${m.creatorUsername}/${m.slug}`
                });
              }
            }
          }
        }
      } catch (err) {
        clearTimeout(tid);
      }
    }
  } catch (e) {
    console.warn('[Manifold Client] Failed to fetch:', e.message);
  }

  // Deduplicate by id
  const seen = new Set();
  const deduped = [];
  for (const m of allMarkets) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      deduped.push(m);
    }
  }
  return deduped;
}

/**
 * Extract clean keywords from question string
 */
function extractKeywords(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !['will', 'the', 'and', 'for', 'with', 'that', 'this', 'before', 'after', 'reach', 'have', 'been', 'what', 'when', 'who', 'does'].includes(w));
}

/**
 * Compare Polymarket vs Manifold markets to find price divergence & crowd consensus edges
 */
export async function scanManifoldCrossEdges(polyMarkets = []) {
  const manifoldMarkets = await fetchManifoldMarkets();
  if (!manifoldMarkets.length || !polyMarkets.length) return [];

  const crossEdges = [];

  for (const poly of polyMarkets) {
    if (poly.closed || !poly.active) continue;

    let polyPrices = [];
    try {
      polyPrices = typeof poly.outcomePrices === 'string' ? JSON.parse(poly.outcomePrices) : poly.outcomePrices || [];
    } catch (e) { continue; }
    if (!polyPrices.length) continue;

    const polyYesPrice = Number(polyPrices[0]);
    if (isNaN(polyYesPrice) || polyYesPrice <= 0.01 || polyYesPrice >= 0.99) continue;

    const polyKeywords = new Set(extractKeywords(poly.question));
    if (polyKeywords.size < 2) continue;

    for (const mani of manifoldMarkets) {
      const maniKeywords = extractKeywords(mani.question);
      let matchCount = 0;
      for (const kw of maniKeywords) {
        if (polyKeywords.has(kw)) matchCount++;
      }

      const totalUnique = new Set([...polyKeywords, ...maniKeywords]).size;
      const jaccard = matchCount / totalUnique;

      // Match threshold: > 0.40 word overlap
      if (jaccard >= 0.40) {
        const divergence = polyYesPrice - mani.probability;
        const absDivergence = Math.abs(divergence);

        // Flag significant probability divergence (> 8 percentage points)
        if (absDivergence >= 0.08) {
          const polySlug = Array.isArray(poly.events) && poly.events[0]?.slug ? poly.events[0].slug : poly.slug || '';
          const category = getCategory(poly);

          // Calculate Days to Resolution for capital-lockup awareness
          const polyEndDate = poly.endDate || poly.end_date_iso || (poly.events && poly.events[0]?.endDate);
          let daysToResolve = 30; // default estimate
          if (polyEndDate) {
            const diffMs = new Date(polyEndDate).getTime() - Date.now();
            if (diffMs > 0) {
              daysToResolve = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
            }
          }

          // Calculate raw ROI and Annualized ROI (Capital Lockup)
          const rawRoi = absDivergence / Math.min(polyYesPrice, 1 - polyYesPrice);
          const annualizedReturn = (Math.pow(1 + rawRoi, 365 / daysToResolve) - 1) * 100;
          const cappedAnnualized = Math.min(9999, Math.round(annualizedReturn));

          // Basis risk evaluation (e.g. resolution criteria or date mismatch)
          const basisRiskNotice = 'Basis Risk: Verify resolution source (Polymarket UMA vs Manifold Community Admin)';

          crossEdges.push({
            type: 'cross_exchange_divergence',
            topic: poly.question,
            similarityScore: parseFloat(jaccard.toFixed(2)),
            polymarket: {
              question: poly.question,
              yesPrice: parseFloat(polyYesPrice.toFixed(3)),
              probPercent: (polyYesPrice * 100).toFixed(1),
              liquidity: parseFloat(poly.liquidityNum ?? poly.liquidity ?? 0),
              endDate: polyEndDate || null,
              url: `https://polymarket.com/event/${polySlug}`
            },
            manifold: {
              question: mani.question,
              prob: parseFloat(mani.probability.toFixed(3)),
              probPercent: mani.probPercent,
              url: mani.url
            },
            divergence: parseFloat((divergence * 100).toFixed(1)),
            absDivergence: parseFloat((absDivergence * 100).toFixed(1)),
            daysToResolve: daysToResolve,
            annualizedRoiPercent: cappedAnnualized,
            basisRiskNotice: basisRiskNotice,
            edgeSide: divergence > 0 ? 'Polymarket Premium (Crowd expects lower)' : 'Polymarket Discount (Crowd expects higher)',
            confidence: Math.min(95, Math.round(jaccard * 100 + absDivergence * 50)),
            category: category,
            detectedAt: new Date().toISOString()
          });
        }
      }
    }
  }

  // Sort by largest divergence descending
  return crossEdges.sort((a, b) => b.absDivergence - a.absDivergence).slice(0, 15);
}
