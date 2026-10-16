// ══════════════════════════════════════════════════════════════════════
//  negrisk_arbitrage.js — Hardened Negative Risk Implied Sum Arbitrage Engine
//  Milestone M2: negRisk Validation, Live CLOB Pricing, Dynamic Fees & 10% Kelly Cap
// ══════════════════════════════════════════════════════════════════════

import { getCategory } from './scanner.js';
import { calculateDynamicFee, getFeeRate } from './engine/dynamic_fees.js';
import { clobStreamerInstance } from './engine/clob_streamer.js';

export const KELLY_CEILING_PERCENT = 10.0; // Institutional 10% ceiling
export const MIN_NET_EDGE_USD = 0.005;     // Minimum $0.005 (0.5%) net profit floor

/**
 * Scan markets for negative risk implied sum arbitrage opportunities.
 * @param {Array} markets - Raw Polymarket market objects
 * @param {Object} options - Optional configuration { orderbookLookup, clobStreamer, bankroll }
 * @returns {Array} Sorted verified arbitrage opportunities
 */
export function scanNegRiskOpps(markets = [], options = {}) {
  const results = [];
  const eventGroups = {};

  const orderbookLookup = options.orderbookLookup 
    || ((tokenID) => (options.clobStreamer || clobStreamerInstance)?.orderbooks?.get(tokenID));

  // 1. Filter and group strictly by contract-level NegRisk ID
  for (const m of markets) {
    if (m.closed || !m.active) continue;

    // Enforce contract-level negRisk validation
    const isNegRisk = m.negRisk === true || 
      m.negRisk === 'true' || 
      (Array.isArray(m.events) && (
        m.events[0]?.negRisk === true || 
        m.events[0]?.enableNegRisk === true || 
        String(m.events[0]?.negRisk).toLowerCase() === 'true'
      ));

    if (!isNegRisk) continue;

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

    // Group by negRiskMarketID (CTF adapter pool ID)
    const negRiskMarketID = m.negRiskMarketID 
      || (Array.isArray(m.events) && m.events[0]?.negRiskMarketID) 
      || (Array.isArray(m.events) && m.events[0]?.id)
      || m.question;

    const eventTitle = (Array.isArray(m.events) && m.events[0]?.title) 
      || m.groupItemTitle 
      || m.question;

    const eventSlug = Array.isArray(m.events) && m.events[0]?.slug ? m.events[0].slug : m.slug || '';
    const liq = parseFloat(m.liquidityNum ?? m.liquidity ?? 0);
    const vol24 = parseFloat(m.volume24hr ?? 0);
    const category = getCategory(m);

    if (!eventGroups[negRiskMarketID]) {
      eventGroups[negRiskMarketID] = {
        negRiskMarketID,
        title: eventTitle,
        slug: eventSlug,
        category,
        outcomesList: [],
        totalLiquidity: 0,
        totalVolume: 0
      };
    }

    const yesIdx = outcomes.findIndex(o => String(o).toLowerCase() === 'yes');
    if (yesIdx === -1) continue;

    const tokenID = clobTokenIds[yesIdx] || null;
    const midPrice = prices[yesIdx];

    // Determine executable Best Ask and Best Bid
    let bestAsk = null;
    let bestBid = null;
    let pricingSource = 'midpoint_fallback';

    // A. Live CLOB Orderbook lookup
    if (tokenID && orderbookLookup) {
      try {
        const liveBook = orderbookLookup(tokenID);
        if (liveBook && typeof liveBook.bestAsk === 'number' && liveBook.bestAsk > 0) {
          bestAsk = liveBook.bestAsk;
          bestBid = typeof liveBook.bestBid === 'number' && liveBook.bestBid > 0 ? liveBook.bestBid : null;
          pricingSource = 'clob_live';
        }
      } catch (err) {
        // Fall back gracefully
      }
    }

    // B. Market-level bestAsk / bestBid
    if (bestAsk === null) {
      if (Array.isArray(m.bestAsks) && typeof m.bestAsks[yesIdx] === 'number' && m.bestAsks[yesIdx] > 0) {
        bestAsk = m.bestAsks[yesIdx];
        bestBid = Array.isArray(m.bestBids) && typeof m.bestBids[yesIdx] === 'number' ? m.bestBids[yesIdx] : null;
        pricingSource = 'market_best_ask';
      } else if (yesIdx === 0 && typeof m.bestAsk === 'number' && m.bestAsk > 0) {
        bestAsk = m.bestAsk;
        bestBid = typeof m.bestBid === 'number' && m.bestBid > 0 ? m.bestBid : null;
        pricingSource = 'market_best_ask';
      }
    }

    // C. Fallback to midpoint if no book ask
    const executableAsk = bestAsk ?? midPrice;
    const executableBid = bestBid ?? midPrice;

    if (executableAsk <= 0 || executableAsk >= 1.0) continue;

    // Calculate leg dynamic taker fee
    const legFee = calculateDynamicFee(1, executableAsk, category);

    eventGroups[negRiskMarketID].outcomesList.push({
      marketQuestion: m.question,
      outcomeName: m.groupItemTitle || m.question.replace('Will ', '').replace('?', ''),
      yesPrice: executableAsk, // Backward compatibility
      bestAsk: executableAsk,
      bestBid: executableBid,
      midpoint: midPrice,
      feePerShare: legFee,
      pricingSource,
      tokenID,
      url: `https://polymarket.com/event/${eventSlug}`
    });

    eventGroups[negRiskMarketID].totalLiquidity += liq;
    eventGroups[negRiskMarketID].totalVolume += vol24;
  }

  // 2. Evaluate Arbitrage Opportunities with Fee Deductions and 10% Kelly Cap
  for (const grpId in eventGroups) {
    const grp = eventGroups[grpId];
    const list = grp.outcomesList;

    if (list.length < 2) continue;

    const sumAsk = list.reduce((acc, item) => acc + item.bestAsk, 0);
    const sumBid = list.reduce((acc, item) => acc + (item.bestBid || 0), 0);
    const totalAskFees = list.reduce((acc, item) => acc + calculateDynamicFee(1, item.bestAsk, grp.category), 0);
    const totalBidFees = list.reduce((acc, item) => acc + calculateDynamicFee(1, item.bestBid || 0, grp.category), 0);

    const netCost = sumAsk + totalAskFees;
    const underpricedNetProfitUsd = 1.00 - netCost;

    // Case 1: Underpriced Sum (Net Cost < $1.00)
    if (netCost > 0.10 && underpricedNetProfitUsd >= MIN_NET_EDGE_USD) {
      const netProfitPercent = (underpricedNetProfitUsd / netCost) * 100;
      const grossProfitUsd = 1.00 - sumAsk;
      const grossProfitPercent = sumAsk > 0 ? (grossProfitUsd / sumAsk) * 100 : 0;

      // Kelly calculation with operational safety probability p = 0.98
      const b = underpricedNetProfitUsd / netCost;
      const p = 0.98;
      const rawKelly = b > 0 ? ((b * p - (1 - p)) / b) * 100 : 0;
      const kellyPositionPercent = Math.min(KELLY_CEILING_PERCENT, Math.max(0, parseFloat(rawKelly.toFixed(2))));

      results.push({
        type: 'negrisk_underpriced',
        title: grp.title,
        strategy: 'Risk-Free Buy All YES',
        outcomeCount: list.length,
        sumYesPrice: parseFloat(sumAsk.toFixed(3)),
        grossCost: parseFloat(sumAsk.toFixed(4)),
        totalFeesUsd: parseFloat(totalAskFees.toFixed(4)),
        netCost: parseFloat(netCost.toFixed(4)),
        guaranteedPayout: 1.00,
        grossProfitUsd: parseFloat(grossProfitUsd.toFixed(4)),
        grossProfitPercent: parseFloat(grossProfitPercent.toFixed(2)),
        profitUsd: parseFloat(underpricedNetProfitUsd.toFixed(3)),
        profitPercent: parseFloat(netProfitPercent.toFixed(1)),
        kellyPositionPercent,
        confidence: grp.outcomesList.every(o => o.pricingSource !== 'midpoint_fallback') ? 99 : 85,
        outcomes: list,
        url: `https://polymarket.com/event/${grp.slug}`,
        category: grp.category,
        feeRate: getFeeRate(grp.category),
        negRiskMarketID: grp.negRiskMarketID,
        negRiskValidated: true,
        totalLiquidity: Math.round(grp.totalLiquidity),
        totalVolume: Math.round(grp.totalVolume),
        detectedAt: new Date().toISOString()
      });
    }

    // Case 2: Overpriced Sum (Convert/Merge Arbitrage)
    const netBidRevenue = sumBid - totalBidFees;
    const overpricedNetProfitUsd = netBidRevenue - 1.00;

    if (list.every(o => (o.bestBid || 0) > 0) && overpricedNetProfitUsd >= MIN_NET_EDGE_USD) {
      const netProfitPercent = (overpricedNetProfitUsd / 1.00) * 100;
      const grossProfitUsd = sumBid - 1.00;
      const grossProfitPercent = (grossProfitUsd / 1.00) * 100;

      const b = overpricedNetProfitUsd / 1.00;
      const p = 0.98;
      const rawKelly = b > 0 ? ((b * p - (1 - p)) / b) * 100 : 0;
      const kellyPositionPercent = Math.min(KELLY_CEILING_PERCENT, Math.max(0, parseFloat(rawKelly.toFixed(2))));

      results.push({
        type: 'negrisk_overpriced',
        title: grp.title,
        strategy: 'NegRisk Adapter Convert / Merge',
        outcomeCount: list.length,
        sumYesPrice: parseFloat(sumBid.toFixed(3)),
        grossRevenue: parseFloat(sumBid.toFixed(4)),
        totalFeesUsd: parseFloat(totalBidFees.toFixed(4)),
        netRevenue: parseFloat(netBidRevenue.toFixed(4)),
        mintCost: 1.00,
        guaranteedPayout: 1.00,
        grossProfitUsd: parseFloat(grossProfitUsd.toFixed(4)),
        grossProfitPercent: parseFloat(grossProfitPercent.toFixed(2)),
        profitUsd: parseFloat(overpricedNetProfitUsd.toFixed(3)),
        profitPercent: parseFloat(netProfitPercent.toFixed(1)),
        kellyPositionPercent,
        confidence: grp.outcomesList.every(o => o.pricingSource !== 'midpoint_fallback') ? 98 : 80,
        outcomes: list,
        url: `https://polymarket.com/event/${grp.slug}`,
        category: grp.category,
        feeRate: getFeeRate(grp.category),
        negRiskMarketID: grp.negRiskMarketID,
        negRiskValidated: true,
        totalLiquidity: Math.round(grp.totalLiquidity),
        totalVolume: Math.round(grp.totalVolume),
        detectedAt: new Date().toISOString()
      });
    }
  }

  return results.sort((a, b) => b.profitPercent - a.profitPercent);
}
