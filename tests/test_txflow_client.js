// ══════════════════════════════════════════════════════════════════════
//  tests/test_txflow_client.js — TxFlow Testnet (TIP 3) Test Suite
//  Milestone M5: Comprehensive Unit, Integration & Contract Certification
// ══════════════════════════════════════════════════════════════════════

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';

import {
  TXFLOW_DOMAIN,
  APPROVE_AGENT_TYPES,
  TRANSFER_TOKEN_TYPES,
  AGENT_ORDER_TYPES,
  SECP256K1_N,
  SECP256K1_HALF_N,
  normalizeLowS,
  computeConnectionId,
  encodeDeterministicMsgPack,
  decodeDeterministicMsgPack,
  signOrderPayload,
  TxFlowClient,
  txflowClientInstance
} from '../services/txflow_client.js';

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
  TXFLOW_ORDERS_FILE
} from '../engine/txflow_bot.js';

import {
  InstitutionalRiskManager,
  riskManagerInstance
} from '../engine/risk_manager.js';

import { clobStreamerInstance } from '../engine/clob_streamer.js';
import { handler, server } from '../server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKTEST_FILE = path.join(__dirname, '..', 'backtest.json');

// ─────────────────────────────────────────────────────────────────────────────
// STATE ISOLATION BASELINE: Verify backtest.json SHA-256
// ─────────────────────────────────────────────────────────────────────────────
const initialBacktestSha = fs.existsSync(BACKTEST_FILE)
  ? crypto.createHash('sha256').update(fs.readFileSync(BACKTEST_FILE)).digest('hex')
  : null;

// Snapshot existing txflow_orders.json to restore cleanly after test run
const initialTxFlowOrdersRaw = fs.existsSync(TXFLOW_ORDERS_FILE)
  ? fs.readFileSync(TXFLOW_ORDERS_FILE, 'utf8')
  : null;

// Test Runner Counters
let passedCount = 0;
let failedCount = 0;
const testStartMs = Date.now();

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ↳ Error: ${err.message}`);
    failedCount++;
    throw err;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ↳ Error: ${err.message}`);
    failedCount++;
    throw err;
  }
}

// In-process HTTP request simulator using standard Node http.IncomingMessage & http.ServerResponse
function simulateHttpRequest(handlerFn, { method = 'GET', url = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const reqSocket = new PassThrough();
    const resSocket = new PassThrough({ highWaterMark: 10 * 1024 * 1024 });

    const req = new http.IncomingMessage(reqSocket);
    req.url = url;
    req.method = method;
    req.headers = { host: 'localhost:3001', ...headers };

    const res = new http.ServerResponse(req);
    res.assignSocket(resSocket);

    const chunks = [];
    resSocket.on('data', (chunk) => chunks.push(chunk));

    res.on('finish', () => {
      setImmediate(() => {
        const fullBuffer = Buffer.concat(chunks);
        const str = fullBuffer.toString('utf8');
        const headerEnd = str.indexOf('\r\n\r\n');
        const bodyStr = headerEnd !== -1 ? str.slice(headerEnd + 4) : str;

        const resHeaders = res.getHeaders ? res.getHeaders() : {};
        let json = null;
        try {
          json = JSON.parse(bodyStr);
        } catch (_) {}

        resolve({
          status: res.statusCode,
          headers: resHeaders,
          body: bodyStr,
          json,
        });
      });
    });

    resSocket.on('error', reject);

    try {
      Promise.resolve(handlerFn(req, res)).catch(reject);
    } catch (e) {
      reject(e);
    }

    if (body !== null && body !== undefined) {
      const bStr = typeof body === 'string' ? body : JSON.stringify(body);
      req.push(Buffer.from(bStr));
    }
    req.push(null);
  });
}

console.log('══════════════════════════════════════════════════════════════════');
console.log('  RUNNING MILESTONE M5: TXFLOW TESTNET TIP 3 INTEGRATION SUITE');
console.log('  Target: services/txflow_client.js & engine/txflow_bot.js & server.js');
console.log('══════════════════════════════════════════════════════════════════\n');

// ─────────────────────────────────────────────────────────────────────────────
// TIER 1: FEATURE COVERAGE (>=5 tests per feature)
// ─────────────────────────────────────────────────────────────────────────────

// Feature 1: Deterministic MessagePack Map Key Insertion Order
console.log('[Tier 1: Feature 1] Deterministic MessagePack Map Key Insertion Order');

test('1.1: Preserves exact insertion order for reverse-alphabetical map keys', () => {
  const obj = {};
  obj.z = 100;
  obj.y = 200;
  obj.b = 300;
  obj.a = 400;

  const encoded = encodeDeterministicMsgPack(obj);
  assert.equal(encoded[0], 0x84, 'Expected fixmap with 4 entries');

  const decoded = decodeDeterministicMsgPack(encoded);
  assert.deepEqual(Object.keys(decoded), ['z', 'y', 'b', 'a'], 'Map keys must NOT be sorted alphabetically');
});

test('1.2: Preserves key order in deeply nested object maps', () => {
  const nested = {
    omega: {
      subZ: 99,
      subA: 11
    },
    alpha: {
      innerM: true,
      innerB: false
    }
  };
  const encoded = encodeDeterministicMsgPack(nested);
  const decoded = decodeDeterministicMsgPack(encoded);

  assert.deepEqual(Object.keys(decoded), ['omega', 'alpha']);
  assert.deepEqual(Object.keys(decoded.omega), ['subZ', 'subA']);
  assert.deepEqual(Object.keys(decoded.alpha), ['innerM', 'innerB']);
});

test('1.3: Preserves distinct key order across array of maps', () => {
  const arr = [
    { k2: 'v2', k1: 'v1' },
    { a: 1, z: 2 }
  ];
  const encoded = encodeDeterministicMsgPack(arr);
  const decoded = decodeDeterministicMsgPack(encoded);

  assert.deepEqual(Object.keys(decoded[0]), ['k2', 'k1']);
  assert.deepEqual(Object.keys(decoded[1]), ['a', 'z']);
});

test('1.4: Permutation determinism: repeated encoding produces 100% bit-identical hash', () => {
  const payload = { type: 'order', grouping: 'na', orders: [{ a: 100000001, b: true }] };
  const h1 = crypto.createHash('sha256').update(encodeDeterministicMsgPack(payload)).digest('hex');
  const h2 = crypto.createHash('sha256').update(encodeDeterministicMsgPack(payload)).digest('hex');
  assert.equal(h1, h2, 'Encoding must be strictly deterministic and idempotent');
});

test('1.5: Non-standard property keys ($tag, _id, @context) preserve exact sequence', () => {
  const weird = {
    _id: 'uuid-1',
    $schema: 'v1',
    '@context': 'https://schema.org',
    standard: true
  };
  const encoded = encodeDeterministicMsgPack(weird);
  const decoded = decodeDeterministicMsgPack(encoded);
  assert.deepEqual(Object.keys(decoded), ['_id', '$schema', '@context', 'standard']);
});

// Feature 2: Exact 77-byte Reference Vector Decode & Hex Fidelity
console.log('\n[Tier 1: Feature 2] Exact 77-Byte Reference Vector Decode & Hex Fidelity');

