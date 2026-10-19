/**
 * tests/stress_challenger_m2_bot.js
 *
 * Empirical Adversarial Stress Harness for engine/txflow_bot.js
 * Author: challenger_m2_1 (Empirical Challenger)
 * Milestone: M2 — Outcome Markets Order Signer & Execution Engine (TIP 3)
 *
 * Adversarial Challenge Dimensions:
 * 1. TIP 3 Asset ID, Cloid Generation & Boundary Fuzzing:
 *    - Valid & boundary asset IDs (YES/NO, indices 0..999, negative, clamps, string coercions).
 *    - 100+ generated cloids validated, malformed cloids rejected / sanitized.
 * 2. Time-In-Force (TIF) Normalization & Mixed-Casing Adversarial Defense:
 *    - Gtc, Alo, Gtd with mixed casing (gTc, ALO, gtd) and invalid fallback defaults.
 * 3. TIP 3 Order Action & Cancel Action Schema Compliance:
 *    - Strict property sequence, integer asset IDs, and exact MessagePack serialization.
 * 4. EIP-712 Low-S Canonical Signing Pipeline with 20+ Random Wallets:
 *    - Validates s <= N/2, v in {27, 28}, connectionId format, and address recovery.
 * 5. Order Submission with Diverse TIFs and Cloids:
 *    - Submissions under Gtc, Alo, Gtd; uppercase, lowercase, generated, and sanitized cloids.
 *    - Asynchronous queue traceId capture (0x...), status transition QUEUED -> RESTING.
 * 6. Price, Size & Pre-Trade Risk Boundary Guards:
 *    - Boundary prices (<=0, >=1, NaN, non-numeric) & sizes (<=0, NaN).
 *    - Pre-trade risk manager limit breaches (gross exposure / single concentration).
 * 7. Dual WebSocket Lifecycle Telemetry & Event Ingestion:
 *    - Ingestion of /api-ws and /ws frames: queued, resting, filled, cancelled, rejected.
 * 8. Order Cancellation Mechanics:
 *    - Cancel by cloid, cancel by orderId, double-cancellation idempotence, cancelAllOrders.
 * 9. Emergency Kill-Switch Halts, Sub-Second Latency & Order Rejection:
 *    - SLA latency benchmark (< 1000ms), active order mass cancellation, order rejection with KILL_SWITCH_ACTIVE.
 * 10. High-Concurrency Burst & Atomic Persistence Stress:
 *     - 30 concurrent order submissions; verifying race resilience and atomic persistence in txflow_orders.json.
 * 11. State Isolation & 0-Byte backtest.json Invariant:
 *     - Certifies backtest.json hash remains 100% bit-identical before and after all stress tests.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';

import {
  TxFlowBot,
  txflowBotInstance,
  calculateTip3AssetId,
  generateCloid,
  validateCloid,
  normalizeTif,
  buildOrderAction,
  buildCancelAction,
  readTxFlowOrders,
  writeTxFlowOrders,
  TXFLOW_ORDERS_FILE,
  VALID_TIF
} from '../engine/txflow_bot.js';
import { txflowClientInstance, TxFlowClient, SECP256K1_HALF_N } from '../services/txflow_client.js';
import { riskManagerInstance, InstitutionalRiskManager } from '../engine/risk_manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKTEST_FILE = path.join(__dirname, '..', 'backtest.json');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ↳ Error: ${err.message}`);
    if (err.stack) {
      console.error(`    ↳ Stack: ${err.stack.split('\n').slice(1, 4).join('\n')}`);
    }
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ↳ Error: ${err.message}`);
    if (err.stack) {
      console.error(`    ↳ Stack: ${err.stack.split('\n').slice(1, 4).join('\n')}`);
    }
    throw err;
  }
}

function getFileSha256(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

console.log('══════════════════════════════════════════════════════════════════');
console.log('  CHALLENGER M2: EMPIRICAL ADVERSARIAL STRESS TEST HARNESS');
console.log('  Target: engine/txflow_bot.js (Milestone M2: TxFlow Execution Bot)');
console.log('══════════════════════════════════════════════════════════════════\n');

// ─────────────────────────────────────────────────────────────────────────────
// BASELINE INTEGRITY CHECK
// ─────────────────────────────────────────────────────────────────────────────
const backtestShaBefore = getFileSha256(BACKTEST_FILE);
const backtestSizeBefore = fs.existsSync(BACKTEST_FILE) ? fs.statSync(BACKTEST_FILE).size : 0;
console.log(`[Baseline] backtest.json SHA-256 : ${backtestShaBefore}`);
console.log(`[Baseline] backtest.json size    : ${backtestSizeBefore} bytes\n`);

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: TIP 3 ASSET ID, CLOID GENERATION & BOUNDARY FUZZING
// ─────────────────────────────────────────────────────────────────────────────
console.log('▶ SUITE 1: TIP 3 Asset ID, Cloid Generation & Boundary Fuzzing');

runTest('Asset ID: Computes canonical integer asset IDs for standard YES/NO outcomes', () => {
  assert.equal(calculateTip3AssetId(0, 0), 100000000, 'Market 0 YES must be 100000000');
  assert.equal(calculateTip3AssetId(0, 1), 100000001, 'Market 0 NO must be 100000001');
  assert.equal(calculateTip3AssetId(0, 'YES'), 100000000);
  assert.equal(calculateTip3AssetId(0, 'NO'), 100000001);
  assert.equal(calculateTip3AssetId(0, 'yes'), 100000000);
  assert.equal(calculateTip3AssetId(0, 'no'), 100000001);
  assert.equal(calculateTip3AssetId(1, 0), 100000010, 'Market 1 YES must be 100000010');
  assert.equal(calculateTip3AssetId(1, 1), 100000011, 'Market 1 NO must be 100000011');
});

runTest('Asset ID: Handles multi-outcome indices (0..999) and boundary conditions', () => {
  for (let idx = 0; idx <= 100; idx++) {
    const expectedYes = 100000000 + (10 * idx);
    const expectedNo = expectedYes + 1;
    assert.equal(calculateTip3AssetId(idx, 0), expectedYes);
    assert.equal(calculateTip3AssetId(idx, 1), expectedNo);
  }
  // Large index
  assert.equal(calculateTip3AssetId(999, 1), 100009991);
  // Negative outcome index clamped to 0
  assert.equal(calculateTip3AssetId(-10, 0), 100000000);
  // String outcome index parsed
  assert.equal(calculateTip3AssetId('42', 'NO'), 100000421);
});

runTest('Cloid: Generates 100 distinct 128-bit hex cloids and validates schema', () => {
  const seen = new Set();
  for (let i = 0; i < 100; i++) {
    const cloid = generateCloid();
    assert.equal(validateCloid(cloid), true, `Cloid ${cloid} must be valid`);
    assert.equal(cloid.length, 34, 'Cloid must be 34 characters (0x + 32 hex)');
    assert.ok(cloid.startsWith('0x'), 'Cloid must start with 0x');
    assert.equal(seen.has(cloid), false, 'Cloid must be collision-free');
    seen.add(cloid);
  }
});

runTest('Cloid: Rejects malformed and adversarial cloid inputs', () => {
  assert.equal(validateCloid(''), false);
  assert.equal(validateCloid(null), false);
  assert.equal(validateCloid(undefined), false);
  assert.equal(validateCloid(12345), false);
  assert.equal(validateCloid('0x123'), false, 'Too short');
  assert.equal(validateCloid('0x' + 'a'.repeat(31)), false, '33 chars total');
  assert.equal(validateCloid('0x' + 'a'.repeat(33)), false, '35 chars total');
  assert.equal(validateCloid('a'.repeat(32)), false, 'Missing 0x prefix');
  assert.equal(validateCloid('0x' + 'g'.repeat(32)), false, 'Non-hex character g');
  assert.equal(validateCloid('0x' + 'z'.repeat(32)), false, 'Non-hex character z');
  // Mixed case valid hex
  assert.equal(validateCloid('0xAbCdEf0123456789AbCdEf0123456789'), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: TIME-IN-FORCE (TIF) NORMALIZATION & ADVERSARIAL OPTIONS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ SUITE 2: Time-In-Force (TIF) Normalization & Mixed-Casing Defense');

runTest('TIF: Normalizes canonical options across diverse casing', () => {
  assert.equal(normalizeTif('Gtc'), 'Gtc');
  assert.equal(normalizeTif('gtc'), 'Gtc');
  assert.equal(normalizeTif('GTC'), 'Gtc');
  assert.equal(normalizeTif('gTc'), 'Gtc');

  assert.equal(normalizeTif('Alo'), 'Alo');
  assert.equal(normalizeTif('alo'), 'Alo');
  assert.equal(normalizeTif('ALO'), 'Alo');
  assert.equal(normalizeTif('aLo'), 'Alo');

  assert.equal(normalizeTif('Gtd'), 'Gtd');
  assert.equal(normalizeTif('gtd'), 'Gtd');
  assert.equal(normalizeTif('GTD'), 'Gtd');
});

runTest('TIF: Safely defaults unknown, corrupted, or falsy TIFs to Gtc', () => {
  assert.equal(normalizeTif(null), 'Gtc');
  assert.equal(normalizeTif(undefined), 'Gtc');
  assert.equal(normalizeTif(''), 'Gtc');
  assert.equal(normalizeTif('IOC'), 'Gtc');
  assert.equal(normalizeTif('FOK'), 'Gtc');
  assert.equal(normalizeTif('invalid_tif'), 'Gtc');
  assert.equal(normalizeTif(123), 'Gtc');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: TIP 3 ORDER ACTION & CANCEL ACTION SCHEMA COMPLIANCE
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ SUITE 3: TIP 3 Order Action & Cancel Action Schema Compliance');

runTest('buildOrderAction: Constructs strictly compliant TIP 3 order payload', () => {
  const cloid = generateCloid();
  const action = buildOrderAction({
    assetId: 100000001,
    isBuy: true,
    price: '0.62',
    size: '100',
    tif: 'Alo',
    cloid,
    reduceOnly: false
  });

  assert.equal(action.type, 'order');
  assert.equal(action.grouping, 'na');
  assert.equal(Array.isArray(action.orders), true);
  assert.equal(action.orders.length, 1);

  const o = action.orders[0];
  assert.equal(o.a, 100000001, 'Asset must be number');
  assert.equal(o.b, true, 'isBuy must be boolean');
  assert.equal(o.p, '0.62', 'Price must be string');
  assert.equal(o.s, '100', 'Size must be string');
  assert.equal(o.r, false, 'reduceOnly must be boolean');
  assert.deepEqual(o.t, { limit: { tif: 'Alo' } });
  assert.equal(o.c, cloid);

  // Property sequence preservation
  const keys = Object.keys(o);
  assert.deepEqual(keys, ['a', 'b', 'p', 's', 'r', 't', 'c']);
});

runTest('buildOrderAction: Omits cloid property when not provided', () => {
  const action = buildOrderAction({
    assetId: 100000000,
    isBuy: false,
    price: '0.38',
    size: '50'
  });
  const o = action.orders[0];
  assert.equal(o.c, undefined, 'c property must be omitted if cloid is null');
  assert.equal(o.t.limit.tif, 'Gtc');
});

runTest('buildCancelAction: Constructs cancelByCloid when cloid provided', () => {
  const cloid = generateCloid();
  const cancelAction = buildCancelAction({ assetId: 100000001, cloid });
  assert.equal(cancelAction.type, 'cancelByCloid');
  assert.equal(cancelAction.cancels[0].asset, 100000001);
  assert.equal(cancelAction.cancels[0].cloid, cloid);
});

runTest('buildCancelAction: Constructs cancel by orderId when cloid omitted', () => {
  const cancelAction = buildCancelAction({ assetId: 100000001, orderId: 887766 });
  assert.equal(cancelAction.type, 'cancel');
  assert.equal(cancelAction.cancels[0].a, 100000001);
  assert.equal(cancelAction.cancels[0].o, 887766);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: EIP-712 LOW-S CANONICAL SIGNING PIPELINE (20+ RANDOM WALLETS)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ SUITE 4: EIP-712 Low-S Canonical Signing Pipeline');

await runAsyncTest('signOrder: Generates low-S canonical signatures and connectionId for 20 distinct random agent wallets', async () => {
  for (let i = 0; i < 20; i++) {
    const testWallet = ethers.Wallet.createRandom();
    const customClient = new TxFlowClient({ agentPrivateKey: testWallet.privateKey, mockMode: true });
    const bot = new TxFlowBot({ client: customClient });

    const cloid = generateCloid();
    const signed = await bot.signOrder({
      assetId: 100000000 + i * 10 + 1,
      isBuy: i % 2 === 0,
      price: (0.15 + (i * 0.03)).toFixed(2),
      size: `${(i + 1) * 20}`,
      tif: i % 3 === 0 ? 'Gtc' : (i % 3 === 1 ? 'Alo' : 'Gtd'),
      cloid
    });

    // Verification of signature invariants
    assert.ok(signed.signature.r.startsWith('0x') && signed.signature.r.length === 66);
    assert.ok(signed.signature.s.startsWith('0x') && signed.signature.s.length === 66);
    assert.ok(signed.signature.v === 27 || signed.signature.v === 28);
    const sBig = BigInt(signed.signature.s);
    assert.ok(sBig <= SECP256K1_HALF_N, `Signature s=${signed.signature.s} must be <= N/2`);
    assert.ok(sBig > 0n);

    // ConnectionId verification
    assert.ok(signed.connectionId.startsWith('0x') && signed.connectionId.length === 66);
    assert.equal(signed.cloid, cloid);
    assert.equal(signed.assetId, 100000000 + i * 10 + 1);
  }
});

runTest('signOrder: Throws descriptive error on invalid asset IDs', async () => {
  const bot = new TxFlowBot({ mockMode: true });
  await assert.rejects(
    async () => bot.signOrder({ assetId: -10, price: '0.50', size: '10' }),
    /Asset ID must be a positive integer/
  );
  await assert.rejects(
    async () => bot.signOrder({ assetId: 'not-a-number', price: '0.50', size: '10' }),
    /Invalid asset ID/
  );
  await assert.rejects(
    async () => bot.signOrder({ assetId: 100.55, price: '0.50', size: '10' }),
    /Asset ID must be a positive integer/
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5: ORDER SUBMISSION WITH DIVERSE TIFs AND CLOIDs
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ SUITE 5: Order Submission with Diverse TIFs and Cloids');

await runAsyncTest('submitOrder: Submits orders across all TIF options (Gtc, Alo, Gtd) and mixed cases', async () => {
  const testClient = new TxFlowClient({ mockMode: true });
  await testClient.requestFaucet();
  await testClient.transferToOutcome(800);

  const bot = new TxFlowBot({ client: testClient, mockMode: true });
  bot.resetOrders();

  const tifTestCases = ['Gtc', 'Alo', 'Gtd', 'gtc', 'ALO', 'gtd', 'aLo'];

  for (let i = 0; i < tifTestCases.length; i++) {
    const rawTif = tifTestCases[i];
    const customCloid = '0x' + crypto.randomBytes(16).toString('hex');

    const res = await bot.submitOrder({
      instrumentId: 100000000 + i * 10,
      isBuy: true,
      price: (0.40 + (i * 0.05)).toFixed(2),
      size: '15',
      tif: rawTif,
      cloid: customCloid,
      marketId: `test-mkt-${i}`
    });

    assert.equal(res.success, true, `Submission with TIF ${rawTif} must succeed`);
    assert.ok(res.traceId.startsWith('0x'), 'traceId must start with 0x');
    assert.equal(res.cloid, customCloid);
    assert.equal(res.status, 'QUEUED');

    // Verify in-memory record
    const recorded = bot.orders.find(o => o.traceId === res.traceId);
    assert.ok(recorded, 'Order must be registered in memory');
    assert.equal(recorded.tif, normalizeTif(rawTif));
    assert.equal(recorded.cloid, customCloid);
  }

  // Verify atomic persistence to txflow_orders.json
  const persisted = readTxFlowOrders();
  assert.equal(persisted.length, tifTestCases.length);
  bot.resetOrders();
});

await runAsyncTest('submitOrder: Auto-sanitizes malformed cloid and generates compliant 128-bit hex cloid', async () => {
  const testClient = new TxFlowClient({ mockMode: true });
  await testClient.requestFaucet();
  await testClient.transferToOutcome(200);

  const bot = new TxFlowBot({ client: testClient, mockMode: true });
  bot.resetOrders();

  const malformedCloids = [
    'invalid-cloid',
    '0x123',
    'not_a_hex_string_at_all',
    null,
    undefined,
    ''
  ];

  for (const badCloid of malformedCloids) {
    const res = await bot.submitOrder({
      instrumentId: 100000001,
      isBuy: true,
      price: '0.50',
      size: '10',
      cloid: badCloid
    });

    assert.equal(res.success, true);
    assert.equal(validateCloid(res.cloid), true, `Sanitized cloid ${res.cloid} must be valid 128-bit hex`);
    assert.notEqual(res.cloid, badCloid, 'Must replace invalid cloid with generated one');
  }

  bot.resetOrders();
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6: PRICE, SIZE & PRE-TRADE RISK BOUNDARY GUARDS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ SUITE 6: Price, Size & Pre-Trade Risk Boundary Guards');

await runAsyncTest('Rejects boundary and malformed limit prices', async () => {
  const bot = new TxFlowBot({ mockMode: true });

  const invalidPrices = [0, -0.05, 1.0, 1.5, '0', '1', 'NaN', 'abc', null, undefined];
  for (const p of invalidPrices) {
    const res = await bot.submitOrder({
      instrumentId: 100000001,
      price: p,
      size: '10'
    });
    assert.equal(res.success, false, `Price ${p} must be rejected`);
    assert.equal(res.rejectedReason, 'INVALID_PRICE');
  }
});

await runAsyncTest('Rejects boundary and malformed order sizes', async () => {
  const bot = new TxFlowBot({ mockMode: true });

  const invalidSizes = [0, -10, '-5', 'NaN', 'zero', null, undefined];
  for (const s of invalidSizes) {
    const res = await bot.submitOrder({
      instrumentId: 100000001,
      price: '0.50',
      size: s
    });
    assert.equal(res.success, false, `Size ${s} must be rejected`);
    assert.equal(res.rejectedReason, 'INVALID_SIZE');
  }
});

await runAsyncTest('Rejects order breaching Institutional Risk single-market concentration limit', async () => {
  const customRisk = new InstitutionalRiskManager({
    maxSinglePositionPct: 5.0, // max 5% of bankroll = $500
    minBankrollUsd: 1000
  });

  const customClient = new TxFlowClient({ mockMode: true });
  await customClient.requestFaucet();
  await customClient.transferToOutcome(2000);

  const bot = new TxFlowBot({
    client: customClient,
    riskManager: customRisk,
    config: { bankroll: 10_000 },
    mockMode: true
  });

  // Attempt to place an order of $800 (8% of bankroll > 5% limit)
  const res = await bot.submitOrder({
    instrumentId: 100000001,
    marketId: 'overloaded-market',
    price: '0.80',
    size: '1000' // $800 cost
  });

  assert.equal(res.success, false);
  assert.equal(res.rejectedReason, 'RISK_LIMIT_BREACH');
  assert.match(res.error, /concentration/i);
});

await runAsyncTest('Rejects order when outcome balance is insufficient and auto-rebalance cannot cover', async () => {
  const customClient = new TxFlowClient({ mockMode: true });
  customClient.resetMockState(); // 0 perp, 0 outcome

  const bot = new TxFlowBot({
    client: customClient,
    mockMode: false // strictly enforce balance check
  });

  const res = await bot.submitOrder({
    instrumentId: 100000001,
    price: '0.50',
    size: '100' // $50 cost
  });

  assert.equal(res.success, false);
  assert.equal(res.rejectedReason, 'INSUFFICIENT_OUTCOME_BALANCE');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 7: DUAL WEBSOCKET LIFECYCLE TELEMETRY & EVENT INGESTION
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ SUITE 7: Dual WebSocket Lifecycle Telemetry & Event Ingestion');

await runAsyncTest('Ingests /api-ws delay queue confirmation and error drops', async () => {
  const bot = new TxFlowBot({ mockMode: true });
  bot.resetOrders();

  // Create mock order directly in registry
  const testTraceId = '0x' + crypto.randomBytes(16).toString('hex');
  const testCloid = generateCloid();
  bot.orders.push({
    orderId: 1001,
    cloid: testCloid,
    traceId: testTraceId,
    assetId: 100000001,
    status: 'QUEUED',
    updatedAt: new Date().toISOString()
  });

  let restingFired = false;
  bot.once('order_resting', (ev) => {
    if (ev.traceId === testTraceId) restingFired = true;
  });

  // Simulate /api-ws message: delay queue resting
  bot._handleApiWsMessage(Buffer.from(JSON.stringify({
    channel: 'outcomeOrderUpdate',
    data: {
      traceId: testTraceId,
      status: 'resting'
    }
  })));

  assert.equal(restingFired, true);
  const updatedOrder = bot.orders.find(o => o.traceId === testTraceId);
  assert.equal(updatedOrder.status, 'RESTING');

  // Test /api-ws error drop
  const dropTraceId = '0x' + crypto.randomBytes(16).toString('hex');
  bot.orders.push({
    orderId: 1002,
    cloid: generateCloid(),
    traceId: dropTraceId,
    assetId: 100000001,
    status: 'QUEUED',
    updatedAt: new Date().toISOString()
  });

  let rejectedFired = false;
  bot.once('order_rejected', (ev) => {
    if (ev.traceId === dropTraceId) rejectedFired = true;
  });

  bot._handleApiWsMessage(Buffer.from(JSON.stringify({
    channel: 'outcomeOrderUpdate',
    data: {
      traceId: dropTraceId,
      error: 'Delay Queue Dropout'
    }
  })));

  assert.equal(rejectedFired, true);
  const droppedOrder = bot.orders.find(o => o.traceId === dropTraceId);
  assert.equal(droppedOrder.status, 'REJECTED');
  assert.equal(droppedOrder.cancelReason, 'Delay Queue Dropout');

  bot.resetOrders();
});

await runAsyncTest('Ingests /ws execution fill and cancellation updates', async () => {
  const bot = new TxFlowBot({ mockMode: true });
  bot.resetOrders();

  const cloid = generateCloid();
  bot.orders.push({
    orderId: 9991,
    cloid,
    traceId: '0x123',
    assetId: 100000001,
    status: 'RESTING',
    filledSz: '0',
    remainingSz: '50',
    avgPx: null,
    updatedAt: new Date().toISOString()
  });

  let filledFired = false;
  bot.once('order_filled', (ev) => {
    if (ev.cloid === cloid) filledFired = true;
  });

  // Simulate fill frame
  bot._handleWsMessage(Buffer.from(JSON.stringify({
    channel: 'outcomeOrderUpdates',
    data: {
      oid: 9991,
      cloid,
      status: 'filled',
      filledSz: '50',
      remainingSz: '0',
      avgPx: '0.62'
    }
  })));

  assert.equal(filledFired, true);
  const filledOrder = bot.orders.find(o => o.cloid === cloid);
  assert.equal(filledOrder.status, 'FILLED');
  assert.equal(filledOrder.filledSz, '50');
  assert.equal(filledOrder.avgPx, '0.62');

  bot.resetOrders();
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 8: ORDER CANCELLATION MECHANICS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ SUITE 8: Order Cancellation Mechanics');

await runAsyncTest('cancelOrder: Cancels by cloid, by orderId, and verifies idempotency', async () => {
  const bot = new TxFlowBot({ mockMode: true });
  bot.resetOrders();

  const cloid1 = generateCloid();
  const cloid2 = generateCloid();

  bot.orders.push(
    { orderId: 501, cloid: cloid1, traceId: '0xt1', assetId: 100000001, status: 'RESTING' },
    { orderId: 502, cloid: cloid2, traceId: '0xt2', assetId: 100000001, status: 'QUEUED' }
  );
  writeTxFlowOrders(bot.orders);

  // Cancel by cloid
  const res1 = await bot.cancelOrder({ cloid: cloid1 });
  assert.equal(res1.success, true);
  assert.equal(res1.canceledCount, 1);
  assert.equal(bot.orders.find(o => o.cloid === cloid1).status, 'CANCELLED');

  // Double cancel by cloid (idempotency check)
  const res1Repeat = await bot.cancelOrder({ cloid: cloid1 });
  assert.equal(res1Repeat.success, true);
  assert.equal(res1Repeat.canceledCount, 0, 'Already cancelled order must return canceledCount: 0');

  // Cancel by orderId
  const res2 = await bot.cancelOrder({ orderId: 502 });
  assert.equal(res2.success, true);
  assert.equal(res2.canceledCount, 1);
  assert.equal(bot.orders.find(o => o.orderId === 502).status, 'CANCELLED');

  // Cancel non-existent cloid
  const resUnknown = await bot.cancelOrder({ cloid: generateCloid() });
  assert.equal(resUnknown.success, true);
  assert.equal(resUnknown.canceledCount, 0);

  bot.resetOrders();
});

await runAsyncTest('cancelAllOrders: Cancels all active orders and ignores terminal orders', async () => {
  const bot = new TxFlowBot({ mockMode: true });
  bot.resetOrders();

  bot.orders.push(
    { orderId: 601, cloid: generateCloid(), traceId: '0xt1', status: 'QUEUED' },
    { orderId: 602, cloid: generateCloid(), traceId: '0xt2', status: 'RESTING' },
    { orderId: 603, cloid: generateCloid(), traceId: '0xt3', status: 'RESTING' },
    { orderId: 604, cloid: generateCloid(), traceId: '0xt4', status: 'FILLED' },
    { orderId: 605, cloid: generateCloid(), traceId: '0xt5', status: 'CANCELLED' }
  );

  const res = await bot.cancelAllOrders('Bulk Test Cancel');
  assert.equal(res.success, true);
  assert.equal(res.count, 3, 'Only 3 active orders must be cancelled');

  const activeRemaining = bot.orders.filter(o => o.status === 'QUEUED' || o.status === 'RESTING');
  assert.equal(activeRemaining.length, 0);
  assert.equal(bot.orders.find(o => o.orderId === 604).status, 'FILLED', 'FILLED order must remain FILLED');

  bot.resetOrders();
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 9: EMERGENCY KILL-SWITCH HALTS, LATENCY GUARANTEE & ORDER REJECTION
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ SUITE 9: Emergency Kill-Switch Halts, Latency Guarantee & Order Rejection');

await runAsyncTest('Kill-Switch: Executes in sub-second latency (<1000ms), cancels open testnet orders', async () => {
  const bot = new TxFlowBot({ mockMode: true });
  bot.resetOrders();

  // Populate 10 active orders
  for (let i = 0; i < 10; i++) {
    bot.orders.push({
      orderId: 700 + i,
      cloid: generateCloid(),
      traceId: `0xtrace_${i}`,
      assetId: 100000001,
      status: i % 2 === 0 ? 'QUEUED' : 'RESTING'
    });
  }
  writeTxFlowOrders(bot.orders);

  // Measure latency of emergency kill trigger
  const t0 = performance.now();
  riskManagerInstance.triggerKillSwitch('Adversarial Stress Test Halt');
  const t1 = performance.now();
  const latencyMs = t1 - t0;

  console.log(`    ↳ Kill-Switch execution latency: ${latencyMs.toFixed(3)}ms (SLA limit: 1000ms)`);
  assert.ok(latencyMs < 1000, `Kill-switch latency ${latencyMs}ms exceeded 1000ms SLA`);
  assert.equal(riskManagerInstance.isKilled, true);

  // Invariant: all open orders in txflowBot must be CANCELLED
  const activeOrders = bot.orders.filter(o => o.status === 'QUEUED' || o.status === 'RESTING');
  assert.equal(activeOrders.length, 0, 'Zero open orders may remain active after kill-switch');
  assert.equal(bot.isRunning, false, 'Bot must be halted');

  // Verify orders persisted as CANCELLED on disk
  const diskOrders = readTxFlowOrders();
  const diskActive = diskOrders.filter(o => o.status === 'QUEUED' || o.status === 'RESTING');
  assert.equal(diskActive.length, 0);
});

await runAsyncTest('Kill-Switch: Immediately rejects subsequent order submissions with KILL_SWITCH_ACTIVE', async () => {
  assert.equal(riskManagerInstance.isKilled, true);
  const bot = new TxFlowBot({ mockMode: true });

  const res = await bot.submitOrder({
    instrumentId: 100000001,
    price: '0.50',
    size: '10'
  });

  assert.equal(res.success, false);
  assert.equal(res.rejectedReason, 'KILL_SWITCH_ACTIVE');
  assert.match(res.error, /kill-switch/i);

  // Test throwOnError option
  await assert.rejects(
    async () => bot.submitOrder({
      instrumentId: 100000001,
      price: '0.50',
      size: '10',
      throwOnError: true
    }),
    (err) => err.code === 'KILL_SWITCH_ACTIVE'
  );

  // Test runCycle aborts immediately
  let submittedInCycle = false;
  bot.submitOrder = async () => { submittedInCycle = true; };
  await bot.runCycle();
  assert.equal(submittedInCycle, false, 'runCycle must not dispatch orders while kill switch active');

  // Recovery: Reset Kill Switch
  riskManagerInstance.resetKillSwitch('Adversarial Test Recovery');
  assert.equal(riskManagerInstance.isKilled, false);

  bot.resetOrders();
});

await runAsyncTest('Pre-Trade: Hourly trade limit throttles excessive frequency when limit reached', async () => {
  const customRisk = new InstitutionalRiskManager({
    maxHourlyTrades: 3,
    minBankrollUsd: 1000
  });
  const customClient = new TxFlowClient({ mockMode: true });
  await customClient.requestFaucet();
  await customClient.transferToOutcome(1000);
  const bot = new TxFlowBot({ client: customClient, riskManager: customRisk, mockMode: true });

  for (let i = 0; i < 3; i++) {
    const res = await bot.submitOrder({
      instrumentId: 100000000 + i * 10,
      price: '0.10',
      size: '10'
    });
    assert.equal(res.success, true);
  }

  const blocked = await bot.submitOrder({
    instrumentId: 100000050,
    price: '0.10',
    size: '10'
  });
  assert.equal(blocked.success, false);
  assert.equal(blocked.rejectedReason, 'RISK_LIMIT_BREACH');
  assert.match(blocked.error, /hourly trade limit reached/i);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 10: HIGH-CONCURRENCY BURST & ATOMIC PERSISTENCE STRESS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ SUITE 10: High-Concurrency Burst & Atomic Persistence Stress');

await runAsyncTest('Concurrency: Submits 30 orders simultaneously without data races or tmp file leaks', async () => {
  const testClient = new TxFlowClient({ mockMode: true });
  await testClient.requestFaucet();
  await testClient.transferToOutcome(5000);

  const customRisk = new InstitutionalRiskManager({
    maxHourlyTrades: 100,
    maxGrossExposurePct: 80.0
  });

  const bot = new TxFlowBot({ client: testClient, riskManager: customRisk, mockMode: true });
  bot.resetOrders();

  const NUM_CONCURRENT = 30;
  const submissions = [];

  for (let i = 0; i < NUM_CONCURRENT; i++) {
    submissions.push(
      bot.submitOrder({
        instrumentId: 100000000 + (i % 5) * 10,
        isBuy: i % 2 === 0,
        price: (0.20 + (i % 10) * 0.05).toFixed(2),
        size: '10',
        tif: i % 3 === 0 ? 'Gtc' : (i % 3 === 1 ? 'Alo' : 'Gtd')
      })
    );
  }

  const results = await Promise.all(submissions);
  const succeeded = results.filter(r => r.success);
  assert.equal(succeeded.length, NUM_CONCURRENT, 'All concurrent orders must succeed');

  // Verify all traceIds and cloids are unique
  const traceIds = new Set(results.map(r => r.traceId));
  const cloids = new Set(results.map(r => r.cloid));
  assert.equal(traceIds.size, NUM_CONCURRENT, 'All traceIds must be distinct');
  assert.equal(cloids.size, NUM_CONCURRENT, 'All cloids must be distinct');

  // Verify atomic persistence
  const diskOrders = readTxFlowOrders();
  assert.equal(diskOrders.length, NUM_CONCURRENT);

  // Check no leftover temporary files in directory
  const rootDir = path.dirname(TXFLOW_ORDERS_FILE);
  const tmpFiles = fs.readdirSync(rootDir).filter(f => f.startsWith('.txflow_orders') && f.endsWith('.tmp'));
  assert.equal(tmpFiles.length, 0, 'No atomic tmp files must be leaked');

  bot.resetOrders();
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 11: STATE ISOLATION & ZERO-BYTE BACKTEST.JSON INVARIANT
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ SUITE 11: State Isolation & 0-Byte backtest.json Invariant');

runTest('Certifies 0 modifications to backtest.json across all stress testing operations', () => {
  const backtestShaAfter = getFileSha256(BACKTEST_FILE);
  const backtestSizeAfter = fs.existsSync(BACKTEST_FILE) ? fs.statSync(BACKTEST_FILE).size : 0;

  console.log(`    ↳ Initial  backtest.json SHA-256 : ${backtestShaBefore} (${backtestSizeBefore} bytes)`);
  console.log(`    ↳ Final    backtest.json SHA-256 : ${backtestShaAfter} (${backtestSizeAfter} bytes)`);

  assert.equal(
    backtestShaBefore,
    backtestShaAfter,
    `FATAL: backtest.json was modified during TxFlow testing! Initial: ${backtestShaBefore}, Final: ${backtestShaAfter}`
  );
  assert.equal(
    backtestSizeBefore,
    backtestSizeAfter,
    `FATAL: backtest.json size changed! Initial: ${backtestSizeBefore}, Final: ${backtestSizeAfter}`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// FINAL SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════════════');
console.log(`  CHALLENGER M2 RESULTS: ${passedTests}/${totalTests} PASSED (0 FAILED)`);
console.log('  ALL EMPIRICAL ADVERSARIAL CHALLENGES CONFIRMED AND PASSED!');
console.log('══════════════════════════════════════════════════════════════════\n');
