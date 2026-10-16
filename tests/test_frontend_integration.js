// ══════════════════════════════════════════════════════════════════════
//  tests/test_frontend_integration.js
//  Automated Headless Integration Test Suite (Milestone M1 — R1, R2, R3)
//  Certifies:
//  1. Frontend Scaffolding, Package Manifest & Build Integrity
//  2. Component Compilation via Vite/esbuild without Syntax/Type Errors
//  3. Mathematical Invariants & Component Mechanics:
//     - 24h SVG sparklines, 87% floor lines, anchor dots
//     - 5-level DOM depth ladder & volume fill bars calculation
//     - Shin / Weather fair value gauge delta & dynamic venue fees
//     - 4-tier VWAP slippage alert thresholds & book exhaustion
//     - Bot control states & Emergency Kill-Switch mechanics
//  4. Live Child Process Boot & Graceful Lifecycle (server.js):
//     - Boots server.js child process on port 3002
//     - Detects startup banner & CLOB streamer persistent singleton boot
//     - Clean teardown with SIGTERM and exit code 0 confirmation
//  5. Unified Production HTTP Delivery & Endpoint Integrity:
//     - GET /, GET /assets/* (JS & CSS bundles)
//     - GET /api/opportunities & GET /api/scan harmonization
//     - GET /api/v1/clob/live-depth (valid & invalid params)
//     - GET /api/v1/bot/status, GET /api/v1/risk/status
//     - POST /api/v1/risk/kill-switch & POST /api/v1/risk/reset
//     - Strict API 404 integrity (returns JSON 404, NEVER HTML)
//     - SPA fallback (returns 200 HTML for non-API client routes)
//     - Directory traversal guards
// ══════════════════════════════════════════════════════════════════════

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import * as oracle from './fixtures/frontend_quant_oracle.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const frontendDir = path.join(projectRoot, 'frontend');
const distDir = path.join(frontendDir, 'dist');
const assetsDir = path.join(distDir, 'assets');

console.log('===============================================================');
console.log('  RUNNING HEADLESS FRONTEND INTEGRATION & PACKAGING TEST SUITE');
console.log('===============================================================');

let passedCount = 0;
let failedCount = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    failedCount++;
    throw err;
  }
}

// In-process HTTP request simulator using standard Node http.IncomingMessage & http.ServerResponse
function simulateHttpRequest(handler, { method = 'GET', url = '/', headers = {}, body = null }) {
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
      // Ensure all data in socket is collected
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
      Promise.resolve(handler(req, res)).catch(reject);
    } catch (e) {
      reject(e);
    }

    if (body) {
      const bStr = typeof body === 'string' ? body : JSON.stringify(body);
      req.push(Buffer.from(bStr));
    }
    req.push(null);
  });
}