const TIP3_REF_ORDER = {
  type: 'order',
  orders: [
    {
      a: 100000001,
      b: true,
      p: '0.62',
      s: '100',
      r: false,
      t: {
        limit: {
          tif: 'Gtc'
        }
      }
    }
  ],
  grouping: 'na'
};
const EXPECTED_77_BYTE_HEX = '83a474797065a56f72646572a66f72646572739186a161ce05f5e101a162c3a170a4302e3632a173a3313030a172c2a17481a56c696d697481a3746966a3477463a867726f7570696e67a26e61';

test('2.1: Reference TIP 3 order produces exactly 77-byte binary output', () => {
  const encoded = encodeDeterministicMsgPack(TIP3_REF_ORDER);
  assert.equal(encoded.length, 77, `Expected 77 bytes, got ${encoded.length}`);
});

test('2.2: Reference TIP 3 order matches authoritative hex digest character-for-character', () => {
  const encoded = encodeDeterministicMsgPack(TIP3_REF_ORDER);
  assert.equal(encoded.toString('hex'), EXPECTED_77_BYTE_HEX);
});

test('2.3: Decoded reference vector is deeply equal to the original JavaScript object', () => {
  const buf = Buffer.from(EXPECTED_77_BYTE_HEX, 'hex');
  const decoded = decodeDeterministicMsgPack(buf);
  assert.deepEqual(decoded, TIP3_REF_ORDER);
});

test('2.4: Sub-fields preserve strict types: uint32 integer asset ID, booleans, string numbers', () => {
  const decoded = decodeDeterministicMsgPack(Buffer.from(EXPECTED_77_BYTE_HEX, 'hex'));
  assert.strictEqual(typeof decoded.orders[0].a, 'number');
  assert.strictEqual(decoded.orders[0].a, 100000001);
  assert.strictEqual(decoded.orders[0].b, true);
  assert.strictEqual(decoded.orders[0].p, '0.62');
  assert.strictEqual(decoded.orders[0].s, '100');
  assert.strictEqual(decoded.orders[0].r, false);
  assert.strictEqual(decoded.orders[0].t.limit.tif, 'Gtc');
});

test('2.5: Mutation sensitivity: any field modification changes byte length or hex digest', () => {
  const mutated = JSON.parse(JSON.stringify(TIP3_REF_ORDER));
  mutated.orders[0].b = false;
  const mutatedEncoded = encodeDeterministicMsgPack(mutated);
  assert.notEqual(mutatedEncoded.toString('hex'), EXPECTED_77_BYTE_HEX);
});

// Feature 3: TIP 3 Integer Asset ID Formatting
console.log('\n[Tier 1: Feature 3] TIP 3 Integer Asset ID Calculation');

test('3.1: Outcome 0 with numeric side 0 yields 100_000_000 (YES)', () => {
  assert.equal(calculateTip3AssetId(0, 0), 100000000);
});

test('3.2: Outcome 0 with numeric side 1 yields 100_000_001 (NO)', () => {
  assert.equal(calculateTip3AssetId(0, 1), 100000001);
});

test('3.3: Outcome 4 with string side "NO" yields 100_000_041', () => {
  assert.equal(calculateTip3AssetId(4, 'NO'), 100000041);
});

test('3.4: Outcome 9 with string side "YES" yields 100_000_090', () => {
  assert.equal(calculateTip3AssetId(9, 'YES'), 100000090);
});

test('3.5: Negative or invalid outcomeIndex defaults safely to 0 and returns positive integer', () => {
  const id1 = calculateTip3AssetId(-5, 0);
  const id2 = calculateTip3AssetId(null, undefined);
  assert.equal(id1, 100000000);
  assert.equal(id2, 100000000);
  assert.ok(Number.isInteger(id1) && id1 > 0);
});

// Feature 4: Dual-Tier Key Management
console.log('\n[Tier 1: Feature 4] Dual-Tier Institutional Key Management');

test('4.1: Separate Master Account Wallet and Agent Key Wallet generated with distinct addresses', () => {
  const client = new TxFlowClient({ mockMode: true });
  assert.ok(ethers.isAddress(client.masterWallet.address));
  assert.ok(ethers.isAddress(client.agentWallet.address));
  assert.notEqual(client.masterWallet.address, client.agentWallet.address);
});

await asyncTest('4.2: Master wallet can sign approveAgent typed structured data', async () => {
  const client = new TxFlowClient({ mockMode: true });
  const nonce = Date.now();
  const value = {
    txflowChain: 'Testnet',
    agentAddress: client.agentWallet.address,
    agentName: 'TestBot',
    nonce
  };
  const sig = await client.masterWallet.signTypedData(TXFLOW_DOMAIN, APPROVE_AGENT_TYPES, value);
  const recovered = ethers.verifyTypedData(TXFLOW_DOMAIN, APPROVE_AGENT_TYPES, value, sig);
  assert.equal(recovered.toLowerCase(), client.masterWallet.address.toLowerCase());
});

await asyncTest('4.3: Master wallet can sign tokenSend collateral transfer structured data', async () => {
  const client = new TxFlowClient({ mockMode: true });
  const value = {
    txflowChain: 'Testnet',
    fromSubAccount: 'perp',
    toSubAccount: 'outcome',
    token: 'USDC',
    amount: '500',
    nonce: Date.now()
  };
  const sig = await client.masterWallet.signTypedData(TXFLOW_DOMAIN, TRANSFER_TOKEN_TYPES, value);
  const recovered = ethers.verifyTypedData(TXFLOW_DOMAIN, TRANSFER_TOKEN_TYPES, value, sig);
  assert.equal(recovered.toLowerCase(), client.masterWallet.address.toLowerCase());
});

await asyncTest('4.4: Agent wallet can sign Agent typed structured data for order submission', async () => {
  const client = new TxFlowClient({ mockMode: true });
  const connectionId = '0x' + crypto.randomBytes(32).toString('hex');
  const value = { source: 'b', connectionId };
  const sig = await client.agentWallet.signTypedData(TXFLOW_DOMAIN, AGENT_ORDER_TYPES, value);
  const recovered = ethers.verifyTypedData(TXFLOW_DOMAIN, AGENT_ORDER_TYPES, value, sig);
  assert.equal(recovered.toLowerCase(), client.agentWallet.address.toLowerCase());
});

test('4.5: Custom private keys can be configured via constructor without collision', () => {
  const w1 = ethers.Wallet.createRandom();
  const w2 = ethers.Wallet.createRandom();
  const client = new TxFlowClient({
    masterPrivateKey: w1.privateKey,
    agentPrivateKey: w2.privateKey,
    mockMode: true
  });
  assert.equal(client.masterWallet.address, w1.address);
  assert.equal(client.agentWallet.address, w2.address);
});

// Feature 5: Canonical Low-S ECDSA Signing
console.log('\n[Tier 1: Feature 5] Canonical Low-S ECDSA Signing');

test('5.1: normalizeLowS enforces s <= N/2 for all natural signatures', () => {
  const testWallet = ethers.Wallet.createRandom();
  const rawSig = testWallet.signingKey.sign(crypto.randomBytes(32));
  const normalized = normalizeLowS(rawSig);
  assert.ok(BigInt(normalized.s) <= SECP256K1_HALF_N, 's must be <= N/2');
});

