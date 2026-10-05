// ══════════════════════════════════════════════════════════════════════
//  engine/market_matcher.js — Cross-Exchange Event Matching Engine
// ══════════════════════════════════════════════════════════════════════

/**
 * Tokenize and normalize text for similarity comparison
 */
function cleanTokens(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2 && !['will', 'the', 'and', 'for', 'that', 'with'].includes(t));
}

/**
 * Calculate Jaccard and Cosine word overlap similarity
 */
function calculateSimilarity(strA, strB) {
  const setA = new Set(cleanTokens(strA));
  const setB = new Set(cleanTokens(strB));
  if (setA.size === 0 || setB.size === 0) return 0;

  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  
  const jaccard = intersection.size / union.size;
  return parseFloat(jaccard.toFixed(4));
}

/**
 * Match Polymarket markets with Kalshi markets
 * @param {Array} polyMarkets - Polymarket standardized markets
 * @param {Array} kalshiMarkets - Kalshi standardized markets
 * @returns {Array} matchedPairs - Verified matched event pairs
 */
export function matchCrossExchangeMarkets(polyMarkets = [], kalshiMarkets = []) {
  const matchedPairs = [];

  for (const pm of polyMarkets) {
    if (pm.closed || !pm.active) continue;

    let polyPrices = [];
    try {
      polyPrices = typeof pm.outcomePrices === 'string' ? JSON.parse(pm.outcomePrices) : pm.outcomePrices || [];
      polyPrices = polyPrices.map(Number);
    } catch (e) {
      continue;
    }
    if (!polyPrices.length) continue;

    const polyYesPrice = polyPrices[0] || 0.5;
    const polyNoPrice = polyPrices[1] || (1 - polyYesPrice);
    const polyQuestion = pm.question || '';

    for (const km of kalshiMarkets) {
      const similarity = calculateSimilarity(polyQuestion, km.title);

      // Check if keyword overlap is high enough (>= 0.35 on clean tokens indicates same event topic)
      if (similarity >= 0.30 || (polyQuestion.toLowerCase().includes('fed') && km.title.toLowerCase().includes('fed')) ||
          (polyQuestion.toLowerCase().includes('bitcoin') && km.title.toLowerCase().includes('bitcoin'))) {
        
        matchedPairs.push({
          pairId: `pair_${pm.id || pm.slug || 'poly'}_${km.platformMarketId}`,
          topic: km.title,
          similarityScore: similarity,
          polymarket: {
            id: pm.id || pm.slug,
            question: polyQuestion,
            yesPrice: polyYesPrice,
            noPrice: polyNoPrice,
            liquidity: parseFloat(pm.liquidityNum ?? pm.liquidity ?? 0),
            volume24h: parseFloat(pm.volume24hr ?? 0),
            url: `https://polymarket.com/event/${pm.slug || ''}`,
            tokenID: Array.isArray(pm.clobTokenIds) ? pm.clobTokenIds[0] : null
          },
          kalshi: {
            ticker: km.platformMarketId,
            title: km.title,
            yesPrice: km.yesPrice,
            noPrice: km.noPrice,
            liquidity: km.liquidity,
            volume24h: km.volume24h,
            url: km.url,
            resolutionSource: km.resolutionSource
          },
          matchedAt: new Date().toISOString()
        });
      }
    }
  }

  return matchedPairs;
}
