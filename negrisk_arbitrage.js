// ══════════════════════════════════════════════════════════════════════
//  negrisk_arbitrage.js — Negative Risk Implied Sum Arbitrage Engine
// ══════════════════════════════════════════════════════════════════════

import { getCategory } from './scanner.js';

export function scanNegRiskOpps(markets) {
  const results = [];
  const now = new Date();

  // Group markets by groupItemTitle or event title to analyze mutually exclusive outcome sets
  const eventGroups = {};

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

    const eventTitle = (Array.isArray(m.events) && m.events[0]?.title) 
      || m.groupItemTitle 
      || m.question;

    const eventSlug = Array.isArray(m.events) && m.events[0]?.slug ? m.events[0].slug : m.slug || '';
    const liq = parseFloat(m.liquidityNum ?? m.liquidity ?? 0);
    const vol24 = parseFloat(m.volume24hr ?? 0);

    if (!eventGroups[eventTitle]) {
      eventGroups[eventTitle] = {
        title: eventTitle,
        slug: eventSlug,
        category: getCategory(m),
        outcomesList: [],
        totalLiquidity: 0,
        totalVolume: 0
      };
    }

    // Add YES outcome price to group
    const yesIdx = outcomes.findIndex(o => String(o).toLowerCase() === 'yes');
    if (yesIdx !== -1 && prices[yesIdx] > 0) {
      eventGroups[eventTitle].outcomesList.push({
        marketQuestion: m.question,
        outcomeName: m.groupItemTitle || m.question.replace('Will ', '').replace('?', ''),
        yesPrice: prices[yesIdx],
        tokenID: clobTokenIds[yesIdx] || null,
        url: `https://polymarket.com/event/${eventSlug}`
      });
      eventGroups[eventTitle].totalLiquidity += liq;
      eventGroups[eventTitle].totalVolume += vol24;
    }
  }

  // Analyze each event group for NegRisk Implied Sum Arbitrage
  for (const title in eventGroups) {
    const grp = eventGroups[title];
    const list = grp.outcomesList;

    // Need at least 3 mutually exclusive outcomes to form a meaningful NegRisk market
    if (list.length < 3) continue;

    const sumYes = list.reduce((acc, item) => acc + item.yesPrice, 0);

    // Arbitrage Case 1: Underpriced Sum (sumYes < $0.97)
    // Risk-free Buy Arbitrage: Buying 1 share of YES on every option costs sumYes < $1.00
    // Guaranteed payout at resolution = $1.00!
    if (sumYes > 0.40 && sumYes <= 0.97) {
      const riskFreeProfitUsd = 1.00 - sumYes;
      const profitPercent = (riskFreeProfitUsd / sumYes) * 100;

      results.push({
        type: 'negrisk_underpriced',
        title: grp.title,
        strategy: 'Risk-Free Buy All YES',
        outcomeCount: list.length,
        sumYesPrice: parseFloat(sumYes.toFixed(3)),
        guaranteedPayout: 1.00,
        profitUsd: parseFloat(riskFreeProfitUsd.toFixed(3)),
        profitPercent: parseFloat(profitPercent.toFixed(1)),
        kellyPositionPercent: 100, // Risk-free so full kelly
        confidence: 99, // Extremely high confidence for risk-free arb
        outcomes: list,
        url: `https://polymarket.com/event/${grp.slug}`,
        category: grp.category,
        totalLiquidity: Math.round(grp.totalLiquidity),
        totalVolume: Math.round(grp.totalVolume),
        detectedAt: new Date().toISOString()
      });
    }

    // Arbitrage Case 2: Overpriced Sum (sumYes > 1.03)
    // Conversion Arbitrage: Can convert NO shares into YES or merge overpriced outcomes
    else if (sumYes >= 1.03 && sumYes <= 1.50) {
      const spreadUsd = sumYes - 1.00;
      const profitPercent = (spreadUsd / 1.00) * 100;

      results.push({
        type: 'negrisk_overpriced',
        title: grp.title,
        strategy: 'NegRisk Adapter Convert / Merge',
        outcomeCount: list.length,
        sumYesPrice: parseFloat(sumYes.toFixed(3)),
        guaranteedPayout: 1.00,
        profitUsd: parseFloat(spreadUsd.toFixed(3)),
        profitPercent: parseFloat(profitPercent.toFixed(1)),
        kellyPositionPercent: 100, // Risk-free so full kelly
        confidence: 99,
        outcomes: list,
        url: `https://polymarket.com/event/${grp.slug}`,
        category: grp.category,
        totalLiquidity: Math.round(grp.totalLiquidity),
        totalVolume: Math.round(grp.totalVolume),
        detectedAt: new Date().toISOString()
      });
    }
  }

  // Sort by highest profit percentage
  return results.sort((a, b) => b.profitPercent - a.profitPercent);
}