test('5.2: normalizeLowS enforces v in {27, 28}', () => {
  const testWallet = ethers.Wallet.createRandom();
  const rawSig = testWallet.signingKey.sign(crypto.randomBytes(32));
  const normalized = normalizeLowS(rawSig);
  assert.ok(normalized.v === 27 || normalized.v === 28, `v must be 27 or 28, got ${normalized.v}`);
});

test('5.3: Address recovery via ethers.recoverAddress matches signing wallet address exactly', () => {
  const testWallet = ethers.Wallet.createRandom();
  const digest = crypto.randomBytes(32);
  const rawSig = testWallet.signingKey.sign(digest);
  const normalized = normalizeLowS(rawSig);
  const recovered = ethers.recoverAddress(digest, normalized);
  assert.equal(recovered.toLowerCase(), testWallet.address.toLowerCase());
});

test('5.4: 10 distinct randomized wallets all produce verifiable low-S signatures', () => {
  for (let i = 0; i < 10; i++) {
    const w = ethers.Wallet.createRandom();
    const digest = crypto.randomBytes(32);
    const rawSig = w.signingKey.sign(digest);
    const normalized = normalizeLowS(rawSig);
    assert.ok(BigInt(normalized.s) <= SECP256K1_HALF_N);
    assert.equal(ethers.recoverAddress(digest, normalized).toLowerCase(), w.address.toLowerCase());
  }
});

test('5.5: Normalized signature r and s are zero-padded 32-byte (66-character 0x hex) strings', () => {
  const w = ethers.Wallet.createRandom();
  const rawSig = w.signingKey.sign(crypto.randomBytes(32));
  const normalized = normalizeLowS(rawSig);
  assert.ok(/^0x[0-9a-fA-F]{64}$/.test(normalized.r));
  assert.ok(/^0x[0-9a-fA-F]{64}$/.test(normalized.s));
});

// Feature 6: Agent Authorization Tracking
console.log('\n[Tier 1: Feature 6] Agent Authorization Tracking');

test('6.1: Initial isAgentApproved is false on fresh client', () => {
  const client = new TxFlowClient({ mockMode: true });
  assert.strictEqual(client.isAgentApproved, false);
});

await asyncTest('6.2: approveAgent() returns success: true, txHash, and target agentAddress', async () => {
  const client = new TxFlowClient({ mockMode: true });
  const res = await client.approveAgent('AutonomousAgent');
  assert.strictEqual(res.success, true);
  assert.ok(res.txHash && res.txHash.startsWith('0x'));
  assert.equal(res.agentAddress, client.agentWallet.address);
});

await asyncTest('6.3: Post-approval, client.isAgentApproved transitions to true', async () => {
  const client = new TxFlowClient({ mockMode: true });
  assert.strictEqual(client.isAgentApproved, false);
  await client.approveAgent();
  assert.strictEqual(client.isAgentApproved, true);
});

await asyncTest('6.4: client.getStatus() reflects isAgentApproved: true', async () => {
  const client = new TxFlowClient({ mockMode: true });
  await client.approveAgent();
  const status = client.getStatus();
  assert.strictEqual(status.isAgentApproved, true);
});

await asyncTest('6.5: approveAgent action payload includes correct types and Low-S signature', async () => {
  const client = new TxFlowClient({ mockMode: true });
  const res = await client.approveAgent('ValidatorBot');
  assert.equal(res.action.type, 'approveAgent');
  assert.equal(res.action.txflowChain, 'Testnet');
  assert.equal(res.action.agentName, 'ValidatorBot');
  assert.ok(BigInt(res.signature.s) <= SECP256K1_HALF_N);
});

// Feature 7: Testnet Faucet Client
console.log('\n[Tier 1: Feature 7] Testnet Faucet Client (POST /request-fund)');

await asyncTest('7.1: requestFaucet() credits +1000 USDC to perpBalanceUsd', async () => {
  const client = new TxFlowClient({ mockMode: true });
  assert.equal(client.perpBalanceUsd, 0);
  const res = await client.requestFaucet();
  assert.strictEqual(res.success, true);
  assert.equal(client.perpBalanceUsd, 1000);
});

await asyncTest('7.2: Returns expected receipt: amount 1000.0, subAccount perp, and txHash', async () => {
  const client = new TxFlowClient({ mockMode: true });
  const res = await client.requestFaucet();
  assert.equal(res.amount, '1000.0');
  assert.equal(res.subAccount, 'perp');
  assert.ok(res.txHash.startsWith('0x'));
});

await asyncTest('7.3: Multiple consecutive faucet requests increment perpBalanceUsd and totalFaucetReceived cumulatively', async () => {
  const client = new TxFlowClient({ mockMode: true });
  await client.requestFaucet();
  await client.requestFaucet();
  await client.requestFaucet();
  assert.equal(client.perpBalanceUsd, 3000);
  assert.equal(client.totalFaucetReceived, 3000);
});

await asyncTest('7.4: Invalid address passed to requestFaucet throws descriptive error', async () => {
  const client = new TxFlowClient({ mockMode: true });
  await assert.rejects(
    async () => {
      await client.requestFaucet('0xNotAnAddress');
    },
    /Invalid Ethereum address/
  );
});

await asyncTest('7.5: Status reflects updated perpBalanceUsd and totalFaucetReceived', async () => {
  const client = new TxFlowClient({ mockMode: true });
  await client.requestFaucet();
  const st = client.getStatus();
  assert.equal(st.perpBalanceUsd, 1000);
  assert.equal(st.totalFaucetReceived, 1000);
});


// Feature 8: Sub-Account Collateral Rebalancing (perp -> outcome)
console.log('\n[Tier 1: Feature 8] Sub-Account Collateral Rebalancing (perp -> outcome)');

await asyncTest('8.1: transferToOutcome(500) decrements perp and increments outcome atomically', async () => {
  const client = new TxFlowClient({ mockMode: true });
  await client.requestFaucet();
  assert.equal(client.perpBalanceUsd, 1000);
  assert.equal(client.outcomeBalanceUsd, 0);

  const res = await client.transferToOutcome(500);
  assert.strictEqual(res.success, true);
  assert.equal(client.perpBalanceUsd, 500);
  assert.equal(client.outcomeBalanceUsd, 500);
});

await asyncTest('8.2: Returns expected transfer receipt format', async () => {
  const client = new TxFlowClient({ mockMode: true });
  await client.requestFaucet();
  const res = await client.transferToOutcome(250);
  assert.equal(res.amount, '250');
  assert.equal(res.fromSubAccount, 'perp');
  assert.equal(res.toSubAccount, 'outcome');
  assert.ok(res.txHash.startsWith('0x'));
});

await asyncTest('8.3: Action payload matches tokenSend schema with correct values', async () => {
  const client = new TxFlowClient({ mockMode: true });
  await client.requestFaucet();
  const res = await client.transferToOutcome(100);
  assert.equal(res.action.type, 'tokenSend');
  assert.equal(res.action.fromSubAccount, 'perp');
  assert.equal(res.action.toSubAccount, 'outcome');
  assert.equal(res.action.token, 'USDC');
  assert.equal(res.action.amount, '100');
});

