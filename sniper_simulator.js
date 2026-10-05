// ══════════════════════════════════════════════════════════════════════
//  sniper_simulator.js — Polymarket High-Speed Sniper Simulator (Dry-Run)
//  Run with: node sniper_simulator.js
// ══════════════════════════════════════════════════════════════════════

import { runScan, CONFIG } from './scanner.js';

const WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

console.log('\n\x1b[35m%s\x1b[0m', '  ⚡ POLYMARKET SNIPER SIMULATOR (DRY-RUN MODE) ⚡  ');
console.log('======================================================');
console.log(`Target Probability Range: ${CONFIG.MIN_PRICE * 100}% - ${CONFIG.MAX_PRICE * 100}%`);
console.log('Connecting to Polymarket Scanner to fetch active tokens...\n');

async function start() {
  // 1. Fetch active targets using our existing scanner logic
  let scanResult;
  try {
    scanResult = await runScan((n) => {
      process.stdout.write(`\rFetching active markets: loaded ${n}...`);
    });
    console.log('\n');
  } catch (err) {
    console.error('\x1b[31mError running scanner:\x1b[0m', err.message);
    return;
  }

  // Filter opportunities with valid tokenIDs
  const candidates = (scanResult.opportunities || []).filter(o => o.tokenID);
  
  if (candidates.length === 0) {
    console.log('\x1b[33mNo active opportunities found matching target probability range.\x1b[0m');
    console.log('Try loosening the CONFIG thresholds in scanner.js if you want more targets.');
    return;
  }

  console.log(`\x1b[32mFound ${candidates.length} active opportunities to monitor via WebSockets.\x1b[0m`);
  
  // Keep a map for quick lookup
  const tokenMap = {};
  const tokenIds = [];

  candidates.slice(0, 10).forEach((c, idx) => {
    tokenMap[c.tokenID] = c;
    tokenIds.push(c.tokenID);
    console.log(`[Target #${idx+1}] ${c.question.slice(0, 50)}...`);
    console.log(`  Outcome: "${c.outcome}" | Scanner Price: ${(c.price * 100).toFixed(0)}% | TokenID: ${c.tokenID}\n`);
  });

  if (candidates.length > 10) {
    console.log(`... and ${candidates.length - 10} more markets (monitoring top 10 for terminal clarity)`);
  }

  // 2. Connect to Polymarket CLOB WebSocket
  console.log(`Connecting to public CLOB WS: ${WS_URL}...`);
  const ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('\x1b[32m[WS Connected] Subscribing to L2 book feeds...\x1b[0m\n');
    
    // Subscribe payload for CLOB V2 WS subscriptions
    const subscribeMsg = {
      type: 'market',
      assets_ids: tokenIds,
      custom_feature_enabled: true
    };
    ws.send(JSON.stringify(subscribeMsg));
    console.log(`Sent subscription for ${tokenIds.length} assets...`);
    console.log('Listening for live orderbook updates...\n');
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      // Look for book updates or top bid/ask updates (CLOB V2 uses asset_id)
      const assetId = data.asset_id || data.token_id;
      const eventType = data.event_type || data.event;
      
      if (assetId && (eventType === 'book' || eventType === 'best_bid_ask' || data.asks)) {
        const opp = tokenMap[assetId];
        if (!opp) return;

        const asks = data.asks || (data.best_ask ? [{price: data.best_ask}] : []);
        const bids = data.bids || (data.best_bid ? [{price: data.best_bid}] : []);

        const bestAsk = asks.length > 0 ? parseFloat(asks[0].price || asks[0]) : null;
        const bestBid = bids.length > 0 ? parseFloat(bids[0].price || bids[0]) : null;

        if (bestAsk !== null) {
          const timestamp = new Date();
          const latencyMs = Date.now() - (data.timestamp ? parseInt(data.timestamp) * 1000 : Date.now());
          
          console.log(`\x1b[36m[WS Update]\x1b[0m ${opp.question.slice(0, 35)}... | "${opp.outcome}"`);
          console.log(`  Best Bid: $${bestBid ? bestBid.toFixed(2) : 'N/A'} | Best Ask: $${bestAsk.toFixed(2)} (Latency: ${latencyMs >= 0 ? latencyMs + 'ms' : '<1ms'})`);

          // Sniping condition: If the best ask (market sell order) drops below our target buy threshold
          // Let's simulate if it drops below the scanner probability by at least 1 cent (indicating a temporary drop/sale)
          const targetPrice = opp.price;
          const triggerPrice = targetPrice - 0.01;

          if (bestAsk <= triggerPrice) {
            console.log('\n\x1b[41m\x1b[37m%s\x1b[0m', ' 🎯 SIMULATED TRIGGER: OPPRORTUNITY SNIPED! ');
            console.log(`  Question:  ${opp.question}`);
            console.log(`  Outcome:   ${opp.outcome}`);
            console.log(`  Trigger:   Best Ask ($${bestAsk.toFixed(2)}) <= Snipe Target ($${triggerPrice.toFixed(2)})`);
            console.log(`  Size:      $100.00 USD`);
            console.log(`  Est. Fill: ${(bestAsk * 100).toFixed(0)}%`);
            console.log(`  Latency:   ${latencyMs}ms (Websocket-to-Decision path)`);
            console.log(`  Time:      ${timestamp.toLocaleTimeString()}`);
            console.log('======================================================\n');
          }
        }
      }
    } catch (err) {
      // Quiet fail for malformed or ping/pong messages
    }
  };

  ws.onerror = (err) => {
    console.error('\x1b[31m[WS Error]\x1b[0m', err.message);
  };

  ws.onclose = () => {
    console.log('\n\x1b[33m[WS Closed] Connection closed. Restarting in 5 seconds...\x1b[0m');
    setTimeout(start, 5000);
  };
}

start().catch(console.error);
