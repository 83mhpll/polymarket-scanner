// ══════════════════════════════════════════════════════════════════════
//  engine/clob_depth.js — Live Polymarket CLOB Depth & Slippage Engine
// ══════════════════════════════════════════════════════════════════════

const CLOB_ENDPOINT = 'https://clob.polymarket.com/book';
const FEE_ENDPOINT = 'https://clob.polymarket.com/fee-rate';

/**
 * Fetch live dynamic fee rate for a specific Polymarket token
 * Polymarket fee is NOT zero for all markets (some categories have dynamic taker fee)
 */
export async function fetchTokenFeeRate(tokenId) {
  if (!tokenId) return { feeRateBps: 0, feeRatePercent: 0 };
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${FEE_ENDPOINT}?token_id=${tokenId}`, { signal: ctrl.signal });
    clearTimeout(tid);
    if (res.ok) {
      const data = await res.json();
      // fee_rate in basis points (e.g. 10 bps = 0.1%, or decimal)
      const rawRate = data.fee_rate ?? data.feeRate ?? data.rate ?? 0;
      const bps = parseFloat(rawRate);
      return {
        feeRateBps: bps,
        feeRatePercent: parseFloat((bps / 100).toFixed(3)),
        raw: data
      };
    }
  } catch (e) {
    // Fallback if fee endpoint times out
  }
  return { feeRateBps: 0, feeRatePercent: 0 };
}

/**
 * Fetch live orderbook and simulate institutional execution with dynamic fees & slippage
 * @param {string} tokenId - Polymarket CLOB outcome token ID
 * @param {number} targetUsd - Order size in USD to simulate
 */
export async function calculateOrderbookSlippage(tokenId, targetUsd = 100) {
  if (!tokenId) {
    return { error: 'Missing token ID' };
  }

  try {
    const [bookRes, feeInfo] = await Promise.all([
      (async () => {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 6000);
        const res = await fetch(`${CLOB_ENDPOINT}?token_id=${tokenId}`, { signal: ctrl.signal });
        clearTimeout(tid);
        return res.ok ? await res.json() : null;
      })(),
      fetchTokenFeeRate(tokenId)
    ]);

    if (!bookRes) {
      return { error: 'CLOB API orderbook unavailable' };
    }

    const bids = bookRes.bids || [];
    const asks = bookRes.asks || [];

    const bestBid = bids.length ? parseFloat(bids[0].price) : 0;
    const bestAsk = asks.length ? parseFloat(asks[0].price) : 1;
    const spread = bestAsk > 0 ? parseFloat((bestAsk - bestBid).toFixed(4)) : 0;
    const spreadPct = bestAsk > 0 ? parseFloat(((spread / bestAsk) * 100).toFixed(2)) : 0;
    const midpoint = parseFloat(((bestBid + bestAsk) / 2).toFixed(4));

    // Construct 5-level Depth Ladder (DOM)
    const ladderAsks = asks.slice(0, 5).map(l => ({
      price: parseFloat(l.price),
      size: parseFloat(l.size),
      depthUsd: parseFloat((parseFloat(l.price) * parseFloat(l.size)).toFixed(2))
    }));
    const ladderBids = bids.slice(0, 5).map(l => ({
      price: parseFloat(l.price),
      size: parseFloat(l.size),
      depthUsd: parseFloat((parseFloat(l.price) * parseFloat(l.size)).toFixed(2))
    }));

    // Simulate BUY order across asks ladder
    let remainingUsd = targetUsd;
    let totalSharesFilled = 0;
    let totalSpentUsd = 0;

    for (const level of asks) {
      if (remainingUsd <= 0) break;
      const price = parseFloat(level.price);
      const sharesAvailable = parseFloat(level.size);
      const levelCost = sharesAvailable * price;

      if (remainingUsd >= levelCost) {
        totalSharesFilled += sharesAvailable;
        totalSpentUsd += levelCost;
        remainingUsd -= levelCost;
      } else {
        const partialShares = remainingUsd / price;
        totalSharesFilled += partialShares;
        totalSpentUsd += remainingUsd;
        remainingUsd = 0;
      }
    }

    const isFullyFilled = remainingUsd <= 0;
    const vwap = totalSharesFilled > 0 ? parseFloat((totalSpentUsd / totalSharesFilled).toFixed(4)) : bestAsk;
    const slippagePct = bestAsk > 0 ? parseFloat((((vwap - bestAsk) / bestAsk) * 100).toFixed(2)) : 0;

    // Calculate Dynamic Fee (Polymarket formula: fee = shares * price * feeRate * (p*(1-p))^exponent)
    // Here feeRatePercent is applied dynamically
    const feeRateDec = feeInfo.feeRatePercent / 100;
    const estimatedFeeUsd = parseFloat((totalSpentUsd * feeRateDec).toFixed(4));
    const netVwap = totalSharesFilled > 0 ? parseFloat(((totalSpentUsd + estimatedFeeUsd) / totalSharesFilled).toFixed(4)) : vwap;
    const breakEvenProb = netVwap; // In binary $1 payout, break-even probability equals cost per share

    // Calculate maximum safe fill size before slippage exceeds 1.5%
    let maxSafeFillUsd = 0;
    for (const level of asks) {
      const price = parseFloat(level.price);
      const levelSlip = ((price - bestAsk) / bestAsk) * 100;
      if (levelSlip <= 1.5) {
        maxSafeFillUsd += parseFloat(level.size) * price;
      } else {
        break;
      }
    }

    return {
      success: true,
      tokenId: tokenId,
      bestBid: bestBid,
      bestAsk: bestAsk,
      midpoint: midpoint,
      spreadUsd: spread,
      spreadPercent: spreadPct,
      simulatedOrderUsd: targetUsd,
      isFullyFilled: isFullyFilled,
      sharesAcquired: parseFloat(totalSharesFilled.toFixed(2)),
      effectiveAvgPrice: vwap,
      netVwapWithFee: netVwap,
      breakEvenProb: breakEvenProb,
      breakEvenPercent: (breakEvenProb * 100).toFixed(2),
      estimatedFeeUsd: estimatedFeeUsd,
      feeRateBps: feeInfo.feeRateBps,
      feeRatePercent: feeInfo.feeRatePercent,
      effectiveCent: (netVwap * 100).toFixed(1),
      slippagePercent: slippagePct,
      maxSafeFillUsd: Math.round(maxSafeFillUsd),
      ladderAsks: ladderAsks,
      ladderBids: ladderBids,
      bidsDepthCount: bids.length,
      asksDepthCount: asks.length,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to fetch orderbook: ${err.message}`,
      fallback: true
    };
  }
}