await asyncTest('8.4: Master wallet signature is attached and valid Low-S format', async () => {
  const client = new TxFlowClient({ mockMode: true });
  await client.requestFaucet();
  const res = await client.transferToOutcome(300);
  assert.ok(BigInt(res.signature.s) <= SECP256K1_HALF_N);
  assert.ok(res.signature.v === 27 || res.signature.v === 28);
});

await asyncTest('8.5: Status reflects updated balances in both perpBalanceUsd and outcomeBalanceUsd', async () => {
  const client = new TxFlowClient({ mockMode: true });
  await client.requestFaucet();
  await client.transferToOutcome(400);
  const st = client.getStatus();
  assert.equal(st.perpBalanceUsd, 600);
  assert.equal(st.outcomeBalanceUsd, 400);
});

// Feature 9: Time-In-Force (TIF) Options & 128-bit Hex cloid
console.log('\n[Tier 1: Feature 9] Time-In-Force (TIF) Options & 128-bit Hex cloid');

test('9.1: normalizeTif canonicalizes Gtc case-insensitively', () => {
  assert.equal(normalizeTif('gtc'), 'Gtc');
  assert.equal(normalizeTif('GTC'), 'Gtc');
  assert.equal(normalizeTif('Gtc'), 'Gtc');
});

test('9.2: normalizeTif canonicalizes Alo case-insensitively', () => {
  assert.equal(normalizeTif('alo'), 'Alo');
  assert.equal(normalizeTif('ALO'), 'Alo');
  assert.equal(normalizeTif('Alo'), 'Alo');
});

test('9.3: normalizeTif canonicalizes Gtd case-insensitively', () => {
  assert.equal(normalizeTif('gtd'), 'Gtd');
  assert.equal(normalizeTif('GTD'), 'Gtd');
  assert.equal(normalizeTif('Gtd'), 'Gtd');
});

test('9.4: normalizeTif defaults invalid or empty input safely to Gtc', () => {
  assert.equal(normalizeTif(''), 'Gtc');
  assert.equal(normalizeTif(null), 'Gtc');
  assert.equal(normalizeTif('UNKNOWN_TIF'), 'Gtc');
});

test('9.5: generateCloid produces valid 128-bit hex string certified by validateCloid', () => {
  for (let i = 0; i < 20; i++) {
    const cloid = generateCloid();
    assert.equal(cloid.length, 34);
    assert.ok(cloid.startsWith('0x'));
    assert.strictEqual(validateCloid(cloid), true);
  }
  assert.strictEqual(validateCloid('0x123'), false);
  assert.strictEqual(validateCloid('invalid_non_hex'), false);
  assert.strictEqual(validateCloid(null), false);
});

// Feature 10: Order Placement Action Building & traceId Capture
console.log('\n[Tier 1: Feature 10] Order Placement Action Building & traceId Capture');

test('10.1: buildOrderAction formats order object conforming to TIP 3 schema', () => {
  const action = buildOrderAction({
    assetId: 100000001,
    isBuy: true,
    price: '0.55',
    size: '100',
    tif: 'Alo',
    cloid: '0x11112222333344445555666677778888',
    reduceOnly: false
  });
  assert.equal(action.type, 'order');
  assert.equal(action.grouping, 'na');
  assert.equal(action.orders.length, 1);
  const ord = action.orders[0];
  assert.equal(ord.a, 100000001);
  assert.equal(ord.b, true);
  assert.equal(ord.p, '0.55');
  assert.equal(ord.s, '100');
  assert.equal(ord.r, false);
  assert.equal(ord.t.limit.tif, 'Alo');
  assert.equal(ord.c, '0x11112222333344445555666677778888');
});

await asyncTest('10.2: signOrder returns complete signing package with connectionId and msgpackHex', async () => {
  const bot = new TxFlowBot({ mockMode: true });
  const signed = await bot.signOrder({
    instrumentId: 100000001,
    isBuy: true,
    price: '0.50',
    size: '10'
  });
  assert.ok(signed.action);
  assert.ok(signed.nonce > 0);
  assert.ok(signed.signature.r.startsWith('0x'));
  assert.ok(signed.signature.s.startsWith('0x'));
  assert.ok(signed.msgpackHex.length > 0);
  assert.ok(signed.connectionId.startsWith('0x'));
  assert.equal(signed.assetId, 100000001);
  assert.ok(validateCloid(signed.cloid));
});

await asyncTest('10.3: submitOrder returns success, traceId, cloid, and QUEUED status', async () => {
  const bot = new TxFlowBot({ mockMode: true });
  const res = await bot.submitOrder({
    instrumentId: 100000001,
    isBuy: true,
    price: '0.60',
    size: '50'
  });
  assert.strictEqual(res.success, true);
  assert.ok(res.traceId && res.traceId.startsWith('0x'));
  assert.ok(res.cloid && res.cloid.startsWith('0x'));
  assert.equal(res.status, 'QUEUED');
});

await asyncTest('10.4: submitOrder records order in memory and updates stats', async () => {
  const bot = new TxFlowBot({ mockMode: true });
  const countBefore = bot.orders.length;
  await bot.submitOrder({
    instrumentId: 100000001,
    isBuy: true,
    price: '0.60',
    size: '20'
  });
  assert.equal(bot.orders.length, countBefore + 1);
  assert.ok(bot.stats.totalSubmitted >= 1);
});

await asyncTest('10.5: order_queued event is emitted upon submission', async () => {
  const bot = new TxFlowBot({ mockMode: true });
  let emitted = false;
  bot.once('order_queued', (evt) => {
    assert.ok(evt.traceId);
    assert.ok(evt.cloid);
    emitted = true;
  });
  await bot.submitOrder({
    instrumentId: 100000002,
    isBuy: false,
    price: '0.40',
    size: '15'
  });
  assert.strictEqual(emitted, true);
});

// Feature 11: Order Cancellation by orderId and cloid
console.log('\n[Tier 1: Feature 11] Order Cancellation by orderId and cloid');

test('11.1: buildCancelAction formats cancel object with a and o when orderId is provided', () => {
  const act = buildCancelAction({ assetId: 100000001, orderId: 4421 });
  assert.equal(act.type, 'cancel');
  assert.deepEqual(act.cancels, [{ a: 100000001, o: 4421 }]);
});

test('11.2: buildCancelAction formats cancelByCloid object when cloid is provided', () => {
  const cloid = generateCloid();
  const act = buildCancelAction({ assetId: 100000001, cloid });
  assert.equal(act.type, 'cancelByCloid');
  assert.deepEqual(act.cancels, [{ asset: 100000001, cloid }]);
});

await asyncTest('11.3: cancelOrder({ cloid }) marks matching order as CANCELLED', async () => {
  const bot = new TxFlowBot({ mockMode: true });
  const sub = await bot.submitOrder({
    instrumentId: 100000001,
    isBuy: true,
    price: '0.50',
    size: '10'
  });
  const cancelRes = await bot.cancelOrder({ cloid: sub.cloid });
  assert.strictEqual(cancelRes.success, true);
  assert.ok(cancelRes.canceledCount >= 1);
  const found = bot.orders.find(o => o.cloid === sub.cloid);
  assert.equal(found.status, 'CANCELLED');
  assert.ok(found.cancelledAt);
});

