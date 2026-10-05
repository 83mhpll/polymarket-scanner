// ══════════════════════════════════════════════════════════════════════
//  dust_sniper_1c.js — 1¢ Dust & Mispriced Share Sweeper Engine
// ══════════════════════════════════════════════════════════════════════

import { getCategory } from './scanner.js';

export function scan1cOpps(markets) {
  const results = [];
  const now = new Date();

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

    prices.forEach((price, idx) => {
      // Look for 1c to 3c shares ($0.01 to $0.03)
      if (price >= 0.01 && price <= 0.03) {
        // Calculate implied probability of sibling outcomes
        let siblingMaxPrice = 0;
        prices.forEach((p, i) => {
          if (i !== idx && p > siblingMaxPrice) siblingMaxPrice = p;
        });

        // Est Win Prob: If a sibling outcome is near 0 or if the market resolution is active
        const category = getCategory(m);
        
        let baseWinRate = 0.05;
        if (category === 'Sports') baseWinRate = 0.15;
        else if (category === 'Crypto') baseWinRate = 0.20;
        else if (category === 'Politics') baseWinRate = 0.25;

        // Est Win Prob: If a sibling outcome is near 0 or if the market resolution is active
        // EV = (WinProb * $1.00) - AskPrice
        // For 1c share ($0.01), if WinProb is even 5% (0.05), EV = 0.05 - 0.01 = +0.04 (+400% ROI)
        const estWinProb = Math.max(baseWinRate, 1 - siblingMaxPrice); 
        const ev = (estWinProb * 1.0) - price;
        const expectedRoi = ((1.0 - price) / price) * 100; // ROI if payout is $1.00 (e.g. 1c -> $1 = 9900%)

        // Kelly Criterion Calculator: f* = (bp - q) / b
        // b = odds = (Payout / Price) - 1
        const b = (1.0 / price) - 1;
        const p = estWinProb;
        const q = 1 - p;
        let kelly = b > 0 ? (b * p - q) / b : 0;
        kelly = Math.max(0, kelly); // No negative position

        // Confidence based on liquidity and volume
        let confidence = 50;
        if (liq > 1000) confidence += 20;
        if (vol24 > 500) confidence += 15;
        if (estWinProb > 0.3) confidence += 15;
        confidence = Math.min(100, Math.max(0, confidence));

        results.push({
          type: '1c_dust',
          question: m.question,
          outcome: outcomes[idx] ?? `Outcome ${idx}`,
          price: price,
          payout: 1.0,
          expectedRoi: Math.round(expectedRoi),
          ev: parseFloat(ev.toFixed(3)),
          kellyPositionPercent: parseFloat((kelly * 100).toFixed(2)),
          confidence: confidence,
          tokenID: clobTokenIds[idx] || null,
          url: `https://polymarket.com/event/${eventSlug}`,
          category: category,
          liquidity: liq,
          vol24hr: vol24,
          hoursLeft: Math.max(0, Math.round(hoursLeft)),
          detectedAt: new Date().toISOString()
        });
      }
    });
  }

  // Sort by highest ROI / EV
  return results.sort((a, b) => b.ev - a.ev);
}
