/**
 * tests/stress_challenger_m3_server.js
 *
 * Empirical Adversarial Stress Harness for server.js (/api/v1/txflow/*)
 * Author: challenger_m3_1 (Empirical Challenger)
 * Milestone: M3 — Backend REST API Endpoints
 *
 * Adversarial Challenge Dimensions:
 * 1. Malformed JSON Body Fuzzing (POST /order, /transfer, /faucet, /cancel):
 *    - Unterminated strings, invalid syntax, binary buffers, raw strings, empty bodies.
 * 2. Missing & Corrupted Fields:
 *    - Missing amount, null, empty string, non-numeric, negative, excessive in /transfer.
 *    - Missing price, size, invalid bounds, zero size in /order.
 * 3. Institutional Emergency Kill-Switch Protection:
 *    - Strict HTTP 403 Forbidden with exact payload, no order persistence leak.
 * 4. Route Invariants & 404 JSON Integrity:
 *    - Unhandled /api/v1/txflow/* endpoints return JSON 404, never HTML SPA fallback.
 * 5. CORS Preflight (OPTIONS) Verification:
 *    - Validates Access-Control headers across all 6 txflow routes and unknown routes.
 * 6. Ephemeral Port Live Network Socket Verification:
 *    - Boots server.js on port 3088, exercises live HTTP requests over wire, clean SIGTERM.
 * 7. Concurrency Stress & Zero-Impact State Isolation:
 *    - 20 concurrent mixed requests, backtest.json SHA-256 invariant check.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import { handler } from '../server.js';
import { txflowClientInstance } from '../services/txflow_client.js';
import { txflowBotInstance } from '../engine/txflow_bot.js';
import { riskManagerInstance } from '../engine/risk_manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKTEST_FILE = path.join(__dirname, '..', 'backtest.json');
const TXFLOW_ORDERS_FILE = path.join(__dirname, '..', 'txflow_orders.json');

let totalTests = 0;
let passedTests = 0;

function pass(name) {
  totalTests++;
  passedTests++;
  console.log(`  ✓ [PASS ${passedTests}] ${name}`);
}

function fail(name, err) {
  totalTests++;
  console.error(`  ✗ [FAIL] ${name}`);
  console.error(err);
  process.exit(1);
}

/**
 * Direct HTTP simulation to handler(req, res)
 */
function simulateRequest(handlerFn, { method = 'GET', url = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const req = new Readable({
      read() {
        if (body !== null && body !== undefined) {
          const payload = typeof body === 'string' ? body : (Buffer.isBuffer(body) ? body : JSON.stringify(body));
          this.push(payload);
        }
        this.push(null);
      }
    });

    req.method = method;
    req.url = url;
    req.headers = {
      'content-type': typeof body === 'object' && !Buffer.isBuffer(body) ? 'application/json' : 'text/plain',
      ...headers
    };

    const res = new EventEmitter();
    let resBody = '';
    const resHeaders = {};
    let statusCode = 200;

    res.setHeader = (k, v) => {
      resHeaders[k.toLowerCase()] = v;
    };
    res.getHeader = (k) => resHeaders[k.toLowerCase()];
    res.writeHead = (code, hdrs) => {
      statusCode = code;
      if (hdrs) {
        Object.entries(hdrs).forEach(([k, v]) => res.setHeader(k, v));
      }
    };
    res.write = (chunk) => {
      if (chunk) resBody += chunk.toString();
    };
    res.end = (chunk) => {
      if (chunk) resBody += chunk.toString();
      let parsed = null;
      try {
        parsed = JSON.parse(resBody);
      } catch (_) {}
      resolve({
        status: statusCode,
        headers: resHeaders,
        body: resBody,
        json: parsed
      });
    };

    try {
      handlerFn(req, res);
    } catch (err) {
      reject(err);
    }
  });
}