await asyncTest('11.4: cancelOrder({ orderId }) marks matching order as CANCELLED', async () => {
  const bot = new TxFlowBot({ mockMode: true });
  const sub = await bot.submitOrder({
    instrumentId: 100000001,
    isBuy: true,
    price: '0.50',
    size: '10'
  });
  const cancelRes = await bot.cancelOrder({ orderId: sub.orderId });
  assert.strictEqual(cancelRes.success, true);
  const found = bot.orders.find(o => o.orderId === sub.orderId);
  assert.equal(found.status, 'CANCELLED');
});

await asyncTest('11.5: cancelAllOrders cancels all active QUEUED and RESTING orders', async () => {
  const bot = new TxFlowBot({ mockMode: true });
  await bot.submitOrder({ instrumentId: 100000001, isBuy: true, price: '0.50', size: '10' });
  await bot.submitOrder({ instrumentId: 100000002, isBuy: true, price: '0.45', size: '10' });
  const cancelAllRes = await bot.cancelAllOrders('Bulk cancellation test');
  assert.strictEqual(cancelAllRes.success, true);
  const activeOrders = bot.orders.filter(o => o.status === 'QUEUED' || o.status === 'RESTING');
  assert.equal(activeOrders.length, 0);
});

// Feature 12: Dual WebSocket Streams Message Tracking & Status Transitions
console.log('\n[Tier 1: Feature 12] Dual WebSocket Streams Message Tracking & Status Transitions');

test('12.1: connectWebSockets() in mock mode sets apiWsConnected and wsConnected to true', () => {
  const bot = new TxFlowBot({ mockMode: true });
  bot.connectWebSockets();
  assert.strictEqual(bot.apiWsConnected, true);
  assert.strictEqual(bot.wsConnected, true);
  bot.disconnectWebSockets();
});

await asyncTest('12.2: Mock mode auto-transitions submitted order from QUEUED to RESTING after delay', async () => {
  const bot = new TxFlowBot({ mockMode: true });
  const sub = await bot.submitOrder({
    instrumentId: 100000001,
    isBuy: true,
    price: '0.52',
    size: '10'
  });
  assert.equal(sub.status, 'QUEUED');
  await new Promise(r => setTimeout(r, 25));
  const found = bot.orders.find(o => o.traceId === sub.traceId);
  assert.equal(found.status, 'RESTING');
});

await asyncTest('12.3: _handleApiWsMessage transitions order to REJECTED on queue error', async () => {
  const bot = new TxFlowBot({ mockMode: true });
  const sub = await bot.submitOrder({
    instrumentId: 100000001,
    isBuy: true,
    price: '0.52',
    size: '10'
  });
  bot._handleApiWsMessage(Buffer.from(JSON.stringify({
    channel: 'outcomeOrderUpdate',
    data: {
      traceId: sub.traceId,
      error: 'DelayQueue: Insufficient gas/collateral'
    }
  })));
  const found = bot.orders.find(o => o.traceId === sub.traceId);
  assert.equal(found.status, 'REJECTED');
  assert.equal(found.cancelReason, 'DelayQueue: Insufficient gas/collateral');
});

await asyncTest('12.4: _handleWsMessage transitions order to FILLED with filledSz and avgPx', async () => {
  const bot = new TxFlowBot({ mockMode: true });
  const sub = await bot.submitOrder({
    instrumentId: 100000001,
    isBuy: true,
    price: '0.52',
    size: '50'
  });
  bot._handleWsMessage(Buffer.from(JSON.stringify({
    channel: 'outcomeOrderUpdates',
    data: {
      cloid: sub.cloid,
      oid: sub.orderId,
      status: 'FILLED',
      filledSz: '50',
      remainingSz: '0',
      avgPx: '0.52'
    }
  })));
  const found = bot.orders.find(o => o.cloid === sub.cloid);
  assert.equal(found.status, 'FILLED');
  assert.equal(found.filledSz, '50');
  assert.equal(found.avgPx, '0.52');
});

test('12.5: disconnectWebSockets() cleans up sockets and resets connection flags', () => {
  const bot = new TxFlowBot({ mockMode: true });
  bot.connectWebSockets();
  assert.strictEqual(bot.wsConnected, true);
  bot.disconnectWebSockets();
  assert.strictEqual(bot.apiWsConnected, false);
  assert.strictEqual(bot.wsConnected, false);
});

// Feature 13: Express REST API Endpoints (/api/v1/txflow/*)
console.log('\n[Tier 1: Feature 13] Express REST API Endpoints (/api/v1/txflow/*)');

await asyncTest('13.1: POST /api/v1/txflow/faucet credits funds and returns HTTP 200 JSON', async () => {
  const res = await simulateHttpRequest(handler, {
    method: 'POST',
    url: '/api/v1/txflow/faucet',
    body: {}
  });
  assert.equal(res.status, 200);
  assert.strictEqual(res.json.success, true);
  assert.equal(res.json.amount, '1000.0');
  assert.equal(res.json.subAccount, 'perp');
});

await asyncTest('13.2: GET /api/v1/txflow/status returns HTTP 200 with combined client and bot state', async () => {
  const res = await simulateHttpRequest(handler, {
    method: 'GET',
    url: '/api/v1/txflow/status'
  });
  assert.equal(res.status, 200);
  assert.strictEqual(res.json.success, true);
  assert.ok(res.json.client !== undefined);
  assert.ok(res.json.bot !== undefined);
  assert.ok(ethers.isAddress(res.json.masterAddress));
});

await asyncTest('13.3: POST /api/v1/txflow/transfer with valid amount returns HTTP 200 JSON', async () => {
  // Ensure perp balance exists via faucet claim
  await simulateHttpRequest(handler, { method: 'POST', url: '/api/v1/txflow/faucet', body: {} });
  const res = await simulateHttpRequest(handler, {
    method: 'POST',
    url: '/api/v1/txflow/transfer',
    body: { amount: 200 }
  });
  assert.equal(res.status, 200);
  assert.strictEqual(res.json.success, true);
  assert.equal(res.json.amount, '200');
  assert.equal(res.json.fromSubAccount, 'perp');
  assert.equal(res.json.toSubAccount, 'outcome');
});

await asyncTest('13.4: POST /api/v1/txflow/order submits order and returns HTTP 200 JSON with traceId', async () => {
  const res = await simulateHttpRequest(handler, {
    method: 'POST',
    url: '/api/v1/txflow/order',
    body: {
      instrumentId: 100000001,
      isBuy: true,
      price: '0.55',
      size: '25',
      tif: 'Gtc'
    }
  });
  assert.equal(res.status, 200);
  assert.strictEqual(res.json.success, true);
  assert.ok(res.json.traceId);
  assert.ok(res.json.cloid);
});

await asyncTest('13.5: POST /api/v1/txflow/cancel returns HTTP 200 JSON with canceledCount', async () => {
  // Submit an order to cancel
  const ordRes = await simulateHttpRequest(handler, {
    method: 'POST',
    url: '/api/v1/txflow/order',
    body: { instrumentId: 100000001, isBuy: true, price: '0.55', size: '10' }
  });
  const res = await simulateHttpRequest(handler, {
    method: 'POST',
    url: '/api/v1/txflow/cancel',
    body: { cloid: ordRes.json.cloid }
  });
  assert.equal(res.status, 200);
  assert.strictEqual(res.json.success, true);
  assert.ok(res.json.canceledCount >= 1);
});

