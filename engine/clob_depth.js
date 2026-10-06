// ══════════════════════════════════════════════════════════════════════
//  engine/clob_depth.js — Live Polymarket CLOB Depth & Slippage Engine
// ══════════════════════════════════════════════════════════════════════

const CLOB_ENDPOINT = 'https://clob.polymarket.com/book';

/**
 * Fetch live orderbook and simulate real slippage for a given trade size
 * @param {string} tokenId - Polymarket CLOB outcome token ID
 * @param {number} targetUsd - Order size in USD to simulate
 */
export async function calculateOrderbookSlippage(tokenId, targetUsd = 100) {
  if (!tokenId) {
    return { error: 'Missing token ID' };
  }

  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${CLOB_ENDPOINT}?token_id=${tokenId}`, { signal: ctrl.signal });
    clearTimeout(tid);

    if (!res.ok) {
      return { error: `CLOB API responded with status ${res.status}` };
    }

    const book = await res.json();
    const bids = book.bids || [];
    const asks = book.asks || [];

    const bestBid = bids.length ? parseFloat(bids[0].price) : 0;
    const bestAsk = asks.length ? parseFloat(asks[0].price) : 1;
    const spread = bestAsk > 0 ? parseFloat((bestAsk - bestBid).toFixed(4)) : 0;
    const spreadPct = bestAsk > 0 ? parseFloat(((spread / bestAsk) * 100).toFixed(2)) : 0;
    const midpoint = parseFloat(((bestBid + bestAsk) / 2).toFixed(4));

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
      effectiveCent: (vwap * 100).toFixed(1),
      slippagePercent: slippagePct,
      maxSafeFillUsd: Math.round(maxSafeFillUsd),
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
