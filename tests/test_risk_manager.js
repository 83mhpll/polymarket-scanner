// ══════════════════════════════════════════════════════════════════════
//  tests/test_risk_manager.js — Milestone M4 Risk Controls Test Suite
//  Validates Portfolio Drawdown, Exposure Caps & Hard Kill-Switch Latency
// ══════════════════════════════════════════════════════════════════════

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  InstitutionalRiskManager,
  DEFAULT_RISK_LIMITS,
  readLedger,
  writeLedger
} from '../engine/risk_manager.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const BACKTEST_FILE = path.join(__dir, '..', 'backtest.json');

console.log('===============================================================');
console.log('  RUNNING MILESTONE M4 INSTITUTIONAL RISK CONTROLS TEST SUITE');
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

// ─────────────────────────────────────────────────────────────────
// Suite 1: Portfolio Risk Metrics & Limit Checks
// ─────────────────────────────────────────────────────────────────
console.log('\n[Suite 1] Portfolio Risk Metrics & Limit Checks');

test('InstitutionalRiskManager initializes with institutional defaults', () => {
  const rm = new InstitutionalRiskManager();
  assert.strictEqual(rm.isKilled, false);
  assert.strictEqual(rm.limits.maxDrawdownPct, 15.0);
  assert.strictEqual(rm.limits.maxGrossExposurePct, 50.0);
  assert.strictEqual(rm.limits.maxSinglePositionPct, 10.0);
});

test('evaluatePortfolioRisk computes gross exposure and metrics', () => {
  const rm = new InstitutionalRiskManager();
  const risk = rm.evaluatePortfolioRisk(10000);

  assert.strictEqual(typeof risk.isKilled, 'boolean');
  assert.strictEqual(typeof risk.isRiskBreached, 'boolean');
  assert.ok(Array.isArray(risk.breaches));
  assert.ok(risk.metrics.currentEquity > 0);
  assert.ok(risk.metrics.grossExposureUsd >= 0);
  assert.ok(risk.metrics.drawdownPct >= 0);
});

test('checkPreTradeRisk blocks trade exceeding gross exposure limit', () => {
  const rm = new InstitutionalRiskManager({ maxGrossExposurePct: 20.0 });
  // Try to allocate 30% of bankroll ($3,000 / $10,000)
  const check = rm.checkPreTradeRisk(3000, 'huge-risk-market', 10000);
  assert.strictEqual(check.allowed, false);
  assert.ok(check.reason.includes('gross exposure'));
});

test('checkPreTradeRisk blocks trade exceeding single position limit', () => {
  const rm = new InstitutionalRiskManager({ maxSinglePositionPct: 5.0, maxGrossExposurePct: 80.0 });
  // Try to allocate 10% in single market ($1,000 / $10,000)
  const check = rm.checkPreTradeRisk(1000, 'single-concentrated-market', 10000);
  assert.strictEqual(check.allowed, false);
  assert.ok(check.reason.includes('single market'));
});

// ─────────────────────────────────────────────────────────────────
// Suite 2: Emergency Hard Kill-Switch Execution & Latency Guarantee
// ─────────────────────────────────────────────────────────────────
console.log('\n[Suite 2] Emergency Hard Kill-Switch Execution & Latency Guarantee');

test('Hard Kill-Switch executes within 1000ms latency requirement', () => {
  const rm = new InstitutionalRiskManager();
  const t0 = Date.now();
  const killRes = rm.triggerKillSwitch('Benchmark Latency Audit Test');
  const elapsed = Date.now() - t0;

  assert.strictEqual(killRes.success, true);
  assert.ok(killRes.executionLatencyMs < 1000, `Kill switch took ${killRes.executionLatencyMs}ms, expected < 1000ms`);
  assert.ok(elapsed < 1000, `Total elapsed time ${elapsed}ms, expected < 1000ms`);
  assert.strictEqual(rm.isKilled, true);
});

test('Hard Kill-Switch rejects any subsequent pre-trade attempt', () => {
  const rm = new InstitutionalRiskManager();
  rm.triggerKillSwitch('Unit Test Active Halt');
  const check = rm.checkPreTradeRisk(10, 'safe-market', 10000);
  assert.strictEqual(check.allowed, false);
  assert.ok(check.reason.includes('Hard Kill-Switch'));
});

test('Hard Kill-Switch sets status to Cancelled on open orders in backtest.json', () => {
  const initialLedger = JSON.parse(fs.readFileSync(BACKTEST_FILE, 'utf-8'));
  const testOrder = {
    id: 'test-kill-order-999',
    slug: 'kill-test-slug',
    question: 'Kill switch cancellation test',
    outcome: 'YES',
    size: 25,
    status: 'Open',
    timestamp: new Date().toISOString()
  };

  initialLedger.unshift(testOrder);
  fs.writeFileSync(BACKTEST_FILE, JSON.stringify(initialLedger, null, 2), 'utf-8');

  const rm = new InstitutionalRiskManager();
  rm.triggerKillSwitch('Cancelling active test order');

  const updatedLedger = JSON.parse(fs.readFileSync(BACKTEST_FILE, 'utf-8'));
  const cancelledOrder = updatedLedger.find(o => o.id === 'test-kill-order-999');
  assert.ok(cancelledOrder !== undefined);
  assert.strictEqual(cancelledOrder.status, 'Cancelled');
  assert.ok(cancelledOrder.cancelReason.includes('Kill-Switch'));

  // Clean up
  const cleaned = updatedLedger.filter(o => o.id !== 'test-kill-order-999');
  fs.writeFileSync(BACKTEST_FILE, JSON.stringify(cleaned, null, 2), 'utf-8');
});