await asyncTest('13.6: GET /api/v1/txflow/markets returns HTTP 200 JSON with active prediction markets', async () => {
  const res = await simulateHttpRequest(handler, {
    method: 'GET',
    url: '/api/v1/txflow/markets'
  });
  assert.equal(res.status, 200);
  assert.strictEqual(res.json.success, true);
  assert.ok(Array.isArray(res.json.markets));
  assert.ok(res.json.markets.length >= 2);
});

// Feature 14: Frontend Contract Conformance
console.log('\n[Tier 1: Feature 14] Frontend Contract Conformance (TradingContext.jsx & api.js)');

await asyncTest('14.1: Status schema matches TradingContext.jsx consumption properties', async () => {
  const res = await simulateHttpRequest(handler, {
    method: 'GET',
    url: '/api/v1/txflow/status'
  });
  const data = res.json;
  assert.strictEqual(typeof data.connected, 'boolean');
  assert.strictEqual(typeof data.chainId, 'number');
  assert.ok(data.masterAddress !== undefined);
  assert.ok(data.agentAddress !== undefined);
  assert.strictEqual(typeof data.isAgentApproved, 'boolean');
  assert.strictEqual(typeof data.perpBalanceUsd, 'number');
  assert.strictEqual(typeof data.outcomeBalanceUsd, 'number');
  assert.strictEqual(typeof data.openOrdersCount, 'number');
  assert.ok(Array.isArray(data.recentOrders));
  assert.strictEqual(typeof data.stats, 'object');
});

await asyncTest('14.2: Faucet claim schema matches claimTxFlowFaucet expectations', async () => {
  const res = await simulateHttpRequest(handler, {
    method: 'POST',
    url: '/api/v1/txflow/faucet',
    body: {}
  });
  assert.strictEqual(res.json.success, true);
  assert.ok(res.json.txHash);
  assert.ok(res.json.amount);
});

await asyncTest('14.3: Transfer schema matches transferTxFlowCollateral expectations', async () => {
  const res = await simulateHttpRequest(handler, {
    method: 'POST',
    url: '/api/v1/txflow/transfer',
    body: { amount: 50 }
  });
  assert.strictEqual(res.json.success, true);
  assert.ok(res.json.txHash);
  assert.equal(res.json.amount, '50');
});

await asyncTest('14.4: Order submission schema matches submitTxFlowOrder expectations', async () => {
  const res = await simulateHttpRequest(handler, {
    method: 'POST',
    url: '/api/v1/txflow/order',
    body: { instrumentId: 100000001, isBuy: true, price: '0.50', size: '20' }
  });
  assert.strictEqual(res.json.success, true);
  assert.ok(res.json.traceId);
  assert.ok(res.json.cloid);
});

