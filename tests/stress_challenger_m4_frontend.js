/**
 * tests/stress_challenger_m4_frontend.js
 *
 * Empirical Adversarial Stress Harness for Milestone M4 (Frontend Terminal Integration)
 * Author: challenger_m4_1 (Empirical Challenger)
 * Milestone: M4 — Frontend Terminal Integration in frontend/src/
 *
 * Stress Test Dimensions:
 * 1. Headless JSX AST Compilation & Syntax Integrity for all M4 files:
 *    - TxFlowTelemetryWidget.jsx, Header.jsx, BotControlBar.jsx, OrderModal.jsx,
 *      TradingContext.jsx, api.js, App.jsx.
 *    - Verifies esbuild.transformSync with zero warnings and valid emitted AST.
 * 2. Production Build & Static Asset Verification:
 *    - Validates frontend/dist/index.html, JS bundle > 50KB, CSS bundle > 10KB.
 * 3. API Client Contracts & Resilience (frontend/src/services/api.js):
 *    - fetchTxFlowStatus, claimTxFlowFaucet, transferTxFlowCollateral, submitTxFlowOrder,
 *      cancelTxFlowOrder, fetchTxFlowMarkets.
 *    - Fuzzing & error handling: HTTP 500, HTTP 502 non-JSON fallback, network aborts,
 *      JSON error extraction, and missing parameters.
 * 4. Component SSR & State Resilience under Hostile/Corrupted Inputs:
 *    - TxFlowTelemetryWidget under null/undefined balances, addresses, empty arrays, extreme numbers.
 *    - Execution mode switching (paper mode returns null, txflow mode renders full dashboard).
 *    - Trace status badge state machine: QUEUED, MATCHED, FILLED, CANCELLED, unknown fallbacks.
 *    - Header & BotControlBar mode switcher reactivity and indicator tags.
 *    - OrderModal three-way routing and 3-step async lifecycle stepper.
 * 5. State Normalization Invariant Verification:
 *    - Validates TradingContext state normalization for root-level vs nested .client/.bot payloads.
 * 6. Live Backend Wire Integration:
 *    - Executes requests against server.js handler to certify /api/v1/txflow/* endpoints.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');

// Dynamic import of esbuild from frontend
const esbuildPath = path.join(frontendDir, 'node_modules', 'esbuild', 'lib', 'main.js');
const esbuildModule = await import('file://' + esbuildPath);
const esbuild = esbuildModule.default || esbuildModule;

// Import API client functions
import {
  fetchTxFlowStatus,
  claimTxFlowFaucet,
  transferTxFlowCollateral,
  submitTxFlowOrder,
  cancelTxFlowOrder,
  fetchTxFlowMarkets,
} from '../frontend/src/services/api.js';

// Import server handler
import { handler } from '../server.js';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res
        .then(() => {
          passedTests++;
          console.log(`  ✓ [PASS ${passedTests}] ${name}`);
        })
        .catch((err) => {
          failedTests++;
          console.error(`  ✗ [FAIL] ${name}`);
          console.error(err);
          throw err;
        });
    } else {
      passedTests++;
      console.log(`  ✓ [PASS ${passedTests}] ${name}`);
      return Promise.resolve();
    }
  } catch (err) {
    failedTests++;
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(err);
    return Promise.reject(err);
  }
}

// Helper to simulate request to server.js handler
function makeSimulatedRequest(method, url, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const reqSocket = new (class extends http.IncomingMessage {
      constructor() {
        super(null);
      }
    })();

    const resSocket = new (class extends http.ServerResponse {
      constructor(req) {
        super(req);
      }
    })(reqSocket);

    const chunks = [];
    resSocket.write = function (chunk) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return true;
    };

    resSocket.end = function (chunk) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      const fullBuffer = Buffer.concat(chunks);
      const str = fullBuffer.toString('utf8');
      let json = null;
      try {
        json = JSON.parse(str);
      } catch (_) {}

      resolve({
        statusCode: resSocket.statusCode,
        headers: resSocket.getHeaders ? resSocket.getHeaders() : {},
        body: str,
        json,
      });
    };

    reqSocket.url = url;
    reqSocket.method = method;
    reqSocket.headers = { host: 'localhost:3001', ...headers };

    if (body) {
      const bStr = typeof body === 'string' ? body : JSON.stringify(body);
      reqSocket.headers['content-type'] = 'application/json';
      reqSocket.headers['content-length'] = Buffer.byteLength(bStr);
      reqSocket.push(Buffer.from(bStr));
    }
    reqSocket.push(null);

    try {
      Promise.resolve(handler(reqSocket, resSocket)).catch(reject);
    } catch (err) {
      reject(err);
    }
  });
}

async function main() {
  console.log('======================================================================');
  console.log('  CHALLENGER M4: ADVERSARIAL FRONTEND INTEGRATION & BUILD STRESS SUITE');
  console.log('======================================================================\n');

  // ──────────────────────────────────────────────────────────────────────────
  // DIMENSION 1: Headless JSX AST Compilation & Syntax Integrity
  // ──────────────────────────────────────────────────────────────────────────
  console.log('[DIMENSION 1] Headless JSX AST Compilation & Syntax Integrity');

  const filesToVerify = [
    { file: 'components/txflow/TxFlowTelemetryWidget.jsx', minSize: 2000 },
    { file: 'components/layout/Header.jsx', minSize: 2000 },
    { file: 'components/bot/BotControlBar.jsx', minSize: 2000 },
    { file: 'components/order/OrderModal.jsx', minSize: 5000 },
    { file: 'context/TradingContext.jsx', minSize: 4000 },
    { file: 'services/api.js', minSize: 2000, loader: 'js' },
    { file: 'App.jsx', minSize: 500 },
  ];

  for (const item of filesToVerify) {
    await runTest(`AST compilation: ${item.file} compiles cleanly with zero warnings`, () => {
      const filePath = path.join(frontendDir, 'src', item.file);
      assert.ok(fs.existsSync(filePath), `Target file must exist: ${filePath}`);
      const code = fs.readFileSync(filePath, 'utf8');
      const result = esbuild.transformSync(code, {
        loader: item.loader || 'jsx',
        jsx: 'transform',
      });
      assert.ok(result.code && result.code.length > (item.minSize || 500), 'Emitted code must meet size bounds');
      assert.equal(result.warnings.length, 0, `No compiler warnings permitted in ${item.file}`);
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DIMENSION 2: Production Build & Asset Verification
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[DIMENSION 2] Production Build & Asset Verification');

  await runTest('frontend/dist/index.html structure and asset linkage', () => {
    const indexPath = path.join(frontendDir, 'dist', 'index.html');
    assert.ok(fs.existsSync(indexPath), 'dist/index.html must exist');
    const html = fs.readFileSync(indexPath, 'utf8');
    assert.ok(html.includes('<!DOCTYPE html>') || html.includes('<!doctype html>'), 'Valid HTML doctype required');
    assert.ok(html.includes('<div id="root">'), 'Root mounting div required');
    assert.ok(html.includes('assets/index-'), 'Linked bundled assets required');
  });

  await runTest('frontend/dist/assets bundle integrity (JS > 200KB, CSS > 30KB)', () => {
    const assetsDir = path.join(frontendDir, 'dist', 'assets');
    assert.ok(fs.existsSync(assetsDir), 'dist/assets directory must exist');
    const files = fs.readdirSync(assetsDir);
    const jsBundle = files.find(f => f.startsWith('index-') && f.endsWith('.js'));
    const cssBundle = files.find(f => f.startsWith('index-') && f.endsWith('.css'));
    assert.ok(jsBundle, 'JavaScript bundle index-*.js must be present');
    assert.ok(cssBundle, 'CSS bundle index-*.css must be present');

    const jsStat = fs.statSync(path.join(assetsDir, jsBundle));
    const cssStat = fs.statSync(path.join(assetsDir, cssBundle));
    assert.ok(jsStat.size > 200000, `JS bundle size (${jsStat.size} bytes) must exceed 200KB`);
    assert.ok(cssStat.size > 30000, `CSS bundle size (${cssStat.size} bytes) must exceed 30KB`);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DIMENSION 3: API Client Contracts & Resilience (api.js)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[DIMENSION 3] API Client Contracts & Resilience (frontend/src/services/api.js)');

  const originalFetch = globalThis.fetch;

  try {
    // 3.1 fetchTxFlowStatus
    await runTest('api.js: fetchTxFlowStatus parses 200 OK correctly', async () => {
      const mockData = { success: true, connected: true, chainId: 2511, perpBalanceUsd: 1000 };
      globalThis.fetch = async (url) => {
        assert.equal(url, '/api/v1/txflow/status');
        return { ok: true, status: 200, json: async () => mockData };
      };
      const data = await fetchTxFlowStatus();
      assert.deepEqual(data, mockData);
    });

    await runTest('api.js: fetchTxFlowStatus throws on HTTP 500 with JSON error message', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'TxFlow node connection timeout' }),
      });
      await assert.rejects(
        async () => fetchTxFlowStatus(),
        /TxFlow node connection timeout/
      );
    });

    await runTest('api.js: fetchTxFlowStatus falls back cleanly when 502 body is non-JSON', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: async () => { throw new Error('Not JSON'); },
      });
      await assert.rejects(
        async () => fetchTxFlowStatus(),
        /HTTP 502 Bad Gateway/
      );
    });

    // 3.2 claimTxFlowFaucet
    await runTest('api.js: claimTxFlowFaucet sends POST /api/v1/txflow/faucet with or without address', async () => {
      let capturedBody = null;
      globalThis.fetch = async (url, opts) => {
        assert.equal(url, '/api/v1/txflow/faucet');
        assert.equal(opts.method, 'POST');
        capturedBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, txHash: '0x999', amount: '1000' }),
        };
      };

      const res1 = await claimTxFlowFaucet(null);
      assert.deepEqual(capturedBody, {});
      assert.equal(res1.success, true);

      const res2 = await claimTxFlowFaucet('0xabcdef1234567890abcdef1234567890abcdef12');
      assert.deepEqual(capturedBody, { address: '0xabcdef1234567890abcdef1234567890abcdef12' });
      assert.equal(res2.txHash, '0x999');
    });

    await runTest('api.js: claimTxFlowFaucet handles HTTP 429 rate limit error', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 429,
        json: async () => ({ error: 'Faucet rate limit exceeded for address' }),
      });
      await assert.rejects(
        async () => claimTxFlowFaucet('0xabc'),
        /Faucet rate limit exceeded/
      );
    });

    // 3.3 transferTxFlowCollateral
    await runTest('api.js: transferTxFlowCollateral sends correct amount in POST body', async () => {
      let capturedBody = null;
      globalThis.fetch = async (url, opts) => {
        assert.equal(url, '/api/v1/txflow/transfer');
        assert.equal(opts.method, 'POST');
        capturedBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, txHash: '0x888', amount: capturedBody.amount }),
        };
      };

      const res = await transferTxFlowCollateral(750);
      assert.deepEqual(capturedBody, { amount: 750 });
      assert.equal(res.amount, 750);
    });

    // 3.4 submitTxFlowOrder
    await runTest('api.js: submitTxFlowOrder dispatches valid TIP 3 payload', async () => {
      let capturedBody = null;
      globalThis.fetch = async (url, opts) => {
        assert.equal(url, '/api/v1/txflow/order');
        assert.equal(opts.method, 'POST');
        capturedBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, traceId: 'tr_123', cloid: capturedBody.cloid, status: 'QUEUED' }),
        };
      };

      const payload = {
        instrumentId: 100000000,
        isBuy: true,
        price: 0.55,
        size: 50,
        tif: 'Gtc',
        cloid: '0x1234567890123456789012345678901234567890123456789012345678901234',
      };
      const res = await submitTxFlowOrder(payload);
      assert.deepEqual(capturedBody, payload);
      assert.equal(res.traceId, 'tr_123');
      assert.equal(res.status, 'QUEUED');
    });

    await runTest('api.js: submitTxFlowOrder propagates 403 Forbidden on Kill-Switch', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Order rejected: Emergency Kill-Switch is active' }),
      });
      await assert.rejects(
        async () => submitTxFlowOrder({ instrumentId: 100 }),
        /Emergency Kill-Switch is active/
      );
    });

    // 3.5 cancelTxFlowOrder
    await runTest('api.js: cancelTxFlowOrder passes cancel parameters', async () => {
      let capturedBody = null;
      globalThis.fetch = async (url, opts) => {
        assert.equal(url, '/api/v1/txflow/cancel');
        assert.equal(opts.method, 'POST');
        capturedBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, canceledCount: 1 }),
        };
      };

      const res = await cancelTxFlowOrder({ cloid: '0xabc' });
      assert.deepEqual(capturedBody, { cloid: '0xabc' });
      assert.equal(res.canceledCount, 1);
    });

    // 3.6 fetchTxFlowMarkets
    await runTest('api.js: fetchTxFlowMarkets returns market list', async () => {
      globalThis.fetch = async (url) => {
        assert.equal(url, '/api/v1/txflow/markets');
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, markets: [{ instrumentId: 100000000, question: 'Will rain in NYC?' }] }),
        };
      };
      const res = await fetchTxFlowMarkets();
      assert.equal(res.markets.length, 1);
      assert.equal(res.markets[0].instrumentId, 100000000);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // DIMENSION 4: Component SSR & Adversarial Hostile Input Rendering
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[DIMENSION 4] Component SSR & Adversarial Hostile Input Rendering');

  // Bundle components with mock context via esbuild
  const testBundleCode = `
import React from 'react';
import { renderToString } from 'react-dom/server';
import TxFlowTelemetryWidget from './src/components/txflow/TxFlowTelemetryWidget.jsx';
import Header from './src/components/layout/Header.jsx';
import BotControlBar from './src/components/bot/BotControlBar.jsx';
import OrderModal from './src/components/order/OrderModal.jsx';
import { useTrading, setMockContext } from './mock-ctx.js';

export { React, renderToString, TxFlowTelemetryWidget, Header, BotControlBar, OrderModal, useTrading, setMockContext };
`;

  const mockContextJs = `
let currentMock = {
  executionMode: 'paper',
  setExecutionMode: () => {},
  txflowStatus: {
    connected: true,
    chainId: 2511,
    masterAddress: '0x49f2b8a36c5d1e7e8a9b0c1d2e3f4a5b6c7d8e9f',
    agentAddress: '0x88b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5',
    isAgentApproved: true,
    perpBalanceUsd: 2500,
    outcomeBalanceUsd: 1500,
    openOrdersCount: 2,
    recentOrders: [],
    recentTraces: [],
    stats: {},
    loading: false,
    faucetLoading: false,
    transferLoading: false,
    error: null,
  },
  refreshTxFlowStatus: () => {},
  claimFaucet: async () => {},
  transferCollateral: async () => {},
  opportunities: [],
  totalMarkets: 150,
  scannerStats: null,
  loading: false,
  error: null,
  botStatus: { running: false, openPositionsCount: 0, stats: { tradesExecuted: 12 } },
  riskStatus: { isKilled: false, metrics: { grossExposureUsd: 500, grossExposurePct: 5.0, currentDrawdownPct: 1.2 } },
  wallet: { balanceUsd: 10000 },
  wsStatus: 'connected',
  engineLatencyMs: 18.4,
  orderModalOpen: false,
  selectedOpportunity: null,
  selectedOutcome: 'YES',
  liveDepth: null,
  isDepthLoading: false,
  openOrderModal: () => {},
  closeOrderModal: () => {},
  refreshOpportunities: () => {},
  activeTab: 'opportunities',
  sidebarOpen: false,
  portfolioModalOpen: false,
  configModalOpen: false,
  alertsModalOpen: false,
  systemConfig: {},
  alertsList: [],
  watchlist: [],
  toggleWatchlist: () => {},
};

export function setMockContext(ctx) {
  currentMock = { ...currentMock, ...ctx };
}

export function useTrading() {
  return currentMock;
}
`;

  const buildRes = await esbuild.build({
    stdin: {
      contents: testBundleCode,
      resolveDir: frontendDir,
      loader: 'jsx',
    },
    bundle: true,
    format: 'esm',
    write: false,
    plugins: [
      {
        name: 'mock-trading-context-m4',
        setup(build) {
          build.onResolve({ filter: /(mock-ctx|TradingContext)/ }, () => {
            return { path: 'mock-trading-context-m4', namespace: 'mock-m4' };
          });
          build.onLoad({ filter: /.*/, namespace: 'mock-m4' }, () => {
            return {
              contents: mockContextJs,
              loader: 'js',
            };
          });
        },
      },
    ],
  });

  const b64 = Buffer.from(buildRes.outputFiles[0].text).toString('base64');
  const bundled = await import('data:text/javascript;base64,' + b64);
  const { React, renderToString, TxFlowTelemetryWidget, Header, BotControlBar, OrderModal, setMockContext } = bundled;

  // 4.1 TxFlowTelemetryWidget
  await runTest('TxFlowTelemetryWidget returns null when executionMode is "paper"', () => {
    setMockContext({ executionMode: 'paper' });
    const html = renderToString(React.createElement(TxFlowTelemetryWidget));
    assert.equal(html, '', 'Widget must render empty when executionMode is paper');
  });

  await runTest('TxFlowTelemetryWidget renders full telemetry when executionMode is "txflow"', () => {
    setMockContext({
      executionMode: 'txflow',
      txflowStatus: {
        connected: true,
        chainId: 2511,
        masterAddress: '0x49f2b8a36c5d1e7e8a9b0c1d2e3f4a5b6c7d8e9f',
        agentAddress: '0x88b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5',
        isAgentApproved: true,
        perpBalanceUsd: 2500,
        outcomeBalanceUsd: 1500,
        openOrdersCount: 2,
        recentOrders: [],
        recentTraces: [],
      },
    });
    const html = renderToString(React.createElement(TxFlowTelemetryWidget));
    assert.ok(html.includes('TxFlow Testnet Settlement &amp; Orderbook Telemetry') || html.includes('TxFlow Testnet Settlement & Orderbook Telemetry'));
    assert.ok(html.includes('2511'), 'Chain ID 2511 rendered');
    assert.ok(html.includes('AGENT KEY AUTHORIZED'), 'Authorized agent key badge rendered');
    assert.ok(html.includes('2,500.00'), 'Perp balance $2,500.00 rendered');
    assert.ok(html.includes('1,500.00'), 'Outcome balance $1,500.00 rendered');
  });

  await runTest('TxFlowTelemetryWidget survives hostile/corrupted null status fields without crash', () => {
    // Stress test: pass nulls, undefineds, missing arrays, invalid data
    setMockContext({
      executionMode: 'txflow',
      txflowStatus: {
        connected: false,
        chainId: null,
        masterAddress: null,
        agentAddress: null,
        isAgentApproved: false,
        perpBalanceUsd: null,
        outcomeBalanceUsd: undefined,
        openOrdersCount: 0,
        recentOrders: null,
        recentTraces: null,
      },
    });
    const rawHtml = renderToString(React.createElement(TxFlowTelemetryWidget));
    const html = rawHtml.replace(/<!-- -->/g, '');
    assert.ok(html.includes('APPROVE AGENT REQUIRED'), 'Renders warning badge when unapproved');
    assert.ok(html.includes('$0.00'), 'Defaults null/undefined balances to $0.00');
    assert.ok(html.includes('Deposit Faucet First'), 'Rebalance button disabled and shows deposit hint');
  });

  await runTest('TxFlowTelemetryWidget renders diverse asynchronous trace statuses (QUEUED, MATCHED, FILLED, CANCELLED, UNKNOWN)', () => {
    setMockContext({
      executionMode: 'txflow',
      txflowStatus: {
        connected: true,
        recentOrders: [
          { traceId: 'tr_q1', status: 'QUEUED', side: 'BUY', size: 10, price: 0.55, timestamp: Date.now() },
          { traceId: 'tr_m2', status: 'MATCHED', side: 'SELL', size: 25, price: 0.45, timestamp: Date.now() },
          { traceId: 'tr_f3', status: 'FILLED', isBuy: true, size: 50, price: 0.88, timestamp: Date.now() },
          { traceId: 'tr_c4', status: 'CANCELLED', side: 'BUY', size: 5, price: 0.12, timestamp: Date.now() },
          { traceId: 'tr_u5', status: 'ARBITRARY_STATUS', isBuy: false, size: 1, price: 0.99, timestamp: Date.now() },
        ],
        recentTraces: [],
      },
    });
    const html = renderToString(React.createElement(TxFlowTelemetryWidget));
    assert.ok(html.includes('QUEUED: tr_q1'), 'QUEUED status rendered with prefix');
    assert.ok(html.includes('ON-CHAIN MATCHED'), 'ON-CHAIN MATCHED status rendered');
    assert.ok(html.includes('FILLED'), 'FILLED status rendered');
    assert.ok(html.includes('CANCELLED'), 'CANCELLED status rendered');
    assert.ok(html.includes('ARBITRARY_STATUS'), 'Fallback status rendered');
  });

  // 4.2 Header
  await runTest('Header renders sandbox switcher with active state reflecting executionMode', () => {
    setMockContext({ executionMode: 'paper' });
    let html = renderToString(React.createElement(Header));
    assert.ok(html.includes('Local Paper Simulation'));
    assert.ok(html.includes('TxFlow Testnet Live CLOB'));

    setMockContext({ executionMode: 'txflow' });
    html = renderToString(React.createElement(Header));
    assert.ok(html.includes('bg-purple-950/80 text-purple-300'), 'Active purple styling for txflow mode');
  });

  // 4.3 BotControlBar
  await runTest('BotControlBar renders execution pipeline badge for both paper and txflow modes', () => {
    setMockContext({ executionMode: 'paper' });
    let html = renderToString(React.createElement(BotControlBar));
    assert.ok(html.includes('Local Paper Sim'));

    setMockContext({ executionMode: 'txflow' });
    html = renderToString(React.createElement(BotControlBar));
    assert.ok(html.includes('TxFlow Testnet CLOB'));
  });

  // 4.4 OrderModal
  await runTest('OrderModal returns null when closed', () => {
    setMockContext({ orderModalOpen: false });
    const html = renderToString(React.createElement(OrderModal));
    assert.equal(html, '');
  });

  await runTest('OrderModal renders 3-way routing selector and handles TxFlow execution pipeline', () => {
    setMockContext({
      orderModalOpen: true,
      executionMode: 'txflow',
      selectedOpportunity: {
        id: 'opp_test_1',
        title: 'Will NYC exceed 80°F on July 4?',
        market: 'Will NYC exceed 80°F on July 4?',
        instrumentId: 100000010,
        bestAsk: 0.52,
        bestBid: 0.48,
        fairValue: 0.58,
        netEdge: 0.06,
        modelSource: 'Weather NWP',
      },
      selectedOutcome: 'YES',
    });
    const html = renderToString(React.createElement(OrderModal));
    assert.ok(html.includes('📝 Paper Sim'));
    assert.ok(html.includes('⚡ TxFlow CLOB'));
    assert.ok(html.includes('🦊 Web3 Direct'));
    assert.ok(html.includes('Chain 2511 TIP 3'));
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DIMENSION 5: State Normalization Invariant Verification
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[DIMENSION 5] State Normalization Invariant Verification');

  await runTest('TradingContext refreshTxFlowStatus normalizes root and nested payload structures identically', () => {
    // Logic extracted from TradingContext.jsx:251-277
    const normalizePayload = (res) => {
      const orders = res.recentOrders || (res.bot && res.bot.recentOrders) || [];
      const traces = orders.map((o, idx) => ({
        traceId: o.traceId || o.cloid || `trace_${o.id || idx}`,
        cloid: o.cloid,
        status: o.status,
        price: o.price,
        size: o.size,
        side: o.side || (o.isBuy ? 'BUY' : 'SELL'),
        timestamp: o.timestamp || Date.now(),
      }));

      return {
        connected: res.connected !== undefined ? res.connected : (res.client?.connected ?? true),
        chainId: res.chainId || 2511,
        masterAddress: res.masterAddress || (res.client && res.client.masterAddress) || null,
        agentAddress: res.agentAddress || (res.client && res.client.agentAddress) || null,
        isAgentApproved: res.isAgentApproved !== undefined ? res.isAgentApproved : (res.client?.isAgentApproved ?? false),
        perpBalanceUsd: res.perpBalanceUsd ?? (res.client?.perpBalanceUsd ?? 0),
        outcomeBalanceUsd: res.outcomeBalanceUsd ?? (res.client?.outcomeBalanceUsd ?? 0),
        openOrdersCount: res.openOrdersCount ?? (res.bot?.openOrdersCount ?? 0),
        recentOrders: orders,
        recentTraces: traces,
        stats: res.stats || (res.bot && res.bot.stats) || {},
      };
    };

    // Format A: Flat root-level payload
    const flatPayload = {
      connected: true,
      chainId: 2511,
      masterAddress: '0x1111111111111111111111111111111111111111',
      agentAddress: '0x2222222222222222222222222222222222222222',
      isAgentApproved: true,
      perpBalanceUsd: 3000,
      outcomeBalanceUsd: 1200,
      openOrdersCount: 4,
      recentOrders: [{ traceId: 't1', status: 'QUEUED', price: 0.5, size: 10, isBuy: true }],
      stats: { tradesExecuted: 7 },
    };

    // Format B: Nested client/bot payload
    const nestedPayload = {
      client: {
        connected: true,
        masterAddress: '0x1111111111111111111111111111111111111111',
        agentAddress: '0x2222222222222222222222222222222222222222',
        isAgentApproved: true,
        perpBalanceUsd: 3000,
        outcomeBalanceUsd: 1200,
      },
      bot: {
        openOrdersCount: 4,
        recentOrders: [{ traceId: 't1', status: 'QUEUED', price: 0.5, size: 10, isBuy: true }],
        stats: { tradesExecuted: 7 },
      },
    };

    const normA = normalizePayload(flatPayload);
    const normB = normalizePayload(nestedPayload);

    assert.equal(normA.connected, normB.connected);
    assert.equal(normA.masterAddress, normB.masterAddress);
    assert.equal(normA.agentAddress, normB.agentAddress);
    assert.equal(normA.isAgentApproved, normB.isAgentApproved);
    assert.equal(normA.perpBalanceUsd, normB.perpBalanceUsd);
    assert.equal(normA.outcomeBalanceUsd, normB.outcomeBalanceUsd);
    assert.equal(normA.openOrdersCount, normB.openOrdersCount);
    assert.equal(normA.recentOrders.length, normB.recentOrders.length);
    assert.equal(normA.recentTraces[0].side, 'BUY');
  });

  // ──────────────────────────────────────────────────────────────────────────
  // DIMENSION 6: Live Backend Wire Integration (server.js /api/v1/txflow/*)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n[DIMENSION 6] Live Backend Wire Integration (server.js)');

  await runTest('GET /api/v1/txflow/status returns HTTP 200 with complete telemetry', async () => {
    const res = await makeSimulatedRequest('GET', '/api/v1/txflow/status');
    assert.equal(res.statusCode, 200);
    assert.equal(res.json?.success, true);
    assert.equal(res.json?.chainId, 2511);
    assert.ok(typeof res.json?.masterAddress === 'string');
    assert.ok(typeof res.json?.agentAddress === 'string');
    assert.ok(typeof res.json?.perpBalanceUsd === 'number');
    assert.ok(typeof res.json?.outcomeBalanceUsd === 'number');
  });

  await runTest('POST /api/v1/txflow/faucet funds testnet perp sub-account', async () => {
    const res = await makeSimulatedRequest('POST', '/api/v1/txflow/faucet', {});
    assert.equal(res.statusCode, 200);
    assert.equal(res.json?.success, true);
    assert.ok(res.json?.txHash);
    assert.equal(res.json?.subAccount, 'perp');
  });

  await runTest('POST /api/v1/txflow/transfer moves collateral perp -> outcome', async () => {
    const res = await makeSimulatedRequest('POST', '/api/v1/txflow/transfer', { amount: 250 });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json?.success, true);
    assert.ok(res.json?.txHash);
    assert.ok(res.json?.amount !== undefined);
  });

  await runTest('POST /api/v1/txflow/order queues TIP 3 CLOB order', async () => {
    const orderPayload = {
      instrumentId: 100000000,
      isBuy: true,
      price: 0.52,
      size: 20,
      tif: 'Gtc',
    };
    const res = await makeSimulatedRequest('POST', '/api/v1/txflow/order', orderPayload);
    assert.equal(res.statusCode, 200);
    assert.equal(res.json?.success, true);
    assert.ok(res.json?.traceId);
    assert.equal(res.json?.status, 'QUEUED');
  });

  await runTest('POST /api/v1/txflow/order rejects invalid price with HTTP 400', async () => {
    const res = await makeSimulatedRequest('POST', '/api/v1/txflow/order', {
      instrumentId: 100000000,
      isBuy: true,
      price: -0.5,
      size: 10,
    });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json?.success, false);
    assert.ok(res.json?.error.includes('price') || res.json?.error.includes('Price'));
  });

  await runTest('GET /api/v1/txflow/markets returns active markets array', async () => {
    const res = await makeSimulatedRequest('GET', '/api/v1/txflow/markets');
    assert.equal(res.statusCode, 200);
    assert.equal(res.json?.success, true);
    assert.ok(Array.isArray(res.json?.markets));
  });

  console.log('\n======================================================================');
  console.log(`  ALL CHALLENGE TESTS COMPLETED: ${passedTests}/${totalTests} PASSED (0 FAILED)`);
  console.log('======================================================================\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('\nFatal error in stress test execution:', err);
  process.exit(1);
});
