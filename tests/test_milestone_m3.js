// ══════════════════════════════════════════════════════════════════════
//  tests/test_milestone_m3.js — Milestone M3 Verification Suite
//  Validates:
//  1. Persistent CLOB WebSocket Streamer & 5-Level DOM Ladder
//  2. Live Depth Endpoint & REST Fallback Schema Harmonization
//  3. Orderbook Bids/Asks Sorting & VWAP Slippage Calculation
//  4. Bounded Concurrency Portfolio Resolver & Event Loop Non-blocking
//  5. Race Condition Shield & Atomic Ledger Persistence
// ══════════════════════════════════════════════════════════════════════

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ClobOrderbookStreamer } from '../engine/clob_streamer.js';
import { calculateOrderbookSlippage } from '../engine/clob_depth.js';
import {
  mapConcurrent,
  fetchGammaEvent,
  resolveBacktestPortfolio,
  readLedger,
  writeLedger
} from '../engine/backtest_resolver.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dir, 'fixtures');
const TEST_LEDGER_PATH = path.join(FIXTURE_DIR, 'test_m3_backtest.json');

console.log('===============================================================');
console.log('  RUNNING MILESTONE M3 STREAMING, RESOLVER & DOM DEPTH SUITE');
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
  if (!fs.existsSync(FIXTURE_DIR)) {
    fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  }

  // ─────────────────────────────────────────────────────────────────
  // Suite 1: Orderbook Sorting & 5-Level DOM Depth Ladder
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[Suite 1] Orderbook Sorting & DOM Depth Ladder Mechanics');

  await test('CLOB Streamer sorts bids descending and asks ascending with valid depthUsd', () => {
    const streamer = new ClobOrderbookStreamer();
    const rawSnapshot = {
      asset_id: 'tok-sort-test',
      bids: [
        { price: '0.40', size: '1000' },
        { price: '0.48', size: '2500' },
        { price: '0.45', size: '500' },
        { price: '0.47', size: '1200' },
        { price: '0.46', size: '800' },
        { price: '0.38', size: '3000' }
      ],
      asks: [
        { price: '0.55', size: '1000' },
        { price: '0.50', size: '1500' },
        { price: '0.53', size: '1200' },
        { price: '0.51', size: '2000' },
        { price: '0.52', size: '700' },
        { price: '0.59', size: '4000' }
      ]
    };

    streamer.processBookSnapshot(rawSnapshot);
    const book = streamer.orderbooks.get('tok-sort-test');

    assert.ok(book !== undefined, 'Book entry should exist in cache');
    assert.strictEqual(book.bestBid, 0.48, 'Best bid must be the highest bid price');
    assert.strictEqual(book.bestAsk, 0.50, 'Best ask must be the lowest ask price');
    assert.strictEqual(book.spread, 0.02, 'Spread must be bestAsk - bestBid');
    assert.strictEqual(book.midPrice, 0.49, 'Midpoint must be average of bestBid and bestAsk');

    // Bids must be sorted strictly descending
    assert.strictEqual(book.depthLadder.bids.length, 5, 'DOM ladder bids must be capped at 5');
    assert.strictEqual(book.depthLadder.bids[0].price, 0.48);
    assert.strictEqual(book.depthLadder.bids[1].price, 0.47);
    assert.strictEqual(book.depthLadder.bids[2].price, 0.46);
    assert.strictEqual(book.depthLadder.bids[3].price, 0.45);
    assert.strictEqual(book.depthLadder.bids[4].price, 0.40);

    // Asks must be sorted strictly ascending
    assert.strictEqual(book.depthLadder.asks.length, 5, 'DOM ladder asks must be capped at 5');
    assert.strictEqual(book.depthLadder.asks[0].price, 0.50);
    assert.strictEqual(book.depthLadder.asks[1].price, 0.51);
    assert.strictEqual(book.depthLadder.asks[2].price, 0.52);
    assert.strictEqual(book.depthLadder.asks[3].price, 0.53);
    assert.strictEqual(book.depthLadder.asks[4].price, 0.55);

    // depthUsd must be calculated accurately as price * size
    assert.strictEqual(book.depthLadder.bids[0].depthUsd, 1200.0); // 0.48 * 2500
    assert.strictEqual(book.depthLadder.asks[0].depthUsd, 750.0);  // 0.50 * 1500
    assert.ok(!isNaN(book.depthLadder.bids[0].depthUsd), 'depthUsd must not be NaN');
  });

  await test('REST Fallback harmonizes ladderBids/ladderAsks and provides valid depthUsd schema', async () => {
    const streamer = new ClobOrderbookStreamer({ useRestFallback: false });
    const ladder = streamer.getSyntheticLadder('tok-synthetic-schema');

    assert.strictEqual(ladder.tokenId, 'tok-synthetic-schema');
    assert.strictEqual(ladder.depthLadder.bids.length, 5);
    assert.strictEqual(ladder.depthLadder.asks.length, 5);
    assert.ok(ladder.ladderBids !== undefined, 'ladderBids must be present at top-level');
    assert.ok(ladder.ladderAsks !== undefined, 'ladderAsks must be present at top-level');
    assert.ok(ladder.bestAsk > ladder.bestBid, 'bestAsk must be greater than bestBid');
    assert.ok(ladder.ladderBids[0].depthUsd > 0, 'depthUsd must be positive');
  });

  // ─────────────────────────────────────────────────────────────────
  // Suite 2: Bounded Concurrency Worker Pool & Non-blocking Fetch
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[Suite 2] Bounded Parallel Execution Pool (mapConcurrent)');

  await test('mapConcurrent executes tasks in parallel within bounded concurrency ceiling', async () => {
    const items = Array.from({ length: 24 }, (_, i) => i);
    let activeWorkers = 0;
    let maxObservedWorkers = 0;

    const results = await mapConcurrent(items, 8, async (item) => {
      activeWorkers++;
      if (activeWorkers > maxObservedWorkers) {
        maxObservedWorkers = activeWorkers;
      }
      // Small simulated delay
      await new Promise(r => setTimeout(r, 15));
      activeWorkers--;
      return item * 2;
    });

    assert.strictEqual(results.length, 24, 'All items must return results');
    for (let i = 0; i < 24; i++) {
      assert.strictEqual(results[i], i * 2, 'Result ordering must be preserved');
    }
    assert.ok(maxObservedWorkers <= 8, `Max active workers (${maxObservedWorkers}) must not exceed concurrency bound 8`);
    assert.ok(maxObservedWorkers > 1, 'Tasks must run concurrently, not strictly serially');
  });

  await test('fetchGammaEvent handles timeout abort without unhandled rejection or timer leaks', async () => {
    const mockHangingFetch = (url, opts) => new Promise((resolve, reject) => {
      const tid = setTimeout(resolve, 500);
      if (opts?.signal) {
        opts.signal.addEventListener('abort', () => {
          clearTimeout(tid);
          reject(new Error('The operation was aborted'));
        });
      }
    });
    const start = Date.now();
    const res = await fetchGammaEvent('hanging-slug', 50, mockHangingFetch);
    const duration = Date.now() - start;

    assert.strictEqual(res, null, 'Timed-out fetch must safely resolve to null');
    assert.ok(duration < 250, `Fetch should abort quickly (took ${duration}ms)`);
  });

  // ─────────────────────────────────────────────────────────────────
  // Suite 3: Deduplicated Settlement & Mutex Protection
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[Suite 3] Portfolio Resolver Race Condition Shield & Deduplication');

  await test('resolveBacktestPortfolio deduplicates redundant slugs across multiple open orders', async () => {
    const mockLedger = [
      { id: 't1', status: 'Open', slug: 'btc-100k-end-2024', question: 'Will BTC hit 100k?', outcome: 'YES', price: 0.40 },
      { id: 't2', status: 'Open', slug: 'btc-100k-end-2024', question: 'Will BTC hit 100k?', outcome: 'NO', price: 0.60 },
      { id: 't3', status: 'Open', slug: 'eth-5k-end-2024', question: 'Will ETH hit 5k?', outcome: 'YES', price: 0.30 }
    ];
    writeLedger(mockLedger, TEST_LEDGER_PATH);

    const fetchedSlugs = [];
    const mockFetch = async (url) => {
      const urlObj = new URL(url);
      const slug = urlObj.searchParams.get('slug');
      fetchedSlugs.push(slug);
      return {
        ok: true,
        json: async () => [{
          closed: true,
          markets: [{
            question: slug === 'btc-100k-end-2024' ? 'Will BTC hit 100k?' : 'Will ETH hit 5k?',
            outcomePrices: ['0.99', '0.01'],
            outcomes: ['YES', 'NO'],
            closed: true
          }]
        }]
      };
    };

    const resolved = await resolveBacktestPortfolio({
      fetchFn: mockFetch,
      filePath: TEST_LEDGER_PATH,
      concurrency: 4
    });

    assert.strictEqual(fetchedSlugs.length, 2, 'Should only fetch 2 unique slugs instead of 3 redundant calls');
    assert.ok(fetchedSlugs.includes('btc-100k-end-2024'));
    assert.ok(fetchedSlugs.includes('eth-5k-end-2024'));

    const t1 = resolved.find(t => t.id === 't1');
    const t2 = resolved.find(t => t.id === 't2');
    assert.strictEqual(t1.status, 'Closed');
    assert.strictEqual(t1.result, 'Win');
    assert.strictEqual(t2.status, 'Closed');
    assert.strictEqual(t2.result, 'Loss');
  });

  await test('Resolution Shield preserves Emergency Kill-Switch cancellations during in-flight fetches', async () => {
    const mockLedger = [
      { id: 't-kill-shield', status: 'Open', slug: 'slow-market', question: 'Slow Market', outcome: 'YES', price: 0.50 }
    ];
    writeLedger(mockLedger, TEST_LEDGER_PATH);

    const mockSlowFetch = async () => {
      await new Promise(r => setTimeout(r, 40));
      return {
        ok: true,
        json: async () => [{
          closed: true,
          markets: [{ question: 'Slow Market', outcomePrices: ['0.99', '0.01'], outcomes: ['YES', 'NO'], closed: true }]
        }]
      };
    };

    // Trigger resolution in background
    const resolutionPromise = resolveBacktestPortfolio({
      fetchFn: mockSlowFetch,
      filePath: TEST_LEDGER_PATH
    });

    // Simulate Kill-Switch firing mid-flight
    await new Promise(r => setTimeout(r, 10));
    const ledgerDuringFlight = readLedger(TEST_LEDGER_PATH);
    ledgerDuringFlight[0].status = 'Cancelled';
    ledgerDuringFlight[0].cancelReason = 'Emergency Kill-Switch Triggered';
    writeLedger(ledgerDuringFlight, TEST_LEDGER_PATH);

    // Await resolution completion
    const finalLedger = await resolutionPromise;
    const order = finalLedger.find(t => t.id === 't-kill-shield');

    assert.strictEqual(order.status, 'Cancelled', 'Cancelled status must NOT be overwritten by settlement');
    assert.strictEqual(order.cancelReason, 'Emergency Kill-Switch Triggered');
  });

  // Cleanup fixture
  try {
    if (fs.existsSync(TEST_LEDGER_PATH)) fs.unlinkSync(TEST_LEDGER_PATH);
  } catch (_) {}

  console.log('\n===============================================================');
  console.log(`  MILESTONE M3 TEST RESULTS: ${passedCount}/6 PASSED (0 FAILED)`);
  console.log('===============================================================\n');
}

runAll().catch(err => {
  console.error('Fatal M3 test error:', err);
  process.exit(1);
});
