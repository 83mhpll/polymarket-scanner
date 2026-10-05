// ══════════════════════════════════════════════════════════════════════
//  engine/net_arbitrage.js — Net Executable Arbitrage Engine
// ══════════════════════════════════════════════════════════════════════

const POLYMARKET_TAKER_FEE = 0.000; // Polymarket 0% fee on standard orders (or builder rebate)
const KALSHI_TAKER_FEE = 0.010;     // Kalshi ~1.0% effective taker fee
const POLYGON_GAS_COST_USD = 0.03;  // Average Polygon execution gas in USD

/**
 * Calculate the true Net Executable Edge between matched cross-exchange markets
 * @param {Array} matchedPairs - Pairs matched by market_matcher.js
 * @returns {Array} arbitrageOpportunities - Verified executable arbitrage deals
 */
export function calculateNetArbitrage(matchedPairs = []) {
  const opportunities = [];

  for (const pair of matchedPairs) {
    const poly = pair.polymarket;
    const kalshi = pair.kalshi;

    // Strategy A: Buy YES on Polymarket + Buy NO on Kalshi
    // Cost A = poly.yesPrice + kalshi.noPrice
    const costA = poly.yesPrice + kalshi.noPrice;
    const grossEdgeA = (1.00 - costA);

    // Strategy B: Buy YES on Kalshi + Buy NO on Polymarket
    // Cost B = kalshi.yesPrice + poly.noPrice
    const costB = kalshi.yesPrice + poly.noPrice;
    const grossEdgeB = (1.00 - costB);

    let bestStrategy = null;

    if (grossEdgeA > 0.01 && grossEdgeA >= grossEdgeB) {
      const takerFees = (poly.yesPrice * POLYMARKET_TAKER_FEE) + (kalshi.noPrice * KALSHI_TAKER_FEE);
      const estSlippage = (costA < 0.90) ? 0.005 : 0.012; // 0.5% - 1.2% slippage model based on depth
      const netEdge = grossEdgeA - takerFees - estSlippage - (POLYGON_GAS_COST_USD / 500); // normalized on $500 size
      const netRoiPercent = (netEdge / costA) * 100;

      bestStrategy = {
        strategyType: 'BUY_POLY_YES_KALSHI_NO',
        leg1: { platform: 'Polymarket', action: 'BUY YES', price: poly.yesPrice, url: poly.url, tokenID: poly.tokenID },
        leg2: { platform: 'Kalshi', action: 'BUY NO', price: kalshi.noPrice, url: kalshi.url, ticker: kalshi.ticker },
        combinedCost: parseFloat(costA.toFixed(4)),
        grossEdge: parseFloat(grossEdgeA.toFixed(4)),
        takerFees: parseFloat(takerFees.toFixed(4)),
        estimatedSlippage: parseFloat(estSlippage.toFixed(4)),
        gasCostUsd: POLYGON_GAS_COST_USD,
        netEdge: parseFloat(netEdge.toFixed(4)),
        netRoiPercent: parseFloat(netRoiPercent.toFixed(2))
      };
    } else if (grossEdgeB > 0.01) {
      const takerFees = (kalshi.yesPrice * KALSHI_TAKER_FEE) + (poly.noPrice * POLYMARKET_TAKER_FEE);
      const estSlippage = (costB < 0.90) ? 0.005 : 0.012;
      const netEdge = grossEdgeB - takerFees - estSlippage - (POLYGON_GAS_COST_USD / 500);
      const netRoiPercent = (netEdge / costB) * 100;

      bestStrategy = {
        strategyType: 'BUY_KALSHI_YES_POLY_NO',
        leg1: { platform: 'Kalshi', action: 'BUY YES', price: kalshi.yesPrice, url: kalshi.url, ticker: kalshi.ticker },
        leg2: { platform: 'Polymarket', action: 'BUY NO', price: poly.noPrice, url: poly.url, tokenID: poly.tokenID },
        combinedCost: parseFloat(costB.toFixed(4)),
        grossEdge: parseFloat(grossEdgeB.toFixed(4)),
        takerFees: parseFloat(takerFees.toFixed(4)),
        estimatedSlippage: parseFloat(estSlippage.toFixed(4)),
        gasCostUsd: POLYGON_GAS_COST_USD,
        netEdge: parseFloat(netEdge.toFixed(4)),
        netRoiPercent: parseFloat(netRoiPercent.toFixed(2))
      };
    }

    if (bestStrategy && bestStrategy.netEdge > 0.005) { // Filter out negligible edges <= 0.5%
      const minLiquidity = Math.min(poly.liquidity, kalshi.liquidity);
      const liquidityScore = Math.min(99, Math.round((minLiquidity / 20000) * 100));
      const executionScore = Math.min(98, Math.round(90 + (bestStrategy.netRoiPercent * 1.5)));

      opportunities.push({
        opportunityId: `arb_${pair.pairId}`,
        marketTopic: pair.topic,
        polymarketQuestion: poly.question,
        kalshiTitle: kalshi.title,
        strategy: bestStrategy,
        liquidityUsd: minLiquidity,
        liquidityScore: liquidityScore,
        executionScore: executionScore,
        confidence: Math.round(pair.similarityScore * 100),
        classification: bestStrategy.netRoiPercent >= 3.0 ? 'HIGH CONVICTION' : 'MODERATE EDGE',
        isExecutable: true,
        reasoning: `พบส่วนต่างราคาข้ามตลาด Net Edge +${bestStrategy.netRoiPercent}% หลังหัก Taker Fees, Slippage และ Gas Fee จริง`,
        detectedAt: new Date().toISOString()
      });
    }
  }

  // Sort by highest Net ROI descending
  opportunities.sort((a, b) => b.strategy.netRoiPercent - a.strategy.netRoiPercent);
  return opportunities;
}