test('Kill-Switch can be safely reset with operator authorization', () => {
  const rm = new InstitutionalRiskManager();
  rm.triggerKillSwitch('Temporary audit freeze');
  assert.strictEqual(rm.isKilled, true);

  const resetRes = rm.resetKillSwitch('Chief Risk Officer');
  assert.strictEqual(resetRes.success, true);
  assert.strictEqual(rm.isKilled, false);

  const status = rm.getStatus();
  assert.strictEqual(status.isKilled, false);
  assert.strictEqual(status.recentAuditLogs[0].status, 'RESET_COMPLETED');
});

// ─────────────────────────────────────────────────────────────────
// Suite 3: Milestone M1 Remediation Regression Tests
// ─────────────────────────────────────────────────────────────────
console.log('\n[Suite 3] Milestone M1 Remediation Regression Tests');

test('Single Market Concentration: checkPreTradeRisk checks target market, allowing trades in unallocated markets', () => {
  const rm = new InstitutionalRiskManager({
    maxSinglePositionPct: 10.0, // 10% = $1,000 max single market
    maxGrossExposurePct: 50.0   // 50% = $5,000 max gross
  });

  const originalLedger = readLedger();
  const mockPositions = [
    {
      id: 'existing-mkt-a',
      slug: 'market-a',
      size: 800,
      status: 'Open',
      timestamp: new Date().toISOString()
    }
  ];

  try {
    writeLedger(mockPositions);

    // 1. Proposed trade of $400 in market-b (which has $0 exposure)
    // Target market exposure: $0 + $400 = $400 (4% of $10,000 <= 10% limit)
    // Gross exposure: $800 + $400 = $1,200 (12% <= 50% limit)
    // MUST BE ALLOWED!
    const checkMarketB = rm.checkPreTradeRisk(400, 'market-b', 10000);
    assert.strictEqual(checkMarketB.allowed, true, 'Trade in unallocated market-b should be allowed');

    // 2. Proposed trade of $300 in market-a (which has $800 exposure)
    // Target market exposure: $800 + $300 = $1,100 (11% of $10,000 > 10% limit)
    // MUST BE REJECTED!
    const checkMarketA = rm.checkPreTradeRisk(300, 'market-a', 10000);
    assert.strictEqual(checkMarketA.allowed, false, 'Trade exceeding single market concentration in market-a should be blocked');
    assert.ok(checkMarketA.reason.includes('single market concentration limit'));
  } finally {
    writeLedger(originalLedger);
  }
});

test('Chronological Drawdown: sorts closed trades chronologically to compute accurate peak-to-trough drawdown', () => {
  const rm = new InstitutionalRiskManager({ maxDrawdownPct: 15.0 });

  // Out-of-order closed trades:
  // Trade 1 (2026-01-01): size $1000, pnl +50% (+ $500) -> Equity = $10,500 (Peak = $10,500)
  // Trade 2 (2026-01-02): size $2000, pnl -100% (- $2000) -> Equity = $8,500 (Drawdown = $2000 / $10,500 = 19.05% => breach!)
  // Trade 3 (2026-01-03): size $1000, pnl +100% (+ $1000) -> Equity = $9,500
  const tradesOutOrder = [
    {
      id: 'trade-3',
      status: 'Closed',
      size: 1000,
      pnl: 100,
      timestamp: '2026-01-03T00:00:00.000Z'
    },
    {
      id: 'trade-1',
      status: 'Closed',
      size: 1000,
      pnl: 50,
      timestamp: '2026-01-01T00:00:00.000Z'
    },
    {
      id: 'trade-2',
      status: 'Closed',
      size: 2000,
      pnl: -100,
      timestamp: '2026-01-02T00:00:00.000Z'
    }
  ];

  const evalRisk = rm.evaluatePortfolioRisk(tradesOutOrder, 10000);

  // Peak equity should be $10,500
  assert.strictEqual(evalRisk.metrics.peakEquity, 10500);
  // Current equity = $10,000 + 500 - 2000 + 1000 = $9,500
  assert.strictEqual(evalRisk.metrics.currentEquity, 9500);
  // Drawdown from peak was $2,000 ($10,500 -> $8,500)
  assert.strictEqual(evalRisk.metrics.drawdownUsd, 2000);
  // Max drawdown percentage = (2000 / 10500) * 100 = 19.05%
  assert.ok(Math.abs(evalRisk.metrics.drawdownPct - 19.05) < 0.1);
  // Breach: 19.05% >= 15.0% limit
  assert.strictEqual(evalRisk.isRiskBreached, true);
  assert.ok(evalRisk.breaches.some(b => b.includes('Drawdown breach')));
  // Auto kill-switch should have triggered
  assert.strictEqual(evalRisk.isKilled, true);
});

test('Atomic Persistence: writeLedger safely writes and eliminates read-during-write corruption', () => {
  const original = readLedger();
  try {
    const testPayload = [
      { id: 'atomic-rm-test', status: 'Closed', size: 100, pnl: 10, timestamp: '2026-01-01' }
    ];
    writeLedger(testPayload);
    const readBack = readLedger();
    assert.strictEqual(readBack.length, 1);
    assert.strictEqual(readBack[0].id, 'atomic-rm-test');

    const dir = path.dirname(BACKTEST_FILE);
    const tmpFiles = fs.readdirSync(dir).filter(f => f.startsWith('.backtest.') && f.endsWith('.tmp'));
    assert.strictEqual(tmpFiles.length, 0);
  } finally {
    writeLedger(original);
  }
});

console.log('===============================================================');
console.log(`  RISK MANAGER TESTS PASSED: ${passedCount}/${passedCount}`);
console.log('===============================================================');