await asyncTest('14.5: Markets schema matches fetchTxFlowMarkets expectations', async () => {
  const res = await simulateHttpRequest(handler, {
    method: 'GET',
    url: '/api/v1/txflow/markets'
  });
  assert.strictEqual(res.json.success, true);
  assert.ok(Array.isArray(res.json.markets));
  for (const m of res.json.markets) {
    assert.ok(typeof m.instrumentId === 'number');
    assert.ok(typeof m.marketId === 'string');
    assert.ok(Array.isArray(m.outcomes));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TIER 2: BOUNDARY & CORNER CASES (>=8 categories)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[Tier 2: Boundary & Corner Cases] Comprehensive Edge Conditions');

await asyncTest('Tier 2.1: Transfer amount exceeding perp balance is strictly rejected with zero balance change', async () => {
  const client = new TxFlowClient({ mockMode: true });
  await client.requestFaucet(); // 1,000 perp
  const perpBefore = client.perpBalanceUsd;
  const outcomeBefore = client.outcomeBalanceUsd;

  const res = await client.transferToOutcome(999999);
  assert.strictEqual(res.success, false);
  assert.match(res.error, /Insufficient perp balance/);
  assert.equal(client.perpBalanceUsd, perpBefore);
  assert.equal(client.outcomeBalanceUsd, outcomeBefore);
});

await asyncTest('Tier 2.2: Zero, negative, and NaN transfer amounts are gracefully rejected', async () => {
  const client = new TxFlowClient({ mockMode: true });
  await client.requestFaucet();

  const r0 = await client.transferToOutcome(0);
  assert.strictEqual(r0.success, false);
  assert.match(r0.error, /Invalid transfer amount/);

  const rNeg = await client.transferToOutcome(-50);
  assert.strictEqual(rNeg.success, false);
  assert.match(rNeg.error, /Invalid transfer amount/);

  const rNaN = await client.transferToOutcome('not_a_number');
  assert.strictEqual(rNaN.success, false);
  assert.match(rNaN.error, /Invalid transfer amount/);
});

await asyncTest('Tier 2.3: Conservation of capital assertion across multiple faucets and rebalances', async () => {
  const client = new TxFlowClient({ mockMode: true });
  await client.requestFaucet(); // 1000
  await client.requestFaucet(); // 2000
  await client.requestFaucet(); // 3000

  await client.transferToOutcome(500);
  await client.transferToOutcome(750);
  await client.transferToOutcome(250);

  const totalCurrent = client.perpBalanceUsd + client.outcomeBalanceUsd;
  assert.equal(totalCurrent, client.totalFaucetReceived, 'Conservation of capital breached!');
  assert.equal(totalCurrent, 3000);
  assert.equal(client.outcomeBalanceUsd, 1500);
  assert.equal(client.perpBalanceUsd, 1500);
});

test('Tier 2.4: High-S synthetic signature normalization flips s = N - s and inverts recovery byte v', () => {
  // Construct synthetic signature where s > N/2
  const r = '0x' + crypto.randomBytes(32).toString('hex');
  const highS = SECP256K1_HALF_N + 500n;
  const highSSig = {
    r,
    s: '0x' + highS.toString(16).padStart(64, '0'),
    v: 27
  };

  const normalized = normalizeLowS(highSSig);
  const expectedLowS = SECP256K1_N - highS;
  assert.equal(BigInt(normalized.s), expectedLowS, 's must equal N - highS');
  assert.ok(BigInt(normalized.s) <= SECP256K1_HALF_N, 'normalized s must be <= N/2');
  assert.equal(normalized.v, 28, 'recovery id v must invert 27 -> 28 on high-S normalization');
});

test('Tier 2.5: Numeric integer boundaries in MessagePack (uint8, uint16, uint32, int8, int16, int32, negative fixints)', () => {
  const boundaries = [
    0, 1, 127, 128, 255, 256, 65535, 65536,
    100000001, 4294967295,
    -1, -32, -33, -128, -129, -32768, -32769, -2147483648
  ];
  for (const num of boundaries) {
    const enc = encodeDeterministicMsgPack(num);
    const dec = decodeDeterministicMsgPack(enc);
    assert.strictEqual(dec, num, `Boundary integer roundtrip failed for ${num}`);
  }
});

await asyncTest('Tier 2.6: Order boundary conditions: price <= 0, price >= 1, size <= 0 strictly rejected', async () => {
  const bot = new TxFlowBot({ mockMode: true });

  const rLowPx = await bot.submitOrder({ instrumentId: 100000001, isBuy: true, price: '0.00', size: '10' });
  assert.strictEqual(rLowPx.success, false);
  assert.equal(rLowPx.rejectedReason, 'INVALID_PRICE');

  const rHighPx = await bot.submitOrder({ instrumentId: 100000001, isBuy: true, price: '1.00', size: '10' });
  assert.strictEqual(rHighPx.success, false);
  assert.equal(rHighPx.rejectedReason, 'INVALID_PRICE');

  const rZeroSz = await bot.submitOrder({ instrumentId: 100000001, isBuy: true, price: '0.50', size: '0' });
  assert.strictEqual(rZeroSz.success, false);
  assert.equal(rZeroSz.rejectedReason, 'INVALID_SIZE');
});

await asyncTest('Tier 2.7: Malformed JSON body in server endpoints returns HTTP 400 JSON', async () => {
  const resFaucet = await simulateHttpRequest(handler, {
    method: 'POST',
    url: '/api/v1/txflow/faucet',
    body: '{ malformed json payload'
  });
  assert.equal(resFaucet.status, 400);
  assert.strictEqual(resFaucet.json.success, false);

  const resTransfer = await simulateHttpRequest(handler, {
    method: 'POST',
    url: '/api/v1/txflow/transfer',
    body: '<<<not json>>>'
  });
  assert.equal(resTransfer.status, 400);
  assert.strictEqual(resTransfer.json.success, false);
});

await asyncTest('Tier 2.8: Unknown /api/v1/txflow/* route cleanly returns HTTP 404 JSON, NEVER HTML', async () => {
  const res = await simulateHttpRequest(handler, {
    method: 'GET',
    url: '/api/v1/txflow/unknown_subroute_xyz'
  });
  assert.equal(res.status, 404);
  assert.strictEqual(res.json?.success, false);
  assert.equal(res.json?.error, 'Not found');
});


// ─────────────────────────────────────────────────────────────────────────────
// TIER 3: CROSS-FEATURE COMBINATIONS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[Tier 3: Cross-Feature Combinations] Concurrency, Lifecycles & State Isolation');

await asyncTest('Tier 3.1: Concurrent transfer requests verifying atomic debit and zero overdraft', async () => {
  const client = new TxFlowClient({ mockMode: true });
  await client.requestFaucet(); // 1,000 perp
  assert.equal(client.perpBalanceUsd, 1000);

  // Dispatch 5 concurrent transfers of 300 USDC each (total requested: 1,500 USDC)
  const transferPromises = [
    client.transferToOutcome(300),
    client.transferToOutcome(300),
    client.transferToOutcome(300),
    client.transferToOutcome(300),
    client.transferToOutcome(300)
  ];
  const results = await Promise.all(transferPromises);

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  assert.equal(successful.length, 3, 'Exactly 3 transfers of 300 should succeed out of 1000 balance');
  assert.equal(failed.length, 2, 'Exactly 2 transfers should fail due to insufficient balance');
  assert.equal(client.outcomeBalanceUsd, 900);
  assert.equal(client.perpBalanceUsd, 100);
  assert.equal(client.perpBalanceUsd + client.outcomeBalanceUsd, 1000, 'Zero overdraft invariant certified');
});

await asyncTest('Tier 3.2: Full trading lifecycle: Faucet -> Approve Agent -> Rebalance -> Sign Order -> Dispatch -> Resting -> Filled', async () => {
  const client = new TxFlowClient({ mockMode: true });
  const bot = new TxFlowBot({ client, mockMode: true });

  // 1. Faucet
  const faucetRes = await client.requestFaucet();
  assert.strictEqual(faucetRes.success, true);
  assert.equal(client.perpBalanceUsd, 1000);

  // 2. Approve Agent
  const approveRes = await client.approveAgent('InstitutionalLifecycleAgent');
  assert.strictEqual(approveRes.success, true);
  assert.strictEqual(client.isAgentApproved, true);

  // 3. Rebalance Perp -> Outcome
  const rebalanceRes = await client.transferToOutcome(500);
  assert.strictEqual(rebalanceRes.success, true);
  assert.equal(client.outcomeBalanceUsd, 500);

  // 4. Sign and Submit Order
  const submitRes = await bot.submitOrder({
    instrumentId: 100000001,
    isBuy: true,
    price: '0.62',
    size: '100',
    tif: 'Gtc'
  });
  assert.strictEqual(submitRes.success, true);
  assert.equal(submitRes.status, 'QUEUED');
  assert.ok(submitRes.traceId);

  // 5. Transition to RESTING (simulated gateway matching)
  bot._handleApiWsMessage(Buffer.from(JSON.stringify({
    channel: 'outcomeOrderUpdate',
    data: {
      traceId: submitRes.traceId,
      status: 'resting'
    }
  })));
  let orderRecord = bot.orders.find(o => o.traceId === submitRes.traceId);
  assert.equal(orderRecord.status, 'RESTING');

  // 6. Transition to FILLED (matching engine execution)
  bot._handleWsMessage(Buffer.from(JSON.stringify({
    channel: 'outcomeOrderUpdates',
    data: {
      cloid: submitRes.cloid,
      oid: submitRes.orderId,
      status: 'FILLED',
      filledSz: '100',
      remainingSz: '0',
      avgPx: '0.62'
    }
  })));
  orderRecord = bot.orders.find(o => o.traceId === submitRes.traceId);
  assert.equal(orderRecord.status, 'FILLED');
  assert.equal(orderRecord.filledSz, '100');
  assert.equal(orderRecord.avgPx, '0.62');
});

await asyncTest('Tier 3.3: Emergency Kill-Switch pre-trade check (HTTP 403) and auto-cancellation of open orders', async () => {
  const rm = riskManagerInstance;
  const bot = txflowBotInstance;

  // Submit active order prior to kill switch
  const initialOrder = await bot.submitOrder({
    instrumentId: 100000001,
    isBuy: true,
    price: '0.50',
    size: '10'
  });
  assert.strictEqual(initialOrder.success, true);

  // Trigger emergency kill-switch
  rm.triggerKillSwitch('Emergency Drill: Market Anomaly');
  assert.strictEqual(rm.isKilled, true);

  // Verify server rejects subsequent order with HTTP 403
  const rejectedRes = await simulateHttpRequest(handler, {
    method: 'POST',
    url: '/api/v1/txflow/order',
    body: {
      instrumentId: 100000001,
      isBuy: true,
      price: '0.50',
      size: '10'
    }
  });
  assert.equal(rejectedRes.status, 403);
  assert.match(rejectedRes.json.error, /Emergency Kill-Switch is active/);

  // Verify active orders were auto-cancelled
  const activeOrders = bot.orders.filter(o => o.status === 'QUEUED' || o.status === 'RESTING');
  assert.equal(activeOrders.length, 0);

  // Reset kill-switch
  rm.resetKillSwitch('Automated Test Suite');
  assert.strictEqual(rm.isKilled, false);
});

test('Tier 3.4: State isolation assertion: verify backtest.json is completely untouched', () => {
  if (initialBacktestSha) {
    const currentSha = crypto.createHash('sha256').update(fs.readFileSync(BACKTEST_FILE)).digest('hex');
    assert.equal(currentSha, initialBacktestSha, 'State isolation breach: backtest.json was modified by TxFlow tests!');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TIER 4: REAL-WORLD APPLICATION SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[Tier 4: Real-World Application Scenarios] End-to-End Institutional Workflows');

await asyncTest('Tier 4.1: Scenario 1 — Institutional Onboarding & Initial Capital Allocation', async () => {
  const client = new TxFlowClient({ mockMode: true });
  assert.strictEqual(client.isAgentApproved, false);
  assert.equal(client.perpBalanceUsd, 0);

  // 1. Institutional Faucet Claim
  const fRes = await client.requestFaucet();
  assert.strictEqual(fRes.success, true);

  // 2. Authorize Dedicated Autonomous Execution Agent
  const aRes = await client.approveAgent('AlphaExecutionBot');
  assert.strictEqual(aRes.success, true);
  assert.strictEqual(client.isAgentApproved, true);

  // 3. Rebalance Collateral from Perp to Outcome Market Account
  const tRes = await client.transferToOutcome(750);
  assert.strictEqual(tRes.success, true);
  assert.equal(client.outcomeBalanceUsd, 750);
  assert.equal(client.perpBalanceUsd, 250);

  // 4. Validate Combined Institutional Telemetry
  const status = client.getStatus();
  assert.strictEqual(status.connected, true);
  assert.strictEqual(status.isAgentApproved, true);
  assert.equal(status.perpBalanceUsd, 250);
  assert.equal(status.outcomeBalanceUsd, 750);
});

await asyncTest('Tier 4.2: Scenario 2 — Autonomous Outcome CLOB Trading Cycle with Persisted Order Audit', async () => {
  const client = new TxFlowClient({ mockMode: true });
  await client.requestFaucet();
  await client.transferToOutcome(1000);
  const bot = new TxFlowBot({ client, mockMode: true });

  // 1. Discover Markets
  const markets = await bot.getMarkets();
  assert.ok(markets.length > 0);
  const targetMarket = markets[0];

  // 2. Submit High-Conviction TIP 3 Limit Order
  const subRes = await bot.submitOrder({
    instrumentId: targetMarket.instrumentId,
    isBuy: true,
    price: '0.61',
    size: '50',
    tif: 'Gtc',
    marketId: targetMarket.marketId,
    question: targetMarket.question
  });
  assert.strictEqual(subRes.success, true);

  // 3. Verify Memory & Disk Registry
  const persistedOrders = readTxFlowOrders();
  const matched = persistedOrders.find(o => o.traceId === subRes.traceId);
  assert.ok(matched, 'Order must be persisted to txflow_orders.json');
  assert.equal(matched.instrumentId, targetMarket.instrumentId);
  assert.equal(matched.price, '0.61');
  assert.equal(matched.size, '50');
});

await asyncTest('Tier 4.3: Scenario 3 — Emergency Hard Kill-Switch Sub-Second Interruption Drill', async () => {
  const rm = riskManagerInstance;
  const bot = txflowBotInstance;

  // Seed resting orders
  await bot.submitOrder({ instrumentId: 100000001, isBuy: true, price: '0.50', size: '10' });
  await bot.submitOrder({ instrumentId: 100000002, isBuy: true, price: '0.45', size: '10' });

  // Measure kill-switch trigger and cancellation latency
  const killStart = Date.now();
  rm.triggerKillSwitch('Forensic Stress Drill: Simulated Black Swan');
  const killElapsedMs = Date.now() - killStart;

  assert.ok(killElapsedMs < 1000, `Kill-switch execution must complete in < 1,000ms (took ${killElapsedMs}ms)`);
  assert.strictEqual(rm.isKilled, true);

  // Confirm all bot orders are cancelled
  const openOrders = bot.orders.filter(o => o.status === 'QUEUED' || o.status === 'RESTING');
  assert.equal(openOrders.length, 0);

  // Reset after drill
  rm.resetKillSwitch('Test Suite Teardown');
});

await asyncTest('Tier 4.4: Scenario 4 — Collateral Exhaustion & Graceful Auto-Rebalance Recovery', async () => {
  const client = new TxFlowClient({ mockMode: true });
  await client.requestFaucet(); // 1,000 in perp, 0 in outcome
  assert.equal(client.outcomeBalanceUsd, 0);
  assert.equal(client.perpBalanceUsd, 1000);

  const bot = new TxFlowBot({ client, mockMode: true, config: { autoRebalance: true } });

  // Order requires 50 * 0.50 = $25 USD
  const subRes = await bot.submitOrder({
    instrumentId: 100000001,
    isBuy: true,
    price: '0.50',
    size: '50'
  });
  assert.strictEqual(subRes.success, true);
  // Auto-rebalance should have transferred funds
  assert.ok(client.outcomeBalanceUsd > 0);

  // Now exhaust both perp and outcome balances
  client.perpBalanceUsd = 0;
  client.outcomeBalanceUsd = 0;

  // Non-mock client or exhausted balance scenario
  const exhaustedClient = new TxFlowClient({ mockMode: false });
  exhaustedClient.perpBalanceUsd = 0;
  exhaustedClient.outcomeBalanceUsd = 0;
  const exhaustedBot = new TxFlowBot({ client: exhaustedClient, mockMode: false });

  const failRes = await exhaustedBot.submitOrder({
    instrumentId: 100000001,
    isBuy: true,
    price: '0.50',
    size: '100'
  });
  assert.strictEqual(failRes.success, false);
  assert.equal(failRes.rejectedReason, 'INSUFFICIENT_OUTCOME_BALANCE');
});

test('Tier 4.5: Scenario 5 — Full Monorepo Certification & Strict State Isolation', () => {
  // Confirm backtest.json is bit-identical
  if (initialBacktestSha) {
    const currentSha = crypto.createHash('sha256').update(fs.readFileSync(BACKTEST_FILE)).digest('hex');
    assert.equal(currentSha, initialBacktestSha, 'backtest.json modified during test execution!');
  }

  // Restore initial txflow_orders.json
  if (initialTxFlowOrdersRaw !== null) {
    fs.writeFileSync(TXFLOW_ORDERS_FILE, initialTxFlowOrdersRaw, 'utf8');
  }

  // Clean shutdown of server and sockets
  try {
    if (server && typeof server.close === 'function') {
      server.close();
    }
    if (clobStreamerInstance && typeof clobStreamerInstance.disconnect === 'function') {
      clobStreamerInstance.disconnect();
    }
    if (txflowBotInstance && typeof txflowBotInstance.stop === 'function') {
      txflowBotInstance.stop();
    }
    if (txflowBotInstance && typeof txflowBotInstance.disconnectWebSockets === 'function') {
      txflowBotInstance.disconnectWebSockets();
    }
  } catch (_) {}
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUMMARY & FINAL CERTIFICATION
// ─────────────────────────────────────────────────────────────────────────────
const elapsedSec = ((Date.now() - testStartMs) / 1000).toFixed(2);
console.log('\n══════════════════════════════════════════════════════════════════');
console.log(`  TXFLOW TESTNET TEST SUITE COMPLETE (${elapsedSec}s)`);
console.log(`  Total Executed : ${passedCount + failedCount}`);
console.log(`  Passed         : ${passedCount}`);
console.log(`  Failed         : ${failedCount}`);
console.log('══════════════════════════════════════════════════════════════════\n');

if (failedCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
