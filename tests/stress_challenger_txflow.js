/**
 * tests/stress_challenger_txflow.js
 *
 * Empirical Adversarial Stress Harness for services/txflow_client.js
 * Author: challenger_m1_1 (Empirical Challenger)
 * Milestone: M1 — TxFlow Testnet Client & Faucet Provider
 *
 * Stress Test Dimensions:
 * 1. Deterministic MessagePack map key insertion order preservation:
 *    - Reverse alphabetical keys, mixed types, deeply nested objects, arrays of objects.
 * 2. Boundary integers & uint32 asset encoding:
 *    - 0, 1, 127, 128, 255, 256, 65535, 65536, 100000001 (uint32 asset ID), 2^32-1, 2^32, 2^53-1, 2^64-1.
 *    - Negative numbers: -1, -32, -33, -128, -129, -32768, -32769, -2147483648, -2^63.
 *    - Containers: empty objects, empty arrays, length 15 (fix) vs 16 boundaries.
 *    - Strings: empty, 31 bytes (fixstr), 32 bytes (str8), 255 bytes, 256 bytes (str16), unicode/emojis.
 * 3. TIP 3 exact reference vector:
 *    - 77 bytes exact length and hex matching.
 *    - Round-trip decode equivalence.
 * 4. 50+ EIP-712 low-S canonical signature normalization:
 *    - Test with 60 distinct randomized wallets.
 *    - Verification of s <= SECP256K1_HALF_N and v in {27, 28}.
 * 5. Signer address recovery:
 *    - 100% address recovery match across approveAgent, transferToOutcome, and signOrderPayload.
 * 6. High-S signature inversion:
 *    - Construct synthetic high-S signatures (s > N/2) and verify normalizeLowS flips s = N - s and flips v (27<->28).
 * 7. Connection ID calculation & Vault address marker verification.
 * 8. TxFlowClient operational resilience & invalid input rejection.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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

console.log('══════════════════════════════════════════════════════════════════');
console.log('  CHALLENGER 1: EMPIRICAL ADVERSARIAL STRESS TEST HARNESS (M1)');
console.log('  Target: services/txflow_client.js');
console.log('══════════════════════════════════════════════════════════════════\n');

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: DETERMINISTIC MESSAGEPACK MAP KEY ORDER PRESERVATION
// ─────────────────────────────────────────────────────────────────────────────
console.log('▶ SUITE 1: Deterministic MessagePack Map Key Order Preservation');

runTest('Preserves exact insertion order for reverse-alphabetical keys', () => {
  const obj = {};
  obj.zeta = 100;
  obj.omega = 200;
  obj.beta = 300;
  obj.alpha = 400;

  const encoded = encodeDeterministicMsgPack(obj);
  // Decode manually to inspect key sequence
  const keysInOrder = [];
  // Buffer structure: 0x84 (fixmap 4)
  assert.equal(encoded[0], 0x84, 'Expected fixmap with 4 entries');

  const decoded = decodeDeterministicMsgPack(encoded);
  const decodedKeys = Object.keys(decoded);
  assert.deepEqual(decodedKeys, ['zeta', 'omega', 'beta', 'alpha'], 'Map keys must NOT be sorted alphabetically');
});

runTest('Preserves key order in deeply nested objects and arrays of maps', () => {
  const complex = {
    z: {
      type: 'market',
      details: {
        ticker: 'BTC',
        active: true,
        id: 42
      }
    },
    a: [
      { side: 'buy', price: '0.50', count: 1 },
      { side: 'sell', price: '0.55', count: 2 }
    ],
    m: {
      flag: false
    }
  };

  const enc1 = encodeDeterministicMsgPack(complex);
  const enc2 = encodeDeterministicMsgPack(complex);
  assert.equal(enc1.toString('hex'), enc2.toString('hex'), 'Repeated encoding must be strictly bit-identical');

  const decoded = decodeDeterministicMsgPack(enc1);
  assert.deepEqual(Object.keys(decoded), ['z', 'a', 'm']);
  assert.deepEqual(Object.keys(decoded.z), ['type', 'details']);
  assert.deepEqual(Object.keys(decoded.z.details), ['ticker', 'active', 'id']);
  assert.deepEqual(Object.keys(decoded.a[0]), ['side', 'price', 'count']);
  assert.deepEqual(Object.keys(decoded.a[1]), ['side', 'price', 'count']);
  assert.deepEqual(Object.keys(decoded.m), ['flag']);
});

runTest('Preserves key order across 100 consecutive randomized iterations', () => {
  for (let i = 0; i < 100; i++) {
    const keys = ['field_' + crypto.randomBytes(4).toString('hex'), 'prop_' + i, 'token_' + (100 - i)];
    const testObj = {};
    for (const k of keys) {
      testObj[k] = Math.floor(Math.random() * 10000);
    }
    const enc = encodeDeterministicMsgPack(testObj);
    const dec = decodeDeterministicMsgPack(enc);
    assert.deepEqual(Object.keys(dec), keys, `Failed key order on iteration ${i}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: NUMERICAL BOUNDARY TESTING & UINT32 ASSET ENCODING
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ SUITE 2: Numerical Boundary Testing & UINT32 Asset Encoding');

runTest('Encodes 0 and positive fixint boundaries (0, 1, 127)', () => {
  assert.deepEqual(encodeDeterministicMsgPack(0), Buffer.from([0x00]));
  assert.deepEqual(encodeDeterministicMsgPack(1), Buffer.from([0x01]));
  assert.deepEqual(encodeDeterministicMsgPack(127), Buffer.from([0x7f]));
  assert.equal(decodeDeterministicMsgPack(encodeDeterministicMsgPack(127)), 127);
});

runTest('Encodes uint8 boundary (128, 255) with 0xcc prefix', () => {
  const enc128 = encodeDeterministicMsgPack(128);
  assert.deepEqual(enc128, Buffer.from([0xcc, 128]));
  assert.equal(decodeDeterministicMsgPack(enc128), 128);

  const enc255 = encodeDeterministicMsgPack(255);
  assert.deepEqual(enc255, Buffer.from([0xcc, 255]));
  assert.equal(decodeDeterministicMsgPack(enc255), 255);
});

runTest('Encodes uint16 boundary (256, 65535) with 0xcd prefix', () => {
  const enc256 = encodeDeterministicMsgPack(256);
  assert.deepEqual(enc256, Buffer.from([0xcd, 0x01, 0x00]));
  assert.equal(decodeDeterministicMsgPack(enc256), 256);

  const enc65535 = encodeDeterministicMsgPack(65535);
  assert.deepEqual(enc65535, Buffer.from([0xcd, 0xff, 0xff]));
  assert.equal(decodeDeterministicMsgPack(enc65535), 65535);
});

runTest('Encodes uint32 boundary (65536, 100000001, 4294967295) with 0xce prefix', () => {
  const enc65536 = encodeDeterministicMsgPack(65536);
  assert.deepEqual(enc65536, Buffer.from([0xce, 0x00, 0x01, 0x00, 0x00]));
  assert.equal(decodeDeterministicMsgPack(enc65536), 65536);

  // TIP 3 Outcome Asset ID: 100000001 (0x05f5e101)
  const encAsset = encodeDeterministicMsgPack(100000001);
  assert.deepEqual(encAsset, Buffer.from([0xce, 0x05, 0xf5, 0xe1, 0x01]), 'Asset 100000001 must encode as uint32');
  assert.equal(decodeDeterministicMsgPack(encAsset), 100000001);

  const encMaxU32 = encodeDeterministicMsgPack(4294967295);
  assert.deepEqual(encMaxU32, Buffer.from([0xce, 0xff, 0xff, 0xff, 0xff]));
  assert.equal(decodeDeterministicMsgPack(encMaxU32), 4294967295);
});

runTest('Encodes uint64 boundary (4294967296, 2^53 - 1, 2^64 - 1n) with 0xcf prefix', () => {
  const encU64 = encodeDeterministicMsgPack(4294967296);
  assert.equal(encU64[0], 0xcf);
  assert.equal(decodeDeterministicMsgPack(encU64), 4294967296n);

  const maxSafe = Number.MAX_SAFE_INTEGER; // 9007199254740991
  const encSafe = encodeDeterministicMsgPack(maxSafe);
  assert.equal(encSafe[0], 0xcf);
  assert.equal(decodeDeterministicMsgPack(encSafe), BigInt(maxSafe));

  const maxU64 = 18446744073709551615n;
  const encBig = encodeDeterministicMsgPack(maxU64);
  assert.equal(encBig[0], 0xcf);
  assert.equal(decodeDeterministicMsgPack(encBig), maxU64);
});

runTest('Encodes negative fixint (-1 to -32)', () => {
  // -1 in fixint is 0xff
  const encNeg1 = encodeDeterministicMsgPack(-1);
  assert.deepEqual(encNeg1, Buffer.from([0xff]));
  assert.equal(decodeDeterministicMsgPack(encNeg1), -1);

  // -32 in fixint is 0xe0
  const encNeg32 = encodeDeterministicMsgPack(-32);
  assert.deepEqual(encNeg32, Buffer.from([0xe0]));
  assert.equal(decodeDeterministicMsgPack(encNeg32), -32);
});

runTest('Encodes int8 (-33, -128) with 0xd0 prefix', () => {
  const encNeg33 = encodeDeterministicMsgPack(-33);
  assert.equal(encNeg33[0], 0xd0);
  assert.equal(decodeDeterministicMsgPack(encNeg33), -33);

  const encNeg128 = encodeDeterministicMsgPack(-128);
  assert.equal(encNeg128[0], 0xd0);
  assert.equal(decodeDeterministicMsgPack(encNeg128), -128);
});

runTest('Encodes int16 (-129, -32768) with 0xd1 prefix', () => {
  const encNeg129 = encodeDeterministicMsgPack(-129);
  assert.equal(encNeg129[0], 0xd1);
  assert.equal(decodeDeterministicMsgPack(encNeg129), -129);

  const encNeg32768 = encodeDeterministicMsgPack(-32768);
  assert.equal(encNeg32768[0], 0xd1);
  assert.equal(decodeDeterministicMsgPack(encNeg32768), -32768);
});

runTest('Encodes int32 (-32769, -2147483648) with 0xd2 prefix', () => {
  const encNeg32769 = encodeDeterministicMsgPack(-32769);
  assert.equal(encNeg32769[0], 0xd2);
  assert.equal(decodeDeterministicMsgPack(encNeg32769), -32769);

  const encNegMin32 = encodeDeterministicMsgPack(-2147483648);
  assert.equal(encNegMin32[0], 0xd2);
  assert.equal(decodeDeterministicMsgPack(encNegMin32), -2147483648);
});

runTest('Encodes int64 (-2147483649, -2^63n) with 0xd3 prefix', () => {
  const encNegBig = encodeDeterministicMsgPack(-2147483649);
  assert.equal(encNegBig[0], 0xd3);
  assert.equal(decodeDeterministicMsgPack(encNegBig), -2147483649n);

  const minI64 = -9223372036854775808n;
  const encMinI64 = encodeDeterministicMsgPack(minI64);
  assert.equal(encMinI64[0], 0xd3);
  assert.equal(decodeDeterministicMsgPack(encMinI64), minI64);
});

runTest('Encodes float64 numbers with 0xcb prefix', () => {
  const pi = 3.141592653589793;
  const enc = encodeDeterministicMsgPack(pi);
  assert.equal(enc[0], 0xcb);
  assert.equal(enc.length, 9);
  assert.equal(decodeDeterministicMsgPack(enc), pi);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: STRINGS, BUFFERS & CONTAINERS BOUNDARY TESTING
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ SUITE 3: Strings, Buffers & Containers Boundary Testing');

runTest('Encodes empty string, fixstr boundaries (31 bytes) and str8 (32 bytes)', () => {
  const emptyStr = encodeDeterministicMsgPack('');
  assert.deepEqual(emptyStr, Buffer.from([0xa0]));
  assert.equal(decodeDeterministicMsgPack(emptyStr), '');

  const str31 = 'a'.repeat(31);
  const enc31 = encodeDeterministicMsgPack(str31);
  assert.equal(enc31[0], 0xa0 | 31);
  assert.equal(decodeDeterministicMsgPack(enc31), str31);

  const str32 = 'b'.repeat(32);
  const enc32 = encodeDeterministicMsgPack(str32);
  assert.equal(enc32[0], 0xd9);
  assert.equal(enc32[1], 32);
  assert.equal(decodeDeterministicMsgPack(enc32), str32);
});

runTest('Encodes str16 boundary (>255 bytes)', () => {
  const str300 = 'x'.repeat(300);
  const enc300 = encodeDeterministicMsgPack(str300);
  assert.equal(enc300[0], 0xda);
  assert.equal(enc300.readUInt16BE(1), 300);
  assert.equal(decodeDeterministicMsgPack(enc300), str300);
});

runTest('Encodes unicode strings and emojis with correct byte length calculation', () => {
  const unicodeStr = 'TxFlow 🚀 Prediction Markets 🎯 日本語';
  const enc = encodeDeterministicMsgPack(unicodeStr);
  const byteLen = Buffer.byteLength(unicodeStr, 'utf8');
  const headerLen = byteLen <= 31 ? 1 : (byteLen <= 255 ? 2 : (byteLen <= 65535 ? 3 : 5));
  assert.equal(enc.length, headerLen + byteLen);
  assert.equal(decodeDeterministicMsgPack(enc), unicodeStr);
});

runTest('Encodes empty array and array size boundaries (0, 15 fixarray, 16 array16)', () => {
  const emptyArr = encodeDeterministicMsgPack([]);
  assert.deepEqual(emptyArr, Buffer.from([0x90]));
  assert.deepEqual(decodeDeterministicMsgPack(emptyArr), []);

  const arr15 = Array(15).fill(1);
  const enc15 = encodeDeterministicMsgPack(arr15);
  assert.equal(enc15[0], 0x9f);
  assert.equal(decodeDeterministicMsgPack(enc15).length, 15);

  const arr16 = Array(16).fill(2);
  const enc16 = encodeDeterministicMsgPack(arr16);
  assert.equal(enc16[0], 0xdc);
  assert.equal(enc16.readUInt16BE(1), 16);
  assert.equal(decodeDeterministicMsgPack(enc16).length, 16);
});

runTest('Encodes empty map and map size boundaries (0, 15 fixmap, 16 map16)', () => {
  const emptyMap = encodeDeterministicMsgPack({});
  assert.deepEqual(emptyMap, Buffer.from([0x80]));
  assert.deepEqual(decodeDeterministicMsgPack(emptyMap), {});

  const map15 = {};
  for (let i = 0; i < 15; i++) map15[`k${i}`] = i;
  const enc15 = encodeDeterministicMsgPack(map15);
  assert.equal(enc15[0], 0x8f);
  assert.equal(Object.keys(decodeDeterministicMsgPack(enc15)).length, 15);

  const map16 = {};
  for (let i = 0; i < 16; i++) map16[`k${i}`] = i;
  const enc16 = encodeDeterministicMsgPack(map16);
  assert.equal(enc16[0], 0xde);
  assert.equal(enc16.readUInt16BE(1), 16);
  assert.equal(Object.keys(decodeDeterministicMsgPack(enc16)).length, 16);
});

runTest('Encodes null, boolean true/false, and raw Buffer binary data', () => {
  assert.deepEqual(encodeDeterministicMsgPack(null), Buffer.from([0xc0]));
  assert.deepEqual(encodeDeterministicMsgPack(undefined), Buffer.from([0xc0]));
  assert.deepEqual(encodeDeterministicMsgPack(true), Buffer.from([0xc3]));
  assert.deepEqual(encodeDeterministicMsgPack(false), Buffer.from([0xc2]));

  const rawBytes = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
  const encBin = encodeDeterministicMsgPack(rawBytes);
  assert.equal(encBin[0], 0xc4); // bin8
  assert.equal(encBin[1], 4);
  assert.deepEqual(decodeDeterministicMsgPack(encBin), rawBytes);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: TIP 3 REFERENCE VECTOR ADVERSARIAL VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ SUITE 4: TIP 3 Reference Vector Adversarial Verification');

runTest('Validates exact 77-byte reference vector and hex digest', () => {
  const referenceOrder = {
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

  const expectedHex = '83a474797065a56f72646572a66f72646572739186a161ce05f5e101a162c3a170a4302e3632a173a3313030a172c2a17481a56c696d697481a3746966a3477463a867726f7570696e67a26e61';
  const encoded = encodeDeterministicMsgPack(referenceOrder);

  assert.equal(encoded.length, 77, `Expected exactly 77 bytes, got ${encoded.length}`);
  assert.equal(encoded.toString('hex'), expectedHex, 'Encoded bytes must match expected TIP 3 hex exactly');

  // Verify full round-trip decode fidelity
  const decoded = decodeDeterministicMsgPack(encoded);
  assert.equal(decoded.type, 'order');
  assert.equal(decoded.orders.length, 1);
  assert.equal(decoded.orders[0].a, 100000001);
  assert.equal(decoded.orders[0].b, true);
  assert.equal(decoded.orders[0].p, '0.62');
  assert.equal(decoded.orders[0].s, '100');
  assert.equal(decoded.orders[0].r, false);
  assert.equal(decoded.orders[0].t.limit.tif, 'Gtc');
  assert.equal(decoded.grouping, 'na');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 5: EIP-712 LOW-S CANONICALIZATION & ADDRESS RECOVERY (60+ SAMPLES)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ SUITE 5: EIP-712 Low-S Canonicalization & Address Recovery (60+ Iterations)');

await runAsyncTest('Generates 60+ distinct EIP-712 signatures, enforcing s <= N/2, v in {27, 28}, and exact address recovery', async () => {
  const NUM_SAMPLES = 60;
  let naturalLowCount = 0;
  let normalizedCount = 0;

  for (let i = 0; i < NUM_SAMPLES; i++) {
    const testWallet = ethers.Wallet.createRandom();
    const nonce = 1700000000000 + i;

    // Alternating between ApproveAgent and TransferToken typed data
    let value, types;
    if (i % 2 === 0) {
      types = APPROVE_AGENT_TYPES;
      value = {
        txflowChain: 'Testnet',
        agentAddress: ethers.Wallet.createRandom().address,
        agentName: `BotAgent_${i}`,
        nonce
      };
    } else {
      types = TRANSFER_TOKEN_TYPES;
      value = {
        txflowChain: 'Testnet',
        fromSubAccount: 'perp',
        toSubAccount: 'outcome',
        token: 'USDC',
        amount: `${(i + 1) * 10}.50`,
        nonce
      };
    }

    const rawSig = await testWallet.signTypedData(TXFLOW_DOMAIN, types, value);
    const parsedRaw = ethers.Signature.from(rawSig);

    const rawS = BigInt(parsedRaw.s);
    if (rawS > SECP256K1_HALF_N) {
      normalizedCount++;
    } else {
      naturalLowCount++;
    }

    const canonical = normalizeLowS(rawSig);
    const sBig = BigInt(canonical.s);

    // Invariant 1: Low-S bound
    assert.ok(sBig <= SECP256K1_HALF_N, `Signature s=${canonical.s} exceeds SECP256K1_HALF_N`);
    assert.ok(sBig > 0n, 'Signature s must be positive');

    // Invariant 2: Recovery byte
    assert.ok(canonical.v === 27 || canonical.v === 28, `Recovery byte v=${canonical.v} must be 27 or 28`);

    // Invariant 3: Format lengths
    assert.equal(canonical.r.length, 66, 'r must be 32 bytes hex with 0x prefix');
    assert.equal(canonical.s.length, 66, 's must be 32 bytes hex with 0x prefix');

    // Invariant 4: Cryptographic Address Recovery
    const recoveredAddress = ethers.verifyTypedData(
      TXFLOW_DOMAIN,
      types,
      value,
      { r: canonical.r, s: canonical.s, v: canonical.v }
    );
    assert.equal(
      recoveredAddress.toLowerCase(),
      testWallet.address.toLowerCase(),
      `Address recovery mismatch at iteration ${i}: expected ${testWallet.address}, got ${recoveredAddress}`
    );
  }

  console.log(`    ↳ Verified ${NUM_SAMPLES} EIP-712 signatures (${naturalLowCount} natural low-S, ${normalizedCount} normalized high-S)`);
});

runTest('Synthetic High-S signature inversion: verifies mathematical reflection s = N - s and v inversion', () => {
  // Construct known high-S
  const sampleWallet = ethers.Wallet.createRandom();
  const testR = '0x' + crypto.randomBytes(32).toString('hex');
  // Choose s strictly > N / 2
  const highS = SECP256K1_HALF_N + 123456789n;
  const highSHex = '0x' + highS.toString(16).padStart(64, '0');

  // Case 1: v = 27 -> should flip to 28
  const norm27 = normalizeLowS({ r: testR, s: highSHex, v: 27 });
  assert.equal(norm27.v, 28, 'v=27 with high-S must flip to v=28');
  assert.equal(BigInt(norm27.s), SECP256K1_N - highS, 'Normalized s must equal N - highS');
  assert.ok(BigInt(norm27.s) <= SECP256K1_HALF_N, 'Normalized s must be <= N/2');

  // Case 2: v = 28 -> should flip to 27
  const norm28 = normalizeLowS({ r: testR, s: highSHex, v: 28 });
  assert.equal(norm28.v, 27, 'v=28 with high-S must flip to v=27');
  assert.equal(BigInt(norm28.s), SECP256K1_N - highS);

  // Case 3: already low-S -> should remain unchanged
  const lowS = SECP256K1_HALF_N - 500n;
  const lowSHex = '0x' + lowS.toString(16).padStart(64, '0');
  const unchanged = normalizeLowS({ r: testR, s: lowSHex, v: 27 });
  assert.equal(unchanged.v, 27);
  assert.equal(BigInt(unchanged.s), lowS);

  // Case 4: Raw EVM recid v = 0 / 1 -> should normalize to 27 / 28
  const normV0 = normalizeLowS({ r: testR, s: lowSHex, v: 0 });
  assert.equal(normV0.v, 27, 'v=0 must normalize to 27');
  const normV1 = normalizeLowS({ r: testR, s: lowSHex, v: 1 });
  assert.equal(normV1.v, 28, 'v=1 must normalize to 28');
});

await runAsyncTest('Empirical High-S Stress: 50 wallets with synthetic high-S signatures recover exact address after normalizeLowS', async () => {
  const HIGH_S_SAMPLES = 50;
  for (let i = 0; i < HIGH_S_SAMPLES; i++) {
    const wallet = ethers.Wallet.createRandom();
    const nonce = 1720000000000 + i;
    const value = {
      txflowChain: 'Testnet',
      agentAddress: ethers.Wallet.createRandom().address,
      agentName: `SyntheticAgent_${i}`,
      nonce
    };

    // Sign legitimately
    const rawSig = await wallet.signTypedData(TXFLOW_DOMAIN, APPROVE_AGENT_TYPES, value);
    const parsed = ethers.Signature.from(rawSig);

    // Invert to High-S
    const highS = SECP256K1_N - BigInt(parsed.s);
    const flippedV = parsed.v === 27 ? 28 : 27;
    assert.ok(highS > SECP256K1_HALF_N, 'Must be strictly high-S');

    const highSig = {
      r: parsed.r,
      s: '0x' + highS.toString(16).padStart(64, '0'),
      v: flippedV
    };

    // Normalize
    const normalized = normalizeLowS(highSig);
    assert.ok(BigInt(normalized.s) <= SECP256K1_HALF_N, 'Normalized s must be <= N/2');
    assert.equal(normalized.v, parsed.v, 'Normalized v must match original v');
    assert.equal(BigInt(normalized.s), BigInt(parsed.s), 'Normalized s must match original s');

    // Cryptographic recovery check
    const recovered = ethers.verifyTypedData(
      TXFLOW_DOMAIN,
      APPROVE_AGENT_TYPES,
      value,
      normalized
    );
    assert.equal(
      recovered.toLowerCase(),
      wallet.address.toLowerCase(),
      `Failed recovery on synthetic high-S wallet ${i}`
    );
  }
  console.log(`    ↳ Verified 50 synthetic High-S signatures normalized and recovered with 100% address accuracy`);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 6: CONNECTION ID & AGENT ORDER SIGNING STRESS
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ SUITE 6: Connection ID & Agent Order Signing Stress');

await runAsyncTest('Verifies computeConnectionId and signOrderPayload across 20 distinct orders', async () => {
  const agentWallet = ethers.Wallet.createRandom();

  for (let i = 0; i < 20; i++) {
    const actionPayload = {
      type: 'order',
      orders: [
        {
          a: 100000000 + i * 10 + 1,
          b: i % 2 === 0,
          p: (0.10 + (i * 0.04)).toFixed(2),
          s: `${(i + 1) * 25}`,
          r: false,
          t: { limit: { tif: 'Gtc' } }
        }
      ],
      grouping: 'na'
    };

    const nonce = 1710000000000 + i;
    const signed = await signOrderPayload(agentWallet, actionPayload, nonce);

    assert.ok(signed.connectionId.startsWith('0x') && signed.connectionId.length === 66);
    assert.ok(BigInt(signed.signature.s) <= SECP256K1_HALF_N);
    assert.ok(signed.signature.v === 27 || signed.signature.v === 28);

    // Verify Agent EIP-712 recovery
    const recovered = ethers.verifyTypedData(
      TXFLOW_DOMAIN,
      AGENT_ORDER_TYPES,
      { source: 'b', connectionId: signed.connectionId },
      signed.signature
    );
    assert.equal(recovered.toLowerCase(), agentWallet.address.toLowerCase());
  }
});

runTest('computeConnectionId incorporates vaultAddress when non-null and non-zero', () => {
  const buf = Buffer.from('test_msgpack');
  const nonce = 123456789;

  const idNoVault = computeConnectionId(buf, nonce, null);
  const idZeroVault = computeConnectionId(buf, nonce, ethers.ZeroAddress);
  const idRealVault = computeConnectionId(buf, nonce, '0x1234567890123456789012345678901234567890');

  assert.equal(idNoVault, idZeroVault, 'Zero address must yield same connectionId as null vault');
  assert.notEqual(idNoVault, idRealVault, 'Real vault address must alter connectionId digest');
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 7: TXFLOW CLIENT INTEGRATION & STATE ISOLATION RESILIENCE
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ SUITE 7: TxFlow Client Integration & State Isolation Resilience');

await runAsyncTest('TxFlowClient lifecycle: faucet, rebalance, status, and reset in mock mode', async () => {
  const client = new TxFlowClient({ mockMode: true });

  const statusInit = client.getStatus();
  assert.equal(statusInit.chainId, 2511);
  assert.equal(statusInit.perpBalanceUsd, 0);
  assert.equal(statusInit.outcomeBalanceUsd, 0);
  assert.equal(statusInit.isAgentApproved, false);

  // Faucet request
  const faucetRes = await client.requestFaucet();
  assert.equal(faucetRes.success, true);
  assert.equal(faucetRes.amount, '1000.0');
  assert.equal(client.getStatus().perpBalanceUsd, 1000);

  // Transfer to outcome
  const transferRes = await client.transferToOutcome(400);
  assert.equal(transferRes.success, true);
  assert.equal(transferRes.amount, '400');
  assert.equal(client.getStatus().perpBalanceUsd, 600);
  assert.equal(client.getStatus().outcomeBalanceUsd, 400);

  // Approve Agent
  const approveRes = await client.approveAgent();
  assert.equal(approveRes.success, true);
  assert.equal(client.getStatus().isAgentApproved, true);

  // Reset Mock State
  client.resetMockState();
  assert.equal(client.getStatus().perpBalanceUsd, 0);
  assert.equal(client.getStatus().outcomeBalanceUsd, 0);
  assert.equal(client.getStatus().isAgentApproved, false);
});

await runAsyncTest('Rejects malformed transfer amounts and invalid addresses', async () => {
  const client = new TxFlowClient({ mockMode: true });

  // Invalid address
  await assert.rejects(
    async () => client.requestFaucet('0xInvalidAddress'),
    /Invalid Ethereum address/
  );

  // Invalid transfer amounts (graceful rejection without throwing)
  const resNeg = await client.transferToOutcome(-50);
  assert.equal(resNeg.success, false);
  assert.match(resNeg.error, /Invalid transfer amount/);

  const resZero = await client.transferToOutcome(0);
  assert.equal(resZero.success, false);
  assert.match(resZero.error, /Invalid transfer amount/);

  const resNaN = await client.transferToOutcome('not-a-number');
  assert.equal(resNaN.success, false);
  assert.match(resNaN.error, /Invalid transfer amount/);
});

await runAsyncTest('Rejects over-balance transfers and preserves conservation of capital', async () => {
  const client = new TxFlowClient({ mockMode: true });
  await client.requestFaucet(); // 1000

  // Over-balance transfer
  const resOver = await client.transferToOutcome(1500);
  assert.equal(resOver.success, false);
  assert.match(resOver.error, /Insufficient perp balance/);
  assert.equal(client.getStatus().perpBalanceUsd, 1000);
  assert.equal(client.getStatus().outcomeBalanceUsd, 0);
  assert.equal(client.getStatus().perpBalanceUsd + client.getStatus().outcomeBalanceUsd, client.getStatus().totalFaucetReceived);
});

await runAsyncTest('Eliminates concurrent double-spend race conditions', async () => {
  const client = new TxFlowClient({ mockMode: true });
  await client.requestFaucet(); // 1000

  const [t1, t2] = await Promise.all([
    client.transferToOutcome(600),
    client.transferToOutcome(600)
  ]);

  const succeeded = [t1, t2].filter(r => r.success);
  const failed = [t1, t2].filter(r => !r.success);
  assert.equal(succeeded.length, 1);
  assert.equal(failed.length, 1);
  assert.equal(client.getStatus().perpBalanceUsd, 400);
  assert.equal(client.getStatus().outcomeBalanceUsd, 600);
  assert.equal(client.getStatus().perpBalanceUsd + client.getStatus().outcomeBalanceUsd, client.getStatus().totalFaucetReceived);
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 8: MALFORMED & CORRUPTED MSGPACK BUFFER INGESTION RESILIENCE
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ SUITE 8: Malformed & Corrupted MsgPack Ingestion Resilience');

runTest('Decoder safely catches truncated MessagePack buffers', () => {
  // Truncated uint32 (prefix 0xce without 4 bytes)
  assert.throws(
    () => decodeDeterministicMsgPack(Buffer.from([0xce, 0x01])),
    /(Unexpected end of MessagePack buffer|outside buffer bounds)/
  );

  // Truncated fixstr inside array
  assert.throws(
    () => decodeDeterministicMsgPack(Buffer.from([0x92, 0xa5, 0x61, 0x62])),
    /(Unexpected end of MessagePack buffer|outside buffer bounds)/
  );

  // Truncated fixarray
  assert.throws(
    () => decodeDeterministicMsgPack(Buffer.from([0x92, 0x01])),
    /(Unexpected end of MessagePack buffer|outside buffer bounds)/
  );

  // Truncated fixmap
  assert.throws(
    () => decodeDeterministicMsgPack(Buffer.from([0x81, 0xa1, 0x61])),
    /(Unexpected end of MessagePack buffer|outside buffer bounds)/
  );
});

runTest('Decoder safely catches unsupported prefix bytes', () => {
  assert.throws(
    () => decodeDeterministicMsgPack(Buffer.from([0xc1])),
    /Unsupported MessagePack prefix byte: 0xc1/
  );
});

runTest('Encoder safely rejects unsupported JavaScript types', () => {
  assert.throws(
    () => encodeDeterministicMsgPack(Symbol('unsupported')),
    /Unsupported MsgPack type: symbol/
  );
  assert.throws(
    () => encodeDeterministicMsgPack(() => {}),
    /Unsupported MsgPack type: function/
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 9: OBJECT PROTOTYPES & BIGINT VS NUMBER ENCODING EQUIVALENCE
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ SUITE 9: Object Prototypes & BigInt vs Number Encoding Equivalence');

runTest('Handles Object.create(null) and prototype inheritance cleanly', () => {
  const nullProto = Object.create(null);
  nullProto.foo = 'bar';
  nullProto.num = 42;
  const encNull = encodeDeterministicMsgPack(nullProto);
  const decNull = decodeDeterministicMsgPack(encNull);
  assert.deepEqual(decNull, { foo: 'bar', num: 42 });

  // Prototype properties must be ignored (only own enumerable properties)
  const proto = { inherited: 'hidden' };
  const child = Object.create(proto);
  child.own = 'visible';
  const encChild = encodeDeterministicMsgPack(child);
  const decChild = decodeDeterministicMsgPack(encChild);
  assert.deepEqual(decChild, { own: 'visible' });
  assert.equal(decChild.inherited, undefined);
});

runTest('BigInt and Number produce bit-for-bit identical MessagePack across shared ranges', () => {
  const testPairs = [
    [0, 0n],
    [1, 1n],
    [127, 127n],
    [128, 128n],
    [255, 255n],
    [256, 256n],
    [65535, 65535n],
    [65536, 65536n],
    [4294967295, 4294967295n],
    [-1, -1n],
    [-32, -32n],
    [-33, -33n],
    [-128, -128n],
    [-129, -129n],
    [-32768, -32768n],
    [-32769, -32769n],
    [-2147483648, -2147483648n]
  ];

  for (const [numVal, bigVal] of testPairs) {
    const encNum = encodeDeterministicMsgPack(numVal);
    const encBig = encodeDeterministicMsgPack(bigVal);
    assert.equal(
      encNum.toString('hex'),
      encBig.toString('hex'),
      `Mismatch for pair ${numVal} vs ${bigVal}n: ${encNum.toString('hex')} !== ${encBig.toString('hex')}`
    );
  }
});

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(`  ALL CHALLENGES COMPLETED: ${passedTests}/${totalTests} PASSED (0 FAILED)`);
console.log('══════════════════════════════════════════════════════════════════');