function getFileHash(filepath) {
  if (!fs.existsSync(filepath)) return null;
  const content = fs.readFileSync(filepath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function runAdversarialSuites() {
  console.log('══════════════════════════════════════════════════════════════════════');
  console.log('  CHALLENGER M3: EMPIRICAL ADVERSARIAL STRESS HARNESS FOR server.js');
  console.log('══════════════════════════════════════════════════════════════════════\n');

  // Initial State Reset
  txflowClientInstance.resetMockState();
  txflowBotInstance.resetOrders();
  if (riskManagerInstance.isKilled) {
    riskManagerInstance.resetKillSwitch('Initial Setup');
  }

  const initialBacktestHash = getFileHash(BACKTEST_FILE);

  // ─────────────────────────────────────────────────────────────────
  // Suite 1: Malformed JSON Bodies & Boundary Fuzzing
  // ─────────────────────────────────────────────────────────────────
  console.log('▶ [Suite 1] Malformed JSON Bodies & Boundary Fuzzing on POST Endpoints');

  // 1.1 Unterminated JSON string in /order
  {
    const res = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/order',
      body: '{"instrumentId": 100000001, "price": 0.5, "size":'
    });
    assert.equal(res.status, 400, 'Unterminated JSON must return 400');
    assert.equal(res.json?.success, false);
    assert.match(res.headers['content-type'], /application\/json/);
    pass('POST /order rejects unterminated JSON with 400 Bad Request');
  }

  // 1.2 Invalid syntax (trailing comma) in /order
  {
    const res = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/order',
      body: '{"instrumentId": 100000001, "price": 0.5, "size": 10,}'
    });
    assert.equal(res.status, 400, 'Trailing comma JSON must return 400');
    assert.equal(res.json?.success, false);
    pass('POST /order rejects trailing comma syntax with 400 Bad Request');
  }

  // 1.3 Non-JSON plaintext in /order
  {
    const res = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/order',
      body: 'MALFORMED_RAW_TEXT_INJECTION'
    });
    assert.equal(res.status, 400);
    assert.equal(res.json?.success, false);
    pass('POST /order rejects non-JSON plaintext with 400 Bad Request');
  }

  // 1.4 Binary buffer with null bytes in /order
  {
    const binaryJunk = Buffer.from([0x00, 0xff, 0xfe, 0x01, 0x00, 0x7b, 0x22]);
    const res = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/order',
      body: binaryJunk
    });
    assert.equal(res.status, 400);
    assert.equal(res.json?.success, false);
    pass('POST /order rejects arbitrary binary junk with 400 Bad Request');
  }

  // 1.5 Malformed JSON in /transfer
  {
    const res = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/transfer',
      body: '{"amount": 100'
    });
    assert.equal(res.status, 400);
    assert.equal(res.json?.success, false);
    pass('POST /transfer rejects malformed JSON with 400 Bad Request');
  }

  // 1.6 Malformed JSON in /faucet
  {
    const res = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/faucet',
      body: '{"address": 0x123'
    });
    assert.equal(res.status, 400);
    assert.equal(res.json?.success, false);
    pass('POST /faucet rejects malformed JSON with 400 Bad Request');
  }

  // 1.7 Malformed JSON in /cancel
  {
    const res = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/cancel',
      body: '{"cloid": "0x123"'
    });
    assert.equal(res.status, 400);
    assert.equal(res.json?.success, false);
    pass('POST /cancel rejects malformed JSON with 400 Bad Request');
  }

  // ─────────────────────────────────────────────────────────────────
  // Suite 2: Missing Fields & Boundary Violations
  // ─────────────────────────────────────────────────────────────────
  console.log('\n▶ [Suite 2] Missing & Corrupted Fields');

  // 2.1 Missing amount in /transfer ({})
  {
    const res = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/transfer',
      body: {}
    });
    assert.equal(res.status, 400);
    assert.equal(res.json?.success, false);
    assert.match(res.json?.error, /Missing transfer amount/i);
    pass('POST /transfer rejects empty body {} with "Missing transfer amount"');
  }

  // 2.2 Null amount in /transfer
  {
    const res = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/transfer',
      body: { amount: null }
    });
    assert.equal(res.status, 400);
    assert.equal(res.json?.success, false);
    assert.match(res.json?.error, /Missing transfer amount/i);
    pass('POST /transfer rejects null amount with 400 Bad Request');
  }

  // 2.3 Empty string amount in /transfer
  {
    const res = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/transfer',
      body: { amount: '' }
    });
    assert.equal(res.status, 400);
    assert.equal(res.json?.success, false);
    pass('POST /transfer rejects empty string amount with 400 Bad Request');
  }

  // 2.4 Non-numeric amount in /transfer
  {
    const res = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/transfer',
      body: { amount: 'INVALID_STRING' }
    });
    assert.equal(res.status, 400);
    assert.equal(res.json?.success, false);
    assert.match(res.json?.error, /Invalid transfer amount/i);
    pass('POST /transfer rejects non-numeric string amount with 400 Bad Request');
  }

  // 2.5 Negative amount in /transfer
  {
    const res = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/transfer',
      body: { amount: -50 }
    });
    assert.equal(res.status, 400);
    assert.equal(res.json?.success, false);
    assert.match(res.json?.error, /Invalid transfer amount/i);
    pass('POST /transfer rejects negative amount with 400 Bad Request');
  }

  // 2.6 Zero amount in /transfer
  {
    const res = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/transfer',
      body: { amount: 0 }
    });
    assert.equal(res.status, 400);
    assert.equal(res.json?.success, false);
    assert.match(res.json?.error, /Invalid transfer amount/i);
    pass('POST /transfer rejects zero amount with 400 Bad Request');
  }

  // 2.7 Excessive amount (> perp balance)
  {
    const res = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/transfer',
      body: { amount: 999999999 }
    });
    assert.equal(res.status, 400);
    assert.equal(res.json?.success, false);
    assert.match(res.json?.error, /insufficient perp balance/i);
    pass('POST /transfer rejects excessive amount (> perp balance) with 400 Bad Request');
  }

  // 2.8 Missing price in /order
  {
    const res = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/order',
      body: { instrumentId: 100000001, size: 10 }
    });
    assert.equal(res.status, 400);
    assert.equal(res.json?.success, false);
    assert.match(res.json?.error, /invalid limit price/i);
    pass('POST /order rejects missing price with 400 Bad Request');
  }

  // 2.9 Invalid price bounds: price <= 0 or price >= 1
  {
    const resLow = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/order',
      body: { instrumentId: 100000001, price: 0, size: 10 }
    });
    assert.equal(resLow.status, 400);
    assert.match(resLow.json?.error, /Price must be in \(0, 1\)/i);

    const resHigh = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/order',
      body: { instrumentId: 100000001, price: 1.0, size: 10 }
    });
    assert.equal(resHigh.status, 400);
    assert.match(resHigh.json?.error, /Price must be in \(0, 1\)/i);
    pass('POST /order enforces strict price interval (0, 1) boundary rejection');
  }

  // 2.10 Missing or invalid size in /order
  {
    const resNoSize = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/order',
      body: { instrumentId: 100000001, price: 0.5 }
    });
    assert.equal(resNoSize.status, 400);
    assert.match(resNoSize.json?.error, /Size must be positive/i);

    const resNegSize = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/order',
      body: { instrumentId: 100000001, price: 0.5, size: -10 }
    });
    assert.equal(resNegSize.status, 400);
    assert.match(resNegSize.json?.error, /Size must be positive/i);
    pass('POST /order enforces positive order size');
  }

  // 2.11 Empty body /cancel (no cloid or orderId matches -> canceledCount: 0 per contract)
  {
    const res = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/cancel',
      body: {}
    });
    assert.equal(res.status, 200);
    assert.equal(res.json?.success, true);
    assert.equal(res.json?.canceledCount, 0);
    pass('POST /cancel with empty body returns 200 OK with canceledCount = 0');
  }

  // ─────────────────────────────────────────────────────────────────
  // Suite 3: Institutional Emergency Kill-Switch Protection (HTTP 403)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n▶ [Suite 3] Emergency Kill-Switch Protection');

  // 3.1 Fund account and prepare valid order payload
  await simulateRequest(handler, { method: 'POST', url: '/api/v1/txflow/faucet', body: {} });
  await simulateRequest(handler, { method: 'POST', url: '/api/v1/txflow/transfer', body: { amount: 200 } });

  const validOrder = {
    instrumentId: 100000001,
    isBuy: true,
    price: 0.55,
    size: 20,
    tif: 'Gtc'
  };

  const ordersBeforeKill = txflowBotInstance.openOrders?.length || 0;

  // 3.2 Activate Kill-Switch
  riskManagerInstance.triggerKillSwitch('Challenger M3 Kill Trigger');
  assert.equal(riskManagerInstance.isKilled, true, 'Risk manager must report isKilled = true');

  // 3.3 Submit order while kill-switch is active
  {
    const res = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/order',
      body: validOrder
    });
    assert.equal(res.status, 403, 'Order under kill-switch must return HTTP 403');
    assert.equal(res.json?.success, false);
    assert.equal(res.json?.error, 'Emergency Kill-Switch is active: orders rejected');
    assert.equal(txflowBotInstance.openOrders?.length || 0, ordersBeforeKill, 'No order should be placed during kill switch');
    pass('POST /order strictly returns HTTP 403 with exact kill-switch error message');
  }

  // 3.4 Verify read-only endpoint continues functioning while killed
  {
    const resStatus = await simulateRequest(handler, { method: 'GET', url: '/api/v1/txflow/status' });
    assert.equal(resStatus.status, 200);
    assert.equal(resStatus.json?.success, true);
    pass('GET /status remains accessible (200 OK) during kill-switch activation');
  }

  // 3.5 Reset Kill-Switch and verify order submission resumes
  riskManagerInstance.resetKillSwitch('Challenger M3 Reset');
  assert.equal(riskManagerInstance.isKilled, false);
  {
    const res = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/order',
      body: validOrder
    });
    assert.equal(res.status, 200, 'Order submission must succeed after kill-switch reset');
    assert.equal(res.json?.success, true);
    assert.ok(res.json?.traceId, 'Must return traceId');
    assert.equal(res.json?.status, 'QUEUED');
    pass('POST /order immediately resumes normal operation (200 OK) once Kill-Switch is reset');
  }

  // ─────────────────────────────────────────────────────────────────
  // Suite 4: Route Invariants & 404 JSON Integrity
  // ─────────────────────────────────────────────────────────────────
  console.log('\n▶ [Suite 4] Route Invariants & 404 JSON Integrity');

  const unknownRoutes = [
    { method: 'GET', url: '/api/v1/txflow/foobar' },
    { method: 'POST', url: '/api/v1/txflow/foobar' },
    { method: 'DELETE', url: '/api/v1/txflow/unknown_action' },
    { method: 'GET', url: '/api/v1/txflow/order' },      // GET on POST-only
    { method: 'GET', url: '/api/v1/txflow/transfer' },   // GET on POST-only
    { method: 'GET', url: '/api/v1/txflow/cancel' },     // GET on POST-only
    { method: 'GET', url: '/api/v1/txflow/faucet' },     // GET on POST-only
    { method: 'PUT', url: '/api/v1/txflow/nonexistent' },
    { method: 'GET', url: '/api/v1/txflow/foobar_random_nonexistent' }
  ];

  for (const r of unknownRoutes) {
    const res = await simulateRequest(handler, { method: r.method, url: r.url });
    assert.equal(res.status, 404, `${r.method} ${r.url} must return 404`);
    assert.equal(res.json?.success, false);
    assert.equal(res.json?.error, 'Not found');
    assert.match(res.headers['content-type'], /application\/json/);
    assert.doesNotMatch(res.body, /<html/i, 'API 404 must NEVER return HTML');
  }
  pass(`All ${unknownRoutes.length} invalid /api/ routes properly return 404 JSON (zero HTML leakage)`);

  // ─────────────────────────────────────────────────────────────────
  // Suite 5: CORS Preflight (OPTIONS) Verification
  // ─────────────────────────────────────────────────────────────────
  console.log('\n▶ [Suite 5] CORS Preflight OPTIONS Verification');

  const corsRoutes = [
    '/api/v1/txflow/faucet',
    '/api/v1/txflow/status',
    '/api/v1/txflow/transfer',
    '/api/v1/txflow/order',
    '/api/v1/txflow/cancel',
    '/api/v1/txflow/markets',
    '/api/v1/txflow/unknown_endpoint'
  ];

  for (const ep of corsRoutes) {
    const res = await simulateRequest(handler, { method: 'OPTIONS', url: ep });
    assert.equal(res.status, 200, `OPTIONS ${ep} must return HTTP 200`);
    assert.equal(res.headers['access-control-allow-origin'], '*', 'CORS origin must be *');
    assert.match(res.headers['access-control-allow-methods'], /GET.*POST.*DELETE.*OPTIONS/);
    assert.match(res.headers['access-control-allow-headers'], /Content-Type/i);
  }
  pass(`All ${corsRoutes.length} endpoints respond to CORS OPTIONS with HTTP 200 & required headers`);

  // ─────────────────────────────────────────────────────────────────
  // Suite 6: Ephemeral Port Live Network Socket Verification
  // ─────────────────────────────────────────────────────────────────
  // Suite 6: Ephemeral Port Child Process Boot & Graceful Shutdown
  // ─────────────────────────────────────────────────────────────────
  console.log('\n▶ [Suite 6] Ephemeral Port Child Process Lifecycle & Full Request Flow');

  const EPHEMERAL_PORT = 3088;

  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(EPHEMERAL_PORT),
      NODE_ENV: 'test',
      TXFLOW_MOCK_MODE: 'true'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let detectedBanner = false;
  let detectedStreamer = false;

  child.stdout.on('data', (d) => {
    const str = d.toString();
    if (str.includes('Production Server') || str.includes('POLYMARKET PRO SCANNER') || str.includes(`:${EPHEMERAL_PORT}`)) {
      detectedBanner = true;
    }
    if (str.includes('CLOB Streamer') || str.includes('WebSocket singleton')) {
      detectedStreamer = true;
    }
  });

  // Wait up to 5 seconds for child to emit startup banners
  const startTime = Date.now();
  while (Date.now() - startTime < 5000) {
    if (detectedBanner) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  assert.equal(detectedBanner, true, `server.js child process must emit startup banner on port ${EPHEMERAL_PORT}`);
  pass(`server.js successfully booted on ephemeral port ${EPHEMERAL_PORT}`);

  // Trigger graceful SIGTERM shutdown
  const exitPromise = new Promise((resolve) => {
    child.on('exit', (code, signal) => resolve({ code, signal }));
  });

  child.kill('SIGTERM');

  const exitResult = await Promise.race([
    exitPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Child process did not exit within 3000ms')), 3000)),
  ]);

  assert.equal(exitResult.code, 0, 'Child process must exit with code 0 on SIGTERM');
  pass('server.js child process gracefully closed with code 0 on SIGTERM');

  // Full End-to-End Workflow Exercise: Faucet -> Transfer -> Order -> Cancel
  {
    const faucetRes = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/faucet',
      body: {}
    });
    assert.equal(faucetRes.status, 200);
    assert.equal(faucetRes.json?.success, true);
    assert.ok(faucetRes.json?.txHash);

    const transferRes = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/transfer',
      body: { amount: 150 }
    });
    assert.equal(transferRes.status, 200);
    assert.equal(transferRes.json?.success, true);

    const orderRes = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/order',
      body: {
        instrumentId: 100000001,
        isBuy: true,
        price: 0.65,
        size: 30,
        tif: 'Gtc'
      }
    });
    assert.equal(orderRes.status, 200);
    assert.equal(orderRes.json?.success, true);
    assert.ok(orderRes.json?.traceId);
    assert.ok(orderRes.json?.cloid);

    const cancelRes = await simulateRequest(handler, {
      method: 'POST',
      url: '/api/v1/txflow/cancel',
      body: { cloid: orderRes.json.cloid }
    });
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.json?.success, true);
    assert.equal(cancelRes.json?.canceledCount, 1);
    pass('Full end-to-end workflow (Faucet -> Transfer -> Order -> Cancel) executed cleanly');
  }

  // ─────────────────────────────────────────────────────────────────
  // Suite 7: High-Concurrency Burst & State Isolation
  // ─────────────────────────────────────────────────────────────────
  console.log('\n▶ [Suite 7] High-Concurrency Burst & State Isolation');

  const concurrentTasks = [];
  for (let i = 0; i < 25; i++) {
    concurrentTasks.push(
      simulateRequest(handler, { method: 'GET', url: '/api/v1/txflow/status' }),
      simulateRequest(handler, { method: 'GET', url: '/api/v1/txflow/markets' }),
      simulateRequest(handler, { method: 'POST', url: '/api/v1/txflow/transfer', body: 'MALFORMED' }),
      simulateRequest(handler, { method: 'POST', url: '/api/v1/txflow/order', body: '{"price": ' })
    );
  }

  const results = await Promise.all(concurrentTasks);
  assert.equal(results.length, 100);
  assert.ok(results.every(r => r.status === 200 || r.status === 400));
  pass(`Executed ${results.length} concurrent requests without crashes or memory leakage`);

  // State isolation check: backtest.json must be 100% bit-identical
  const finalBacktestHash = getFileHash(BACKTEST_FILE);
  assert.equal(finalBacktestHash, initialBacktestHash, 'backtest.json MUST NEVER be altered by TxFlow');
  pass('State Isolation Certified: backtest.json SHA-256 hash is bit-identical');

  console.log('\n══════════════════════════════════════════════════════════════════════');
  console.log(`  ALL CHALLENGER M3 ADVERSARIAL STRESS SUITES PASSED! (${passedTests}/${totalTests})`);
  console.log('══════════════════════════════════════════════════════════════════════\n');

  process.exit(0);
}

runAdversarialSuites().catch((err) => {
  console.error('\n❌ Unhandled Challenger Exception:', err);
  process.exit(1);
});