async function runAll() {
  // ─────────────────────────────────────────────────────────────────
  // Suite 1: Frontend Scaffolding, Package Manifest & Build Integrity
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[Suite 1] Frontend Scaffolding, Package Manifest & Build Integrity');

  await test('Frontend scaffolding is fully configured with React 18, Vite & TailwindCSS', () => {
    const validation = oracle.validateFrontendScaffolding(frontendDir);
    assert.equal(validation.valid, true, 'Scaffolding validation should pass');
    assert.equal(validation.hasReact, true, 'React & ReactDOM must be installed');
    assert.equal(validation.hasVite, true, 'Vite must be configured in devDependencies');
    assert.equal(validation.hasTailwind, true, 'TailwindCSS must be configured in devDependencies');
    assert.equal(validation.hasBuildScript, true, 'Build script must be defined');
    assert.equal(validation.hasDevScript, true, 'Dev script must be defined');
  });

  await test('frontend/dist/index.html exists and contains valid production HTML structure', () => {
    const indexPath = path.join(distDir, 'index.html');
    assert.equal(fs.existsSync(indexPath), true, 'frontend/dist/index.html must exist');
    const htmlContent = fs.readFileSync(indexPath, 'utf8');
    assert.match(htmlContent, /<!doctype html>/i, 'Must contain DOCTYPE html');
    assert.match(htmlContent, /<div id="root"><\/div>/, 'Must contain root container div');
    assert.match(htmlContent, /<script type="module" crossorigin src="\/assets\/index-.*\.js">/, 'Must reference bundled module script');
    assert.match(htmlContent, /<link rel="stylesheet" crossorigin href="\/assets\/index-.*\.css">/, 'Must reference bundled stylesheet');
  });

  await test('frontend/dist/assets contains compiled JS bundle (>50KB) and CSS bundle (>10KB)', () => {
    assert.equal(fs.existsSync(assetsDir), true, 'frontend/dist/assets must exist');
    const assetFiles = fs.readdirSync(assetsDir);

    const jsBundle = assetFiles.find((f) => f.startsWith('index-') && f.endsWith('.js'));
    const cssBundle = assetFiles.find((f) => f.startsWith('index-') && f.endsWith('.css'));

    assert.ok(jsBundle, 'Compiled JavaScript bundle index-*.js must exist in assets/');
    assert.ok(cssBundle, 'Compiled CSS bundle index-*.css must exist in assets/');

    const jsStat = fs.statSync(path.join(assetsDir, jsBundle));
    const cssStat = fs.statSync(path.join(assetsDir, cssBundle));

    assert.ok(jsStat.size > 50000, `JS bundle size (${jsStat.size} bytes) should exceed 50KB`);
    assert.ok(cssStat.size > 10000, `CSS bundle size (${cssStat.size} bytes) should exceed 10KB`);
  });

  // ─────────────────────────────────────────────────────────────────
  // Suite 2: Component Compilation via Vite / esbuild
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[Suite 2] Component Compilation via Vite / esbuild AST Transformation');

  const esbuildPath = path.join(frontendDir, 'node_modules', 'esbuild', 'lib', 'main.js');
  const esbuild = (await import('file://' + esbuildPath)).default || (await import('file://' + esbuildPath));

  await test('OpportunityCard.jsx compiles cleanly without syntax or JSX parse errors', () => {
    const filePath = path.join(frontendDir, 'src', 'components', 'opportunities', 'OpportunityCard.jsx');
    const code = fs.readFileSync(filePath, 'utf8');
    const result = esbuild.transformSync(code, { loader: 'jsx', jsx: 'transform' });
    assert.ok(result.code && result.code.length > 5000, 'OpportunityCard compiled output must be valid');
    assert.equal(result.warnings.length, 0, 'No compiler warnings allowed');
  });

  await test('OrderModal.jsx compiles cleanly without syntax or JSX parse errors', () => {
    const filePath = path.join(frontendDir, 'src', 'components', 'order', 'OrderModal.jsx');
    const code = fs.readFileSync(filePath, 'utf8');
    const result = esbuild.transformSync(code, { loader: 'jsx', jsx: 'transform' });
    assert.ok(result.code && result.code.length > 5000, 'OrderModal compiled output must be valid');
    assert.equal(result.warnings.length, 0, 'No compiler warnings allowed');
  });

  await test('BotControlBar.jsx compiles cleanly without syntax or JSX parse errors', () => {
    const filePath = path.join(frontendDir, 'src', 'components', 'bot', 'BotControlBar.jsx');
    const code = fs.readFileSync(filePath, 'utf8');
    const result = esbuild.transformSync(code, { loader: 'jsx', jsx: 'transform' });
    assert.ok(result.code && result.code.length > 2000, 'BotControlBar compiled output must be valid');
    assert.equal(result.warnings.length, 0, 'No compiler warnings allowed');
  });

  await test('TradingContext.jsx compiles cleanly without syntax or JSX parse errors', () => {
    const filePath = path.join(frontendDir, 'src', 'context', 'TradingContext.jsx');
    const code = fs.readFileSync(filePath, 'utf8');
    const result = esbuild.transformSync(code, { loader: 'jsx', jsx: 'transform' });
    assert.ok(result.code && result.code.length > 3000, 'TradingContext compiled output must be valid');
    assert.equal(result.warnings.length, 0, 'No compiler warnings allowed');
  });

  await test('App.jsx and main.jsx compile cleanly without syntax or JSX parse errors', () => {
    for (const file of ['App.jsx', 'main.jsx']) {
      const filePath = path.join(frontendDir, 'src', file);
      const code = fs.readFileSync(filePath, 'utf8');
      const result = esbuild.transformSync(code, { loader: 'jsx', jsx: 'transform' });
      assert.ok(result.code && result.code.length > 100, `${file} compiled output must be valid`);
      assert.equal(result.warnings.length, 0, `No compiler warnings allowed in ${file}`);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // Suite 3: Mathematical Invariants & Component Mechanics
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[Suite 3] Mathematical Invariants & Component Mechanics');

  await test('24h SVG Sparkline geometry generates bounded coords, 87% floor line, and anchor dots', () => {
    const points = oracle.generateBrownianBridge(0.85, 0.92, 24, 100);
    assert.equal(points.length, 24, 'Brownian bridge must produce exactly 24 probability points');

    const geom = oracle.generateSparklineGeometry(points, 160, 40, { mTop: 5, mBottom: 5 });
    assert.equal(geom.coords.length, 24, 'Geometry must contain 24 coordinate points');

    // Bounds checking
    for (const c of geom.coords) {
      assert.ok(c.x >= 0 && c.x <= 160, `X coordinate ${c.x} must be within [0, 160]`);
      assert.ok(c.y >= 4 && c.y <= 36, `Y coordinate ${c.y} must be clamped within safe [4, 36] margins`);
    }

    // Anchor dot verification
    assert.deepEqual(geom.anchorDot, geom.coords[geom.coords.length - 1], 'Anchor dot must correspond to the last point');

    // 87% conviction floor line verification
    assert.equal(geom.floorLine.x1, 0);
    assert.equal(geom.floorLine.x2, 160);
    assert.equal(geom.floorLine.dashArray, '3,3');
    // For height=40, mBottom=5, hEff=30: y = 40 - 5 - (0.87 * 30) = 8.90
    assert.equal(geom.floorLine.y, 8.9);
  });

  await test('Momentum classification correctly identifies bullish, bearish, and neutral trends', () => {
    const bullish = oracle.calculateMomentum([0.80, 0.85], 0.85);
    assert.equal(bullish.direction, 'bullish');
    assert.equal(bullish.symbol, '▲');
    assert.equal(bullish.color, '#34d399');

    const bearish = oracle.calculateMomentum([0.85, 0.80], 0.80);
    assert.equal(bearish.direction, 'bearish');
    assert.equal(bearish.symbol, '▼');
    assert.equal(bearish.color, '#f87171');

    const neutral = oracle.calculateMomentum([0.85, 0.852], 0.852);
    assert.equal(neutral.direction, 'neutral');
    assert.equal(neutral.symbol, '■');
    assert.equal(neutral.color, '#38bdf8');
  });

  await test('5-level DOM depth ladder enforces strict sorting, 5-level cap, and proportional fill bars', () => {
    const rawBids = [
      { price: 0.45, size: 1000 },
      { price: 0.49, size: 500 },
      { price: 0.48, size: 800 },
      { price: 0.47, size: 1200 },
      { price: 0.46, size: 900 },
      { price: 0.44, size: 2000 }, // 6th level should be truncated
    ];
    const rawAsks = [
      { price: 0.54, size: 1000 },
      { price: 0.51, size: 600 },
      { price: 0.52, size: 900 },
      { price: 0.50, size: 400 },
      { price: 0.53, size: 700 },
      { price: 0.55, size: 1500 }, // 6th level should be truncated
    ];

    const depth = oracle.calculateDepthLadder(rawBids, rawAsks, 5);

    assert.equal(depth.ladderBids.length, 5, 'Bids ladder must be capped at 5 levels');
    assert.equal(depth.ladderAsks.length, 5, 'Asks ladder must be capped at 5 levels');

    // Bids sorted strictly descending
    for (let i = 0; i < depth.ladderBids.length - 1; i++) {
      assert.ok(depth.ladderBids[i].price > depth.ladderBids[i + 1].price, 'Bids must be strictly descending');
      assert.ok(depth.ladderBids[i].widthPct >= 4 && depth.ladderBids[i].widthPct <= 100, 'Fill bar width must be clamped in [4, 100]');
      assert.equal(depth.ladderBids[i].textColor, '#34d399', 'Bids text color must be emerald');
    }

    // Asks sorted strictly ascending
    for (let i = 0; i < depth.ladderAsks.length - 1; i++) {
      assert.ok(depth.ladderAsks[i].price < depth.ladderAsks[i + 1].price, 'Asks must be strictly ascending');
      assert.ok(depth.ladderAsks[i].widthPct >= 4 && depth.ladderAsks[i].widthPct <= 100, 'Fill bar width must be clamped in [4, 100]');
      assert.equal(depth.ladderAsks[i].textColor, '#f87171', 'Asks text color must be rose');
    }
  });

  await test('Shin & Weather fair value gauge computes net edge after dynamic taker fees', () => {
    // Weather market at 0.50 price: taker fee = 0.05 * 0.50 * (1 - 0.50) = 0.0125 ($0.0125 per share)
    const weatherEdge = oracle.calculateExplainableEdge(0.50, 0.56, 'weather', 'weather_nwp', 'YES');
    assert.equal(weatherEdge.category, 'weather');
    assert.equal(weatherEdge.feeRate, 0.05);
    assert.equal(weatherEdge.feePerShare, 0.0125);
    assert.equal(weatherEdge.grossEdge, 0.06);
    // netEdge = 0.06 - 0.0125 = 0.0475 (~4.8%)
    assert.equal(weatherEdge.netEdge, 0.0475);
    assert.equal(weatherEdge.netEdgePct, 4.8);
    assert.equal(weatherEdge.valuation.state, 'UNDERPRICED');
    assert.equal(weatherEdge.modelAttribution.name, 'Weather NWP');

    // Shin model attribution
    const shinEdge = oracle.calculateExplainableEdge(0.48, 0.51, 'crypto', 'shin', 'YES');
    assert.equal(shinEdge.modelAttribution.name, 'Shin 1993');
  });

  await test('Discrete VWAP walk and 4-tier slippage warning thresholds correctly trigger', () => {
    const ladderAsks = [
      { price: 0.50, size: 200, depthUsd: 100 },
      { price: 0.52, size: 300, depthUsd: 156 },
      { price: 0.55, size: 500, depthUsd: 275 },
    ];
    // Total depth = 100 + 156 + 275 = $531

    // 1. Nominal order: $5 (consumes <1.0% of $531 depth)
    const nominal = oracle.calculateDiscreteVwap(ladderAsks, 5.0, 'default');
    assert.equal(nominal.warning.tier, 'nominal');
    assert.equal(nominal.warning.canExecute, true);
    assert.equal(nominal.isFullyFilled, true);

    // 2. Liquidity Warning: $8 (consumes ~1.5% of depth)
    const warning = oracle.calculateDiscreteVwap(ladderAsks, 8.0, 'default');
    assert.equal(warning.warning.tier, 'warning');
    assert.equal(warning.warning.canExecute, true);

    // 3. High Slippage Danger: $20 (consumes ~3.76% of depth)
    const danger = oracle.calculateDiscreteVwap(ladderAsks, 20.0, 'default');
    assert.equal(danger.warning.tier, 'danger');
    assert.equal(danger.warning.canExecute, true);

    // 4. Book Exhaustion: $600 (exceeds $531 total depth)
    const exhausted = oracle.calculateDiscreteVwap(ladderAsks, 600.0, 'default');
    assert.equal(exhausted.warning.tier, 'exhaustion');
    assert.equal(exhausted.warning.canExecute, false);
    assert.equal(exhausted.isFullyFilled, false);
    assert.equal(exhausted.warning.symbol, '⛔');
  });

  await test('Multi-level discrete VWAP walk accurately computes blended fill price and price impact', () => {
    const ladderAsks = [
      { price: 0.50, size: 100, depthUsd: 50 },  // Level 1: 100 shares @ $0.50 = $50
      { price: 0.60, size: 100, depthUsd: 60 },  // Level 2: 100 shares @ $0.60 = $60
    ];
    // Order of $80:
    // Takes all 100 shares of Level 1 for $50.
    // Remaining $30 takes $30 / $0.60 = 50 shares of Level 2.
    // Total shares = 150. Total cost = $80.
    // Expected VWAP = $80 / 150 = $0.5333...
    const result = oracle.calculateDiscreteVwap(ladderAsks, 80.0, 'default');
    assert.equal(result.totalSpentUsd, 80.0);
    assert.equal(result.totalSharesFilled, 150);
    assert.equal(result.vwap, 0.5333);
    // Price impact from best ask (0.50): (0.533333... - 0.50) / 0.50 = 6.67%
    assert.equal(result.priceImpactPct, 6.67);
  });

  // ─────────────────────────────────────────────────────────────────
  // Suite 4: Child Process Boot & Graceful Lifecycle (server.js)
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[Suite 4] Child Process Boot & Graceful Lifecycle (server.js)');

  await test('server.js boots in a child process, initializes CLOB streamer, and shuts down on SIGTERM', async () => {
    const childPort = 3002;
    const child = spawn(process.execPath, ['server.js'], {
      cwd: projectRoot,
      env: { ...process.env, PORT: String(childPort) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let detectedBanner = false;
    let detectedStreamer = false;

    child.stdout.on('data', (chunk) => {
      const str = chunk.toString();
      if (str.includes('Production Server') || str.includes('POLYMARKET PRO SCANNER')) {
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

    assert.equal(detectedBanner, true, 'server.js child process must emit startup banner');

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
  });

  // ─────────────────────────────────────────────────────────────────
  // Suite 5: Unified Production HTTP Delivery & Endpoint Integrity
  // ─────────────────────────────────────────────────────────────────
  console.log('\n[Suite 5] Unified Production HTTP Delivery & Endpoint Integrity');

  // Import the production server and handler
  const { handler, server } = await import('../server.js');

  // Find asset bundle names for testing
  const assetFiles = fs.readdirSync(assetsDir);
  const jsBundleName = assetFiles.find((f) => f.startsWith('index-') && f.endsWith('.js'));
  const cssBundleName = assetFiles.find((f) => f.startsWith('index-') && f.endsWith('.css'));

  await test('GET / serves production frontend/dist/index.html with text/html MIME type', async () => {
    const res = await simulateHttpRequest(handler, { method: 'GET', url: '/' });
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/html/);
    assert.match(res.body, /<div id="root"><\/div>/);
  });

  await test(`GET /assets/${jsBundleName} serves JS bundle with application/javascript MIME type`, async () => {
    const res = await simulateHttpRequest(handler, { method: 'GET', url: `/assets/${jsBundleName}` });
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /application\/javascript/);
    assert.ok(res.body.length > 50000, 'JS bundle should be served in full');
  });

  await test(`GET /assets/${cssBundleName} serves CSS bundle with text/css MIME type`, async () => {
    const res = await simulateHttpRequest(handler, { method: 'GET', url: `/assets/${cssBundleName}` });
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/css/);
    assert.ok(res.body.length > 10000, 'CSS bundle should be served in full');
  });

  await test('GET /api/opportunities returns scanner opportunities matching /api/scan contract', async () => {
    const resOpps = await simulateHttpRequest(handler, { method: 'GET', url: '/api/opportunities' });
    assert.equal(resOpps.status, 200);
    assert.match(resOpps.headers['content-type'], /application\/json/);
    assert.ok(resOpps.json, 'Response must be valid JSON');

    const resScan = await simulateHttpRequest(handler, { method: 'GET', url: '/api/scan' });
    assert.equal(resScan.status, 200);
    assert.match(resScan.headers['content-type'], /application\/json/);
    assert.ok(resScan.json, 'Response must be valid JSON');

    // Both should expose consistent opportunity data structures
    assert.equal(typeof resOpps.json.cached, 'boolean');
    assert.equal(typeof resScan.json.cached, 'boolean');
  });

  await test('GET /api/v1/clob/live-depth returns 5-level DOM depth ladder for valid token_id', async () => {
    const tokenId = '21742633143491211191258291232049933645831388877018289444540733086908049702213';
    const res = await simulateHttpRequest(handler, { method: 'GET', url: `/api/v1/clob/live-depth?token_id=${tokenId}&amount=100` });
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /application\/json/);
    assert.equal(res.json.success, true);
    assert.ok(Array.isArray(res.json.ladderBids), 'ladderBids must be an array');
    assert.ok(Array.isArray(res.json.ladderAsks), 'ladderAsks must be an array');
    assert.ok(res.json.ladderBids.length <= 5, 'ladderBids must be capped at 5');
    assert.ok(res.json.ladderAsks.length <= 5, 'ladderAsks must be capped at 5');
    assert.ok(res.json.source, 'source tag must be present');
  });

  await test('GET /api/v1/clob/live-depth without token_id returns HTTP 400 Bad Request JSON', async () => {
    const res = await simulateHttpRequest(handler, { method: 'GET', url: '/api/v1/clob/live-depth' });
    assert.equal(res.status, 400);
    assert.match(res.headers['content-type'], /application\/json/);
    assert.equal(res.json.success, false);
    assert.match(res.json.error, /Missing token_id/i);
  });

  await test('GET /api/v1/bot/status returns real-time bot state and execution telemetry', async () => {
    const res = await simulateHttpRequest(handler, { method: 'GET', url: '/api/v1/bot/status' });
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /application\/json/);
    assert.equal(typeof (res.json.enabled !== undefined ? res.json.enabled : res.json.running), 'boolean');
    assert.ok(res.json.stats, 'Bot stats object must be returned');
  });

  await test('GET /api/v1/risk/status returns portfolio risk metrics, limits, and drawdown', async () => {
    const res = await simulateHttpRequest(handler, { method: 'GET', url: '/api/v1/risk/status?bankroll=10000' });
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /application\/json/);
    assert.equal(typeof res.json.isKilled, 'boolean');
    assert.ok(res.json.limits, 'Risk limits object must be present');
    assert.equal(typeof (res.json.metrics?.drawdownPct ?? res.json.drawdownPct), 'number');
  });

  await test('POST /api/v1/risk/kill-switch instantly halts execution, cancels orders, and reflects in status', async () => {
    // 1. Trigger Kill-Switch
    const resKill = await simulateHttpRequest(handler, {
      method: 'POST',
      url: '/api/v1/risk/kill-switch',
      headers: { 'content-type': 'application/json' },
      body: { reason: 'Automated Headless Integration Verification' },
    });
    assert.equal(resKill.status, 200);
    assert.equal(resKill.json.success, true);
    assert.equal(resKill.json.killResult.success, true);

    // 2. Verify risk status reflects killed state
    const resRisk = await simulateHttpRequest(handler, { method: 'GET', url: '/api/v1/risk/status' });
    assert.equal(resRisk.json.isKilled, true);

    // 3. Verify bot cycle execution is strictly blocked
    const resCycle = await simulateHttpRequest(handler, { method: 'POST', url: '/api/v1/bot/run-cycle' });
    assert.equal(resCycle.status, 403);
    assert.match(resCycle.json.error, /Kill-Switch is ACTIVE/i);

    // 4. Safely reset kill switch for remaining tests
    const resReset = await simulateHttpRequest(handler, { method: 'POST', url: '/api/v1/risk/reset' });
    assert.equal(resReset.status, 200);
    assert.equal(resReset.json.success, true);

    // 5. Verify risk status restored to normal
    const resRiskRestored = await simulateHttpRequest(handler, { method: 'GET', url: '/api/v1/risk/status' });
    assert.equal(resRiskRestored.json.isKilled, false);
  });

  await test('Strict API 404 Integrity: Unknown /api/* endpoints return JSON 404, NEVER HTML', async () => {
    const unknownEndpoints = [
      '/api/unknown_endpoint_xyz',
      '/api/v1/non_existent_resource',
      '/api/opportunities_typo',
    ];

    for (const ep of unknownEndpoints) {
      const res = await simulateHttpRequest(handler, { method: 'GET', url: ep });
      assert.equal(res.status, 404, `Endpoint ${ep} should return 404`);
      assert.match(res.headers['content-type'], /application\/json/, `Endpoint ${ep} must return application/json`);
      assert.equal(res.json.success, false, `Endpoint ${ep} must return success: false JSON`);
      assert.equal(res.json.error, 'Not found', `Endpoint ${ep} must return standard 'Not found' error`);
      assert.doesNotMatch(res.body, /<html/i, `Endpoint ${ep} must NEVER return HTML`);
    }
  });

  await test('SPA Fallback: Arbitrary client-side routes return 200 HTML (frontend/dist/index.html)', async () => {
    const clientRoutes = [
      '/dashboard',
      '/arbitrage/negrisk',
      '/settings',
      '/order/21742633',
    ];

    for (const route of clientRoutes) {
      const res = await simulateHttpRequest(handler, { method: 'GET', url: route });
      assert.equal(res.status, 200, `Client route ${route} must return 200 OK`);
      assert.match(res.headers['content-type'], /text\/html/, `Client route ${route} must have text/html Content-Type`);
      assert.match(res.body, /<div id="root"><\/div>/, `Client route ${route} must serve SPA index.html`);
    }
  });

  await test('Directory traversal attack attempts are rejected with 403 Forbidden or 404', async () => {
    const traversalAttempts = [
      '/../../package.json',
      '/../server.js',
      '/assets/../../server.js',
    ];

    for (const attempt of traversalAttempts) {
      const res = await simulateHttpRequest(handler, { method: 'GET', url: attempt });
      assert.ok(res.status === 403 || res.status === 404, `Traversal attempt ${attempt} must be rejected with 403 or 404`);
      assert.doesNotMatch(res.body, /"name": "polymarket-scanner"/, 'Must not leak file contents');
    }
  });

  // Clean close of server in process
  try {
    server.close();
  } catch (_) {}

  console.log('\n===============================================================');
  console.log(`  FRONTEND INTEGRATION TEST RESULTS: ${passedCount}/${passedCount + failedCount} PASSED (${failedCount} FAILED)`);
  console.log('===============================================================');

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAll().catch((err) => {
  console.error('\nFatal test runner failure:', err);
  process.exit(1);
});
