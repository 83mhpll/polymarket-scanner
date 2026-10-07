// ══════════════════════════════════════════════════════════════════════
//  tests/test_clob_streamer.js — Milestone M3 CLOB Streamer Test Suite
//  Validates L2 Book Parsing, 5-Level Depth Ladder & Fallback Mechanics
// ══════════════════════════════════════════════════════════════════════

import assert from 'assert';
import { ClobOrderbookStreamer } from '../engine/clob_streamer.js';

console.log('===============================================================');
console.log('  RUNNING MILESTONE M3 CLOB STREAMER TEST SUITE');
console.log('===============================================================');

let passedCount = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${e.message}`);
    process.exit(1);
  }
}

async function runAll() {
  console.log('\n[Suite 1] L2 Book Parsing & 5-Level Depth Ladder');
  await test('ClobOrderbookStreamer parses snapshot and sorts bids descending and asks ascending', () => {
    const streamer = new ClobOrderbookStreamer();
    const mockSnapshot = {
      asset_id: 'token-abc-123',
      bids: [
        { price: '0.45', size: '1000' },
        { price: '0.48', size: '2000' },
        { price: '0.42', size: '500' },
        { price: '0.47', size: '1500' },
        { price: '0.46', size: '1200' },
        { price: '0.40', size: '3000' }
      ],
      asks: [
        { price: '0.55', size: '1000' },
        { price: '0.51', size: '800' },
        { price: '0.53', size: '1200' },
        { price: '0.52', size: '900' },
        { price: '0.54', size: '1500' },
        { price: '0.60', size: '5000' }
      ]
    };

    streamer.processBookSnapshot(mockSnapshot);

    const book = streamer.orderbooks.get('token-abc-123');
    assert.ok(book !== undefined);
    assert.strictEqual(book.bestBid, 0.48);
    assert.strictEqual(book.bestAsk, 0.51);
    assert.strictEqual(book.spread, 0.03);
    assert.strictEqual(book.midPrice, 0.495);

    assert.strictEqual(book.depthLadder.bids.length, 5);
    assert.strictEqual(book.depthLadder.asks.length, 5);

    assert.strictEqual(book.depthLadder.bids[0].price, 0.48);
    assert.strictEqual(book.depthLadder.bids[1].price, 0.47);
    assert.strictEqual(book.depthLadder.bids[4].price, 0.42);

    assert.strictEqual(book.depthLadder.asks[0].price, 0.51);
    assert.strictEqual(book.depthLadder.asks[1].price, 0.52);
    assert.strictEqual(book.depthLadder.asks[4].price, 0.55);
  });

  await test('Subscription management registers tokens cleanly', () => {
    const streamer = new ClobOrderbookStreamer({ tokens: ['tok-1', 'tok-2'] });
    assert.strictEqual(streamer.subscribedTokens.size, 2);

    streamer.addTokenSubscription('tok-3');
    assert.strictEqual(streamer.subscribedTokens.size, 3);
    assert.ok(streamer.subscribedTokens.has('tok-3'));
  });

  console.log('\n[Suite 2] Fallback Mechanics & Synthetic L2 DOM Ladder');

  await test('getSyntheticLadder returns valid 5-level DOM structure', () => {
    const streamer = new ClobOrderbookStreamer();
    const ladder = streamer.getSyntheticLadder('fallback-token-456');

    assert.strictEqual(ladder.tokenId, 'fallback-token-456');
    assert.strictEqual(ladder.depthLadder.bids.length, 5);
    assert.strictEqual(ladder.depthLadder.asks.length, 5);
    assert.ok(ladder.bestAsk > ladder.bestBid);
    assert.strictEqual(ladder.source, 'SYNTHETIC_DEFAULT');
  });

  await test('getLiveDepth retrieves from memory cache or falls back seamlessly', async () => {
    const streamer = new ClobOrderbookStreamer({ useRestFallback: false });
    const depth = await streamer.getLiveDepth('unseen-token-789');

    assert.ok(depth !== null);
    assert.strictEqual(depth.tokenId, 'unseen-token-789');
    assert.strictEqual(depth.depthLadder.bids.length, 5);
  });

  console.log('===============================================================');
  console.log(`  CLOB STREAMER TESTS PASSED: ${passedCount}/${passedCount}`);
  console.log('===============================================================');
}

runAll();
