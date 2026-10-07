/**
 * tests/test_stress_m1_concurrency.js
 * 
 * Empirical Adversarial Stress & Concurrency Test Suite for Milestone M1
 * Author: challenger_m1_2_v2 (Empirical Challenger)
 * 
 * Rigorously stress-tests:
 * 1. Pre-trade risk halt: verify paper bot executePaperOrder refuses to execute
 *    any trade when riskManager.isKilled is true or when pre-trade limits are breached.
 * 2. Concurrency race conditions: trigger Kill-Switch while paper bot is in middle
 *    of execution cycle. Verify that cancelled orders in backtest.json are NOT
 *    resurrected or overwritten by stale trade writes.
 * 3. Atomic file writes: verify repeated concurrent writes to backtest.json
 *    do not corrupt JSON or produce empty reads.
 * 4. Kill-Switch latency under heavy ledger load (< 1000ms SLA).
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AutonomousPaperBot,
  calculateKellyPositionSize,
  simulatePassiveFill,
  readLedger,
  writeLedger
} from '../engine/paper_bot.js';

import {
  InstitutionalRiskManager
} from '../engine/risk_manager.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const BACKTEST_FILE = path.join(__dir, '..', 'backtest.json');

// Backup original backtest.json
const ORIGINAL_LEDGER_BACKUP = fs.readFileSync(BACKTEST_FILE, 'utf-8');

let totalPassed = 0;
let totalFailed = 0;
const testFailures = [];

function pass(name) {
  totalPassed++;
  console.log(`  ✓ ${name}`);
}

function fail(name, err) {
  totalFailed++;
  testFailures.push({ name, error: err.message, stack: err.stack });
  console.error(`  ✗ ${name}`);
  console.error(`    ${err.message}`);
}

async function runTest(name, fn) {
  try {
    await fn();
    pass(name);
  } catch (err) {
    fail(name, err);
  }
}

function restoreLedger() {
  fs.writeFileSync(BACKTEST_FILE, ORIGINAL_LEDGER_BACKUP, 'utf-8');
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  MILESTONE M1 EMPIRICAL ADVERSARIAL & CONCURRENCY STRESS SUITE');
console.log('═══════════════════════════════════════════════════════════════\n');

try {
  // ───────────────────────────────────────────────────────────────────────────
  // SUITE 1: PRE-TRADE RISK HALT GUARDS & PARAMETER ENFORCEMENT
  // ───────────────────────────────────────────────────────────────────────────
  console.log('[SUITE 1] Pre-Trade Risk Halt Guards & Institutional Limits');

  await runTest('Pre-Trade: executePaperOrder refuses trade when riskManager.isKilled === true', async () => {
    const rm = new InstitutionalRiskManager();
    rm.isKilled = true;
    const bot = new AutonomousPaperBot({ bankroll: 10000, riskManager: rm });

    let rejectedEvent = null;
    bot.subscribe((event, data) => {
      if (event === 'trade_rejected') rejectedEvent = data;
    });

    const evaluated = {
      slug: 'killed-state-trade',
      question: 'Should be blocked by active kill switch',
      outcome: 'YES',
      marketPrice: 0.50,
      fairProb: 0.75,
      modelSource: 'NWP Model',
      sizing: { sizeUsd: 100, netEdge: 12.0, kellyFractional: 0.1 }
    };

    const initialLedger = readLedger();
    const result = await bot.executePaperOrder(evaluated);

    assert.strictEqual(result, null, 'executePaperOrder must return null when killed');
    assert.ok(rejectedEvent !== null, 'trade_rejected event must be emitted');
    assert.ok(
      rejectedEvent.reason.includes('Hard Kill-Switch'),
      `Expected reason to mention Hard Kill-Switch, got: ${rejectedEvent.reason}`
    );
    assert.strictEqual(bot.stats.tradesExecuted, 0);

    const postLedger = readLedger();
    assert.strictEqual(postLedger.length, initialLedger.length, 'Ledger size must not change');
    assert.ok(!postLedger.some(t => t.slug === 'killed-state-trade'));
  });

  await runTest('Pre-Trade: Gross exposure breach blocks trade and preserves disk ledger', async () => {
    const rm = new InstitutionalRiskManager({ maxGrossExposurePct: 20.0 }); // 20% limit = $2,000 max
    const bot = new AutonomousPaperBot({ bankroll: 10000, riskManager: rm });

    // Seed disk with $1,800 open exposure (18%)
    const seed = [
      { id: 'seed-gross-1', slug: 'mkt-1', size: 1000, status: 'Open', timestamp: new Date().toISOString() },
      { id: 'seed-gross-2', slug: 'mkt-2', size: 800, status: 'Open', timestamp: new Date().toISOString() }
    ];
    writeLedger(seed);

    let rejectionData = null;
    bot.subscribe((event, data) => {
      if (event === 'trade_rejected') rejectionData = data;
    });

    // Attempt $300 trade -> $2,100 total = 21% > 20% limit -> MUST BE REJECTED
    const evalBreach = {
      slug: 'breach-gross-order',
      question: 'Breach Gross Exposure Market',
      outcome: 'YES',
      marketPrice: 0.50,
      fairProb: 0.70,
      sizing: { sizeUsd: 300, netEdge: 10.0, kellyFractional: 0.1 }
    };

    const breachResult = await bot.executePaperOrder(evalBreach);
    assert.strictEqual(breachResult, null);
    assert.ok(rejectionData !== null);
    assert.ok(rejectionData.reason.includes('gross exposure'));

    // Verify disk ledger has only the 2 seeded orders
    const onDiskAfterBreach = readLedger();
    assert.strictEqual(onDiskAfterBreach.length, 2);
    assert.ok(!onDiskAfterBreach.some(t => t.slug === 'breach-gross-order'));

    // Attempt $150 trade -> $1,950 total = 19.5% <= 20% limit -> MUST BE ACCEPTED
    const evalAllowed = {
      slug: 'allowed-gross-order',
      question: 'Allowed Gross Exposure Market',
      outcome: 'YES',
      marketPrice: 0.50,
      fairProb: 0.70,
      sizing: { sizeUsd: 150, netEdge: 10.0, kellyFractional: 0.05 }
    };

    const allowedResult = await bot.executePaperOrder(evalAllowed);
    assert.ok(allowedResult !== null);
    assert.strictEqual(allowedResult.slug, 'allowed-gross-order');
    assert.strictEqual(allowedResult.status, 'Open');

    const onDiskAfterAllowed = readLedger();
    assert.strictEqual(onDiskAfterAllowed.length, 3);
    assert.ok(onDiskAfterAllowed.some(t => t.slug === 'allowed-gross-order'));
  });

  await runTest('Pre-Trade: Target-market concentration isolation blocks overloaded market but permits others', async () => {
    const rm = new InstitutionalRiskManager({
      maxSinglePositionPct: 5.0, // 5% = $500 max per market
      maxGrossExposurePct: 60.0
    });
    const bot = new AutonomousPaperBot({ bankroll: 10000, riskManager: rm });

    // Seed disk with $450 in 'market-tech' (4.5%)
    const seed = [
      { id: 'seed-tech-1', slug: 'market-tech', size: 450, status: 'Open', timestamp: new Date().toISOString() }
    ];
    writeLedger(seed);

    // Trade of $100 in 'market-tech' -> $550 = 5.5% > 5% -> REJECTED
    const evalTech = {
      slug: 'market-tech',
      question: 'Tech Market Further Allocation',
      outcome: 'YES',
      marketPrice: 0.45,
      fairProb: 0.70,
      sizing: { sizeUsd: 100, netEdge: 15.0, kellyFractional: 0.05 }
    };
    const techRes = await bot.executePaperOrder(evalTech);
    assert.strictEqual(techRes, null, 'Must reject trade that breaches single market ceiling');

    // Trade of $100 in 'market-bio' (0% prior allocation) -> $100 = 1.0% <= 5% -> ALLOWED
    const evalBio = {
      slug: 'market-bio',
      question: 'Biotech Market Allocation',
      outcome: 'YES',
      marketPrice: 0.45,
      fairProb: 0.70,
      sizing: { sizeUsd: 100, netEdge: 15.0, kellyFractional: 0.05 }
    };
    const bioRes = await bot.executePaperOrder(evalBio);
    assert.ok(bioRes !== null, 'Must allow trade in unallocated market-bio');
    assert.strictEqual(bioRes.slug, 'market-bio');

    const onDisk = readLedger();
    assert.ok(onDisk.some(t => t.slug === 'market-bio'));
    assert.strictEqual(onDisk.filter(t => t.slug === 'market-tech').length, 1);
  });

  await runTest('Pre-Trade: Hourly trade limit throttles excessive frequency', async () => {
    const rm = new InstitutionalRiskManager({ maxHourlyTrades: 3 });
    const bot = new AutonomousPaperBot({ bankroll: 10000, riskManager: rm });
    writeLedger([]);

    for (let i = 1; i <= 3; i++) {
      const trade = await bot.executePaperOrder({
        slug: `freq-trade-${i}`,
        question: `Frequency trade #${i}`,
        outcome: 'YES',
        marketPrice: 0.50,
        fairProb: 0.65,
        sizing: { sizeUsd: 10, netEdge: 5.0, kellyFractional: 0.01 }
      });
      assert.ok(trade !== null, `Trade ${i} should have passed`);
    }

    // 4th trade within the hour must be blocked
    let hourlyRejection = null;
    bot.subscribe((ev, data) => {
      if (ev === 'trade_rejected') hourlyRejection = data;
    });

    const fourth = await bot.executePaperOrder({
      slug: 'freq-trade-4',
      question: 'Frequency trade #4',
      outcome: 'YES',
      marketPrice: 0.50,
      fairProb: 0.65,
      sizing: { sizeUsd: 10, netEdge: 5.0, kellyFractional: 0.01 }
    });
    assert.strictEqual(fourth, null, '4th trade must be throttled');
    assert.ok(hourlyRejection !== null);
    assert.ok(hourlyRejection.reason.includes('Hourly trade limit reached'));
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SUITE 2: CONCURRENCY RACE CONDITIONS & KILL-SWITCH INTERLEAVING
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n[SUITE 2] Concurrency Race Conditions & Kill-Switch Interleaving');

  await runTest('Concurrency: Mid-cycle Kill-Switch trigger cancels orders and prevents resurrection', async () => {
    const rm = new InstitutionalRiskManager();
    const bot = new AutonomousPaperBot({ enabled: true, bankroll: 10000, riskManager: rm });

    // 1. Seed 5 open orders in backtest.json
    const initialOrders = [
      { id: 'active-1', slug: 'm1', size: 100, status: 'Open', timestamp: '2026-10-07T00:00:00.000Z' },
      { id: 'active-2', slug: 'm2', size: 100, status: 'Open', timestamp: '2026-10-07T00:01:00.000Z' },
      { id: 'active-3', slug: 'm3', size: 100, status: 'Open', timestamp: '2026-10-07T00:02:00.000Z' },
      { id: 'active-4', slug: 'm4', size: 100, status: 'Open', timestamp: '2026-10-07T00:03:00.000Z' },
      { id: 'active-5', slug: 'm5', size: 100, status: 'Open', timestamp: '2026-10-07T00:04:00.000Z' }
    ];
    writeLedger(initialOrders);

    // 2. Prepare 6 candidate markets for bot.runCycle()
    // Inject asynchronous delay into evaluateMarket to simulate real workload
    const originalEvaluateMarket = bot.evaluateMarket.bind(bot);
    let evalCount = 0;
    bot.evaluateMarket = async function(market) {
      evalCount++;
      await new Promise(r => setTimeout(r, 20)); // 20ms async yield per evaluation
      return originalEvaluateMarket(market);
    };

    const candidateMarkets = [
      { slug: 'cand-1', question: 'Candidate Market 1', price: 0.40, opposingPrice: 0.45 },
      { slug: 'cand-2', question: 'Candidate Market 2', price: 0.40, opposingPrice: 0.45 },
      { slug: 'cand-3', question: 'Candidate Market 3', price: 0.40, opposingPrice: 0.45 },
      { slug: 'cand-4', question: 'Candidate Market 4', price: 0.40, opposingPrice: 0.45 },
      { slug: 'cand-5', question: 'Candidate Market 5', price: 0.40, opposingPrice: 0.45 },
      { slug: 'cand-6', question: 'Candidate Market 6', price: 0.40, opposingPrice: 0.45 }
    ];

    // 3. Launch runCycle asynchronously
    const cyclePromise = bot.runCycle(candidateMarkets);

    // 4. Concurrently fire the Kill-Switch while runCycle is in-flight (after 30ms)
    await new Promise(r => setTimeout(r, 30));
    const killResult = rm.triggerKillSwitch('Adversarial Mid-Cycle Emergency Interruption');
    assert.strictEqual(killResult.success, true);
    assert.strictEqual(rm.isKilled, true);

    // 5. Await cycle completion
    await cyclePromise;

    // 6. Inspect on-disk ledger
    const finalDisk = readLedger();

    // Verification 1: All 5 initial orders MUST be 'Cancelled'
    for (const initId of ['active-1', 'active-2', 'active-3', 'active-4', 'active-5']) {
      const order = finalDisk.find(o => o.id === initId);
      assert.ok(order !== undefined, `Order ${initId} must exist on disk`);
      assert.strictEqual(
        order.status,
        'Cancelled',
        `Order ${initId} was resurrected to '${order.status}'! Must remain 'Cancelled'.`
      );
      assert.ok(
        order.cancelReason.includes('Adversarial Mid-Cycle'),
        `Cancel reason not preserved on ${initId}: ${order.cancelReason}`
      );
    }

    // Verification 2: Bot must NOT have executed markets after Kill-Switch triggered
    // Markets 4, 5, 6 should never have executed
    assert.ok(!finalDisk.some(o => o.slug === 'cand-5' || o.slug === 'cand-6'));

    // Verification 3: Total 'Open' orders on disk must be exactly 0
    const openOrders = finalDisk.filter(o => o.status === 'Open');
    assert.strictEqual(
      openOrders.length,
      0,
      `Found ${openOrders.length} open orders remaining after Kill-Switch! None allowed.`
    );
  });

  await runTest('Concurrency: Stale in-memory ledger array passed to executePaperOrder is neutralized by disk re-read', async () => {
    const rm = new InstitutionalRiskManager();
    const bot = new AutonomousPaperBot({ minNetEdgePct: 0.1, riskManager: rm });

    // Seed disk with a cancelled order
    const cancelledId = 'stale-test-cancelled-99';
    const cancelledRecord = {
      id: cancelledId,
      slug: 'stale-test-slug',
      status: 'Cancelled',
      size: 50,
      cancelledAt: new Date().toISOString(),
      cancelReason: 'Emergency Kill-Switch'
    };
    writeLedger([cancelledRecord]);

    // Create a stale in-memory array that still claims the order is 'Open'
    const staleInMemoryArray = [
      { ...cancelledRecord, status: 'Open' }
    ];

    // Execute a new trade while passing the stale in-memory array
    const newOrder = {
      slug: 'new-valid-order',
      question: 'Valid New Order',
      outcome: 'YES',
      marketPrice: 0.45,
      fairProb: 0.65,
      sizing: { sizeUsd: 25, netEdge: 10.0, kellyFractional: 0.1 }
    };

    const executed = await bot.executePaperOrder(newOrder, staleInMemoryArray);
    assert.ok(executed !== null);

    // Verify on disk: the cancelled record MUST NOT have reverted to 'Open'!
    const onDisk = readLedger();
    const reloadedCancelled = onDisk.find(t => t.id === cancelledId);
    assert.ok(reloadedCancelled !== undefined);
    assert.strictEqual(
      reloadedCancelled.status,
      'Cancelled',
      'Stale in-memory array must not overwrite disk status from Cancelled to Open'
    );

    // The new trade is present
    const reloadedNew = onDisk.find(t => t.slug === 'new-valid-order');
    assert.ok(reloadedNew !== undefined);
    assert.strictEqual(reloadedNew.status, 'Open');
  });

  await runTest('Concurrency: Rapid parallel order submissions vs Kill-Switch race resolves safely', async () => {
    const rm = new InstitutionalRiskManager({ maxHourlyTrades: 1000 });
    const bot = new AutonomousPaperBot({ bankroll: 100000, riskManager: rm });
    writeLedger([]);

    // Spin up 20 concurrent trade executions
    const tradePromises = [];
    for (let i = 0; i < 20; i++) {
      const evalItem = {
        slug: `parallel-mkt-${i}`,
        question: `Parallel Market #${i}`,
        outcome: 'YES',
        marketPrice: 0.45,
        fairProb: 0.65,
        sizing: { sizeUsd: 50, netEdge: 10.0, kellyFractional: 0.05 }
      };
      // Random micro-delay (0-8ms) before execution
      const delay = Math.floor(Math.random() * 8);
      tradePromises.push(
        new Promise(resolve => {
          setTimeout(async () => {
            try {
              const res = await bot.executePaperOrder(evalItem);
              resolve(res);
            } catch (err) {
              resolve({ error: err.message });
            }
          }, delay);
        })
      );
    }

    // Simultaneously trigger kill switch at 4ms
    const killPromise = new Promise(resolve => {
      setTimeout(() => {
        const kRes = rm.triggerKillSwitch('Chaos Multi-Trade Halt');
        resolve(kRes);
      }, 4);
    });

    const [tradeResults, killResult] = await Promise.all([
      Promise.all(tradePromises),
      killPromise
    ]);

    assert.strictEqual(killResult.success, true);
    assert.strictEqual(rm.isKilled, true);

    // After all executions complete, inspect disk
    const diskLedger = readLedger();

    // Check JSON parsing integrity
    assert.ok(Array.isArray(diskLedger));

    // Any order that exists in disk ledger must NOT have status 'Open' if placed before kill switch
    // Note: if an order slipped in concurrently after triggerKillSwitch read the ledger,
    // let's check its behavior:
    // If it was called after rm.isKilled = true, checkPreTradeRisk refused it (returned null).
    for (const order of diskLedger) {
      if (order.status === 'Open') {
        // If an order has status 'Open', it means it was written after triggerKillSwitch completed.
        // But checkPreTradeRisk checks rm.isKilled!
        // Let's verify whether rm.isKilled was checked.
        assert.fail(`Order ${order.slug} has status 'Open' on disk after kill-switch was triggered!`);
      }
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SUITE 3: ATOMIC FILE WRITES & MASSIVE CONCURRENCY STRESS
  // ───────────────────────────────────────────────────────────────────────────
  console.log('\n[SUITE 3] Atomic File Writes & Reader/Writer Concurrency Stress');

  await runTest('Atomic Writes: 100 concurrent asynchronous writers do not corrupt JSON or leave tmp files', async () => {
    // Seed initial ledger
    writeLedger([{ id: 'init', status: 'Closed' }]);

    const writerPromises = [];
    for (let i = 0; i < 100; i++) {
      const payload = [];
      const count = 5 + (i % 20); // 5 to 24 items
      for (let j = 0; j < count; j++) {
        payload.push({
          id: `writer-${i}-item-${j}`,
          iteration: i,
          item: j,
          timestamp: new Date().toISOString(),
          status: 'Closed',
          pnl: i * j
        });
      }

      writerPromises.push(
        new Promise((resolve, reject) => {
          // Jitter 0-15ms
          setTimeout(() => {
            try {
              writeLedger(payload);
              resolve(i);
            } catch (err) {
              reject(err);
            }
          }, Math.floor(Math.random() * 15));
        })
      );
    }

    const results = await Promise.all(writerPromises);
    assert.strictEqual(results.length, 100, 'All 100 writers must complete');

    // Verify backtest.json is valid JSON
    const rawContent = fs.readFileSync(BACKTEST_FILE, 'utf-8');
    let parsed = null;
    assert.doesNotThrow(() => {
      parsed = JSON.parse(rawContent);
    }, 'backtest.json must be valid JSON after 100 concurrent writes');
    assert.ok(Array.isArray(parsed));
    assert.ok(parsed.length >= 5, 'Must contain written array items');

    // Verify no orphaned .tmp files in project root
    const rootDir = path.dirname(BACKTEST_FILE);
    const tmpFiles = fs.readdirSync(rootDir).filter(f => f.startsWith('.backtest.') && f.endsWith('.tmp'));
    assert.strictEqual(
      tmpFiles.length,
      0,
      `Expected 0 leftover .tmp files, found ${tmpFiles.length}: ${tmpFiles.join(', ')}`
    );
  });

  await runTest('Atomic Reads: 500 concurrent reads during active writes never observe empty or corrupted JSON', async () => {
    // Initialize ledger with a known non-empty state
    const seedData = Array.from({ length: 50 }, (_, i) => ({
      id: `seed-stable-${i}`,
      status: 'Closed',
      size: 100 + i,
      timestamp: new Date().toISOString()
    }));
    writeLedger(seedData);

    let stopWriters = false;
    let writeCount = 0;

    // Background writer loop
    const writerLoop = (async () => {
      while (!stopWriters) {
        const dynamicPayload = Array.from({ length: 30 + (writeCount % 20) }, (_, i) => ({
          id: `live-write-${writeCount}-${i}`,
          status: 'Open',
          size: 50,
          timestamp: new Date().toISOString()
        }));
        writeLedger(dynamicPayload);
        writeCount++;
        await new Promise(r => setTimeout(r, 2));
      }
    })();

    // 500 concurrent readers
    const readerPromises = [];
    const readObservations = [];

    for (let i = 0; i < 500; i++) {
      readerPromises.push(
        new Promise((resolve) => {
          setTimeout(() => {
            try {
              const res = readLedger();
              readObservations.push({ success: true, length: res.length, isArray: Array.isArray(res) });
              resolve(res);
            } catch (err) {
              readObservations.push({ success: false, error: err.message });
              resolve(null);
            }
          }, Math.floor(Math.random() * 80));
        })
      );
    }

    await Promise.all(readerPromises);
    stopWriters = true;
    await writerLoop;

    assert.strictEqual(readObservations.length, 500);

    // Verify EVERY read:
    // 1. Success was true (no unhandled throw)
    // 2. Returned an array
    // 3. Length was > 0 (NEVER empty [] due to 0-byte file during write!)
    let emptyCount = 0;
    let corruptCount = 0;
    for (const obs of readObservations) {
      if (!obs.success) corruptCount++;
      if (obs.isArray && obs.length === 0) emptyCount++;
    }

    assert.strictEqual(corruptCount, 0, `Observed ${corruptCount} corrupted/failed reads!`);
    assert.strictEqual(
      emptyCount,
      0,
      `Observed ${emptyCount} empty reads ([]), indicating atomic rename failed and exposed 0-byte file!`
    );
  });

  await runTest('SLA Benchmark: Hard Kill-Switch execution latency under 600 orders < 1000ms', async () => {
    // Generate 600 orders (100 open, 500 closed)
    const largeLedger = [];
    for (let i = 0; i < 100; i++) {
      largeLedger.push({
        id: `bench-open-${i}`,
        slug: `mkt-bench-${i}`,
        size: 50,
        status: 'Open',
        timestamp: new Date().toISOString()
      });
    }
    for (let i = 0; i < 500; i++) {
      largeLedger.push({
        id: `bench-closed-${i}`,
        slug: `mkt-bench-closed-${i}`,
        size: 100,
        pnl: 10,
        status: 'Closed',
        timestamp: new Date().toISOString()
      });
    }
    writeLedger(largeLedger);

    const rm = new InstitutionalRiskManager();
    const t0 = performance.now();
    const killRes = rm.triggerKillSwitch('Benchmark Latency Audit Under 600 Orders');
    const elapsedMs = performance.now() - t0;

    console.log(`    ↳ Kill-Switch execution time: ${elapsedMs.toFixed(2)}ms (Internal: ${killRes.executionLatencyMs}ms)`);

    assert.strictEqual(killRes.success, true);
    assert.strictEqual(killRes.cancelledOrders, 100, 'All 100 open orders must be cancelled');
    assert.ok(
      elapsedMs < 1000,
      `Kill-switch latency ${elapsedMs.toFixed(2)}ms breached 1000ms SLA!`
    );

    // Verify all 100 orders are indeed 'Cancelled' in backtest.json
    const disk = readLedger();
    const cancelledOrders = disk.filter(o => o.status === 'Cancelled' && o.id.startsWith('bench-open-'));
    assert.strictEqual(cancelledOrders.length, 100);
  });

} finally {
  // Always restore original backtest.json to prevent contamination
  restoreLedger();
  console.log('\n[CLEANUP] Successfully restored original backtest.json.');
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  EMPIRICAL ADVERSARIAL STRESS TEST SUMMARY: ${totalPassed} PASSED, ${totalFailed} FAILED`);
console.log('═══════════════════════════════════════════════════════════════\n');

if (totalFailed > 0) {
  console.error(`FAILURE DETAILS (${totalFailed} tests failed):`);
  for (const f of testFailures) {
    console.error(`- ${f.name}: ${f.error}`);
  }
  process.exit(1);
} else {
  console.log('ALL EMPIRICAL ADVERSARIAL CHALLENGES CONFIRMED AND PASSED (0 FAILURES).');
  process.exit(0);
}
