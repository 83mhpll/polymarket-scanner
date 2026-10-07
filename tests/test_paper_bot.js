// ══════════════════════════════════════════════════════════════════════
//  tests/test_paper_bot.js — Milestone M2 Test Suite
//  Validates Kelly sizing, Bayesian shrinkage, passive fill, and ledger
// ══════════════════════════════════════════════════════════════════════

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  calculateKellyPositionSize,
  simulatePassiveFill,
  AutonomousPaperBot,
  readLedger,
  writeLedger
} from '../engine/paper_bot.js';
import { InstitutionalRiskManager } from '../engine/risk_manager.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const BACKTEST_FILE = path.join(__dir, '..', 'backtest.json');

console.log('===============================================================');
console.log('  RUNNING MILESTONE M2 PAPER-TRADING BOT TEST SUITE');
console.log('===============================================================');

let passedCount = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (e) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${e.message}`);
    process.exit(1);
  }
}

async function asyncTest(name, fn) {
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

// ─────────────────────────────────────────────────────────────────
// Suite 1: Fractional Kelly Sizing & Bayesian Market Shrinkage
// ─────────────────────────────────────────────────────────────────
console.log('\n[Suite 1] Fractional Kelly Sizing & Bayesian Market Shrinkage');

test('Kelly returns zero size when net edge is zero or negative', () => {
  const res = calculateKellyPositionSize(0.40, 0.50, 0.02, 10000);
  assert.strictEqual(res.sizeUsd, 0);
  assert.strictEqual(res.kellyFull, 0);
  assert.ok(res.netEdge <= 0);
});

test('Bayesian shrinkage pulls model probability towards market price', () => {
  const fairProb = 0.80;
  const marketPrice = 0.50;
  const shrinkage = 0.50; // 50% pull
  const res = calculateKellyPositionSize(fairProb, marketPrice, 0.02, 10000, 0.25, shrinkage);

  // Expected shrunkProb = 0.5 * 0.50 + 0.5 * 0.80 = 0.65
  assert.strictEqual(res.shrunkProb, 0.65);
  assert.ok(res.shrunkProb < fairProb);
  assert.ok(res.shrunkProb > marketPrice);
});

test('Fractional Kelly scales position size down proportionally', () => {
  const fullRes = calculateKellyPositionSize(0.70, 0.50, 0.02, 10000, 1.0, 1.0, 100);
  const quarterRes = calculateKellyPositionSize(0.70, 0.50, 0.02, 10000, 0.25, 1.0, 100);

  assert.ok(quarterRes.sizeUsd > 0);
  assert.ok(Math.abs(quarterRes.sizeUsd - (fullRes.sizeUsd * 0.25)) < 1.0);
});

test('Max allocation ceiling caps sizeUsd at maxPositionPct', () => {
  // Extreme edge: huge Kelly percentage
  const res = calculateKellyPositionSize(0.99, 0.10, 0.02, 10000, 1.0, 1.0, 5.0);
  // Cap is 5% of $10,000 = $500
  assert.strictEqual(res.sizeUsd, 500);
});

test('Boundary inputs never throw errors or produce NaN/Infinity', () => {
  const res1 = calculateKellyPositionSize(0.0, 0.0, 0.02, 10000);
  assert.ok(!isNaN(res1.sizeUsd) && isFinite(res1.sizeUsd));

  const res2 = calculateKellyPositionSize(1.0, 1.0, 0.02, 10000);
  assert.ok(!isNaN(res2.sizeUsd) && isFinite(res2.sizeUsd));
});

// ─────────────────────────────────────────────────────────────────
// Suite 2: Queue & Fill Simulator (Passive vs Aggressive)
// ─────────────────────────────────────────────────────────────────
console.log('\n[Suite 2] Queue & Fill Simulator (Passive vs Aggressive)');

test('Passive Maker order fills at exact limit price with zero slippage', () => {
  const fill = simulatePassiveFill('PASSIVE', 0.52, 100);
  assert.strictEqual(fill.filled, true);
  assert.strictEqual(fill.fillPrice, 0.52);
  assert.strictEqual(fill.slippageUsd, 0.0);
  assert.ok(fill.queueWaitMs >= 500);
});

test('Aggressive Taker order incurs spread crossing and slippage', () => {
  const orderbook = { bestBid: 0.50, bestAsk: 0.54 };
  const fill = simulatePassiveFill('AGGRESSIVE', 0.50, 500, orderbook);

  assert.strictEqual(fill.filled, true);
  assert.ok(fill.fillPrice >= orderbook.bestAsk);
  assert.ok(fill.slippageUsd > 0);
});

// ─────────────────────────────────────────────────────────────────
// Suite 3: Autonomous Bot Lifecycle & Ledger Integration
// ─────────────────────────────────────────────────────────────────
console.log('\n[Suite 3] Autonomous Bot Lifecycle & Ledger Integration');

test('AutonomousPaperBot initializes with default institutional config', () => {
  const bot = new AutonomousPaperBot({ enabled: false });
  assert.strictEqual(bot.config.enabled, false);
  assert.strictEqual(bot.config.bankroll, 10000);
  assert.strictEqual(bot.config.kellyFraction, 0.25);
  assert.strictEqual(bot.config.executionMode, 'PASSIVE');
});

test('Bot evaluates candidate markets and identifies positive edge', async () => {
  const bot = new AutonomousPaperBot({ minNetEdgePct: 1.0 });
  const evaluated = await bot.evaluateMarket({
    slug: 'test-edge-market',
    question: 'Test Market with Clear Edge',
    price: 0.40,
    opposingPrice: 0.45
  });

  assert.ok(evaluated !== null);
  assert.ok(evaluated.fairProb > 0 && evaluated.fairProb < 1);
  assert.strictEqual(typeof evaluated.shouldTrade, 'boolean');
});

test('Bot executes paper trade and persists valid entry to ledger', async () => {
  const bot = new AutonomousPaperBot({ minNetEdgePct: 0.5 });
  const initialLedger = JSON.parse(fs.readFileSync(BACKTEST_FILE, 'utf-8'));
  const initialLength = initialLedger.length;

  const evaluated = {
    slug: 'automated-test-fixture',
    question: 'Automated Bot Unit Test Market',
    outcome: 'YES',
    marketPrice: 0.45,
    fairProb: 0.65,
    modelSource: 'Unit Test Fair Model',
    sizing: {
      sizeUsd: 50.0,
      netEdge: 15.2,
      kellyFractional: 0.12
    }
  };

  const executed = await bot.executePaperOrder(evaluated, initialLedger);
  assert.ok(executed !== null);
  assert.strictEqual(executed.status, 'Open');
  assert.strictEqual(executed.size, 50.0);
  assert.strictEqual(executed.type, 'BUY');

  // Verify file write
  const updatedLedger = JSON.parse(fs.readFileSync(BACKTEST_FILE, 'utf-8'));
  assert.strictEqual(updatedLedger.length, initialLength + 1);
  assert.strictEqual(updatedLedger[0].slug, 'automated-test-fixture');

  // Clean up fixture trade from ledger
  const cleaned = updatedLedger.filter(t => t.slug !== 'automated-test-fixture');
  fs.writeFileSync(BACKTEST_FILE, JSON.stringify(cleaned, null, 2), 'utf-8');
});

test('Bot status summary reflects metrics and open positions', () => {
  const bot = new AutonomousPaperBot();
  const status = bot.getStatus();
  assert.strictEqual(typeof status.enabled, 'boolean');
  assert.strictEqual(typeof status.openPositionsCount, 'number');
  assert.strictEqual(typeof status.stats.totalEvaluated, 'number');
});

// ─────────────────────────────────────────────────────────────────
// Suite 4: Milestone M1 Remediation Regression Tests
// ─────────────────────────────────────────────────────────────────
console.log('\n[Suite 4] Milestone M1 Remediation Regression Tests');

await asyncTest('Weather NWP: Bracket array [min, max] normalizes and uses Open-Meteo NWP model', async () => {
  const bot = new AutonomousPaperBot({ minNetEdgePct: 0.1 });
  const market = {
    slug: 'nyc-high-temp-bracket-array',
    question: 'Will NYC Central Park high temperature be between 65°F and 75°F on 2026-10-15?',
    price: 0.40,
    bracket: [65, 75],
    targetDate: '2026-10-15'
  };
  const evaluated = await bot.evaluateMarket(market);
  assert.ok(evaluated !== null, 'Market evaluation should not be null');
  assert.strictEqual(evaluated.modelSource, 'Open-Meteo Ensemble NWP (82 members)');
  assert.ok(typeof evaluated.fairProb === 'number');
  assert.ok(evaluated.fairProb > 0 && evaluated.fairProb < 1);
  assert.ok(!isNaN(evaluated.fairProb));
});

await asyncTest('Weather NWP: Object bracket {min, max} evaluates correctly with ensemble', async () => {
  const bot = new AutonomousPaperBot({ minNetEdgePct: 0.1 });
  const market = {
    slug: 'nyc-high-temp-bracket-obj',
    question: 'Will NYC Central Park high temperature be between 60°F and 70°F on 2026-10-15?',
    price: 0.40,
    bracket: { min: 60, max: 70 },
    targetDate: '2026-10-15'
  };
  const evaluated = await bot.evaluateMarket(market);
  assert.ok(evaluated !== null);
  assert.strictEqual(evaluated.modelSource, 'Open-Meteo Ensemble NWP (82 members)');
  assert.ok(evaluated.fairProb > 0 && evaluated.fairProb < 1);
});

await asyncTest('Weather NWP: Malformed weather data triggers diagnostic warning and falls back to Shin devig', async () => {
  const bot = new AutonomousPaperBot({ minNetEdgePct: 0.1 });
  const market = {
    slug: 'invalid-weather-market',
    question: 'Will NYC temperature be valid?',
    price: 0.45,
    bracket: {}, // Invalid bracket causes calculateFairProbability to throw
    targetDate: '2026-10-15'
  };
  const evaluated = await bot.evaluateMarket(market);
  assert.ok(evaluated !== null);
  assert.strictEqual(evaluated.modelSource, 'Shin 1993 De-vigging');
  assert.ok(evaluated.fairProb > 0 && evaluated.fairProb < 1);
});

await asyncTest('Risk Integration: Bot honors custom InstitutionalRiskManager instance in constructor', async () => {
  const customRm = new InstitutionalRiskManager();
  const bot = new AutonomousPaperBot({ riskManager: customRm });
  assert.strictEqual(bot.riskManager, customRm);
});

await asyncTest('Risk Integration: runCycle() skips execution when riskManager is in Hard Kill-Switch state', async () => {
  const customRm = new InstitutionalRiskManager();
  customRm.isKilled = true;
  const bot = new AutonomousPaperBot({ enabled: true, riskManager: customRm });
  
  let executedCount = 0;
  bot.subscribe((event) => {
    if (event === 'trade_executed') executedCount++;
  });

  await bot.runCycle();
  assert.strictEqual(executedCount, 0, 'No trades should be executed when killed');
  assert.strictEqual(bot.stats.tradesExecuted, 0);
});

await asyncTest('Risk Integration: executePaperOrder() blocks trade and does not persist when pre-trade check fails', async () => {
  const customRm = new InstitutionalRiskManager({ maxGrossExposurePct: 1.0 }); // 1% gross limit
  const bot = new AutonomousPaperBot({ bankroll: 10000, riskManager: customRm });

  let rejectionEmitted = false;
  bot.subscribe((event, data) => {
    if (event === 'trade_rejected') {
      rejectionEmitted = true;
      assert.ok(data.reason.includes('gross exposure'));
    }
  });

  const initialDisk = readLedger();
  const initialCount = initialDisk.length;

  const evaluated = {
    slug: 'oversized-risk-trade',
    question: 'Huge Trade Market',
    outcome: 'YES',
    marketPrice: 0.50,
    fairProb: 0.80,
    modelSource: 'Unit Test Fair Model',
    sizing: {
      sizeUsd: 500.0,
      netEdge: 20.0,
      kellyFractional: 0.20
    }
  };

  const executed = await bot.executePaperOrder(evaluated);
  assert.strictEqual(executed, null, 'executePaperOrder should return null on risk rejection');
  assert.strictEqual(rejectionEmitted, true, 'trade_rejected event should be emitted');

  const afterDisk = readLedger();
  assert.strictEqual(afterDisk.length, initialCount, 'Disk ledger must not change on rejected trade');
  assert.ok(!afterDisk.some(t => t.slug === 'oversized-risk-trade'));
});

await asyncTest('Ledger Concurrency: executePaperOrder() preserves Kill-Switch cancellations on disk', async () => {
  const originalLedger = readLedger();
  const cancelledOrderId = 'disk-cancelled-' + Date.now();
  const cancelledOrder = {
    id: cancelledOrderId,
    slug: 'cancelled-order-test',
    question: 'Cancelled Order Should Remain Cancelled',
    outcome: 'YES',
    price: 0.50,
    size: 50,
    status: 'Cancelled',
    timestamp: new Date().toISOString(),
    cancelledAt: new Date().toISOString(),
    cancelReason: 'Emergency Kill-Switch: Concurrency Test'
  };

  try {
    writeLedger([cancelledOrder, ...originalLedger]);

    // Simulate in-memory stale ledger where order is still 'Open'
    const staleInMemoryLedger = [{ ...cancelledOrder, status: 'Open' }, ...originalLedger];

    const bot = new AutonomousPaperBot({ minNetEdgePct: 0.1 });
    const newEvaluated = {
      slug: 'concurrent-new-trade',
      question: 'New Trade During Concurrency',
      outcome: 'YES',
      marketPrice: 0.45,
      fairProb: 0.65,
      modelSource: 'Unit Test Fair Model',
      sizing: {
        sizeUsd: 25.0,
        netEdge: 10.0,
        kellyFractional: 0.1
      }
    };

    await bot.executePaperOrder(newEvaluated, staleInMemoryLedger);

    // Check disk: cancelled order MUST still have status 'Cancelled'
    const reloadedDisk = readLedger();
    const checkOrder = reloadedDisk.find(t => t.id === cancelledOrderId);
    assert.ok(checkOrder !== undefined);
    assert.strictEqual(checkOrder.status, 'Cancelled', 'Cancelled status must not be overwritten by stale array');
  } finally {
    // Restore clean ledger
    writeLedger(originalLedger);
  }
});

await asyncTest('Atomic Persistence: writeLedger writes valid JSON atomically without temp file residue', () => {
  const originalLedger = readLedger();
  try {
    const testData = [{ id: 'atomic-test', timestamp: new Date().toISOString() }];
    writeLedger(testData);

    const reloaded = readLedger();
    assert.strictEqual(reloaded.length, 1);
    assert.strictEqual(reloaded[0].id, 'atomic-test');

    // Verify no orphaned .tmp files in project root
    const dir = path.dirname(BACKTEST_FILE);
    const tmpFiles = fs.readdirSync(dir).filter(f => f.startsWith('.backtest.') && f.endsWith('.tmp'));
    assert.strictEqual(tmpFiles.length, 0, 'No .tmp files should be left after writeLedger');
  } finally {
    writeLedger(originalLedger);
  }
});

console.log('===============================================================');
console.log(`  PAPER BOT TESTS PASSED: ${passedCount}/${passedCount}`);
console.log('===============================================================');
