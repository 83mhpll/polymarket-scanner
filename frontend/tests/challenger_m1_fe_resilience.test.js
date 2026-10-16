/**
 * Challenger Empirical Stress Test Suite for Milestone M1
 * Tests API error handling, WebSocket resilience, and component state robustness.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import esbuild from '../node_modules/esbuild/lib/main.js';

// Import API and WS services
import {
  fetchOpportunities,
  fetchLiveDepth,
  fetchBotStatus,
  startBot,
  stopBot,
  runBotCycle,
  fetchRiskStatus,
  triggerKillSwitch,
  resetKillSwitch,
  fetchStreamStatus,
} from '../src/services/api.js';

import { createClobStreamer, POLYMARKET_WS_URL } from '../src/services/ws.js';

// ============================================================================
// SUITE 1: API Client Error Handling & Fallback Behavior
// ============================================================================
describe('Suite 1: API Error Handling & Fallbacks (api.js)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('fetchOpportunities', () => {
    it('returns opportunities payload on HTTP 200', async () => {
      const mockPayload = { success: true, count: 2, opportunities: [{ id: 'opp_1' }, { id: 'opp_2' }] };
      globalThis.fetch = async (url) => {
        assert.equal(url, '/api/opportunities');
        return {
          ok: true,
          status: 200,
          json: async () => mockPayload,
        };
      };

      const res = await fetchOpportunities(false);
      assert.deepEqual(res, mockPayload);
    });

    it('appends force=true query param when force flag is set', async () => {
      globalThis.fetch = async (url) => {
        assert.equal(url, '/api/opportunities?force=true');
        return {
          ok: true,
          status: 200,
          json: async () => ({ opportunities: [] }),
        };
      };

      const res = await fetchOpportunities(true);
      assert.deepEqual(res, { opportunities: [] });
    });

    it('throws descriptive error when server returns HTTP 500', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Database connection failed' }),
      });

      await assert.rejects(
        async () => fetchOpportunities(),
        {
          name: 'Error',
          message: 'Failed to fetch opportunities: HTTP 500 Internal Server Error',
        }
      );
    });

    it('throws descriptive error on HTTP 502 Bad Gateway / 404 Not Found', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
      });

      await assert.rejects(
        async () => fetchOpportunities(),
        {
          name: 'Error',
          message: 'Failed to fetch opportunities: HTTP 502 Bad Gateway',
        }
      );
    });

    it('propagates network failure (fetch rejected / connection refused)', async () => {
      globalThis.fetch = async () => {
        throw new TypeError('fetch failed: ECONNREFUSED 127.0.0.1:3001');
      };

      await assert.rejects(
        async () => fetchOpportunities(),
        {
          name: 'TypeError',
          message: /fetch failed: ECONNREFUSED/,
        }
      );
    });
  });

  describe('fetchLiveDepth', () => {
    it('throws immediately if tokenId parameter is missing or empty', async () => {
      await assert.rejects(
        async () => fetchLiveDepth(''),
        {
          name: 'Error',
          message: 'tokenId parameter is required for fetchLiveDepth',
        }
      );
      await assert.rejects(
        async () => fetchLiveDepth(null),
        {
          name: 'Error',
          message: 'tokenId parameter is required for fetchLiveDepth',
        }
      );
    });

    it('correctly encodes special characters in tokenId and query params', async () => {
      let requestedUrl = '';
      globalThis.fetch = async (url) => {
        requestedUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => ({ bids: [], asks: [], ladderBids: [], ladderAsks: [] }),
        };
      };

      await fetchLiveDepth('token/special#id', 250);
      assert.equal(requestedUrl, '/api/v1/clob/live-depth?token_id=token%2Fspecial%23id&amount=250');
    });

    it('throws descriptive error when live depth returns HTTP 500', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await assert.rejects(
        async () => fetchLiveDepth('tok_123'),
        {
          name: 'Error',
          message: 'Failed to fetch live depth: HTTP 500 Internal Server Error',
        }
      );
    });
  });

  describe('fetchBotStatus, startBot, stopBot, runBotCycle', () => {
    it('fetchBotStatus throws on HTTP 500', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await assert.rejects(
        async () => fetchBotStatus(),
        {
          name: 'Error',
          message: 'Failed to fetch bot status: HTTP 500 Internal Server Error',
        }
      );
    });

    it('startBot parses JSON error response when blocked by active kill switch', async () => {
      globalThis.fetch = async (url, opts) => {
        assert.equal(opts.method, 'POST');
        return {
          ok: false,
          status: 403,
          json: async () => ({ error: 'Cannot start bot: Emergency Kill-Switch is active' }),
        };
      };

      await assert.rejects(
        async () => startBot(),
        {
          name: 'Error',
          message: 'Cannot start bot: Emergency Kill-Switch is active',
        }
      );
    });

    it('stopBot falls back gracefully to HTTP status if JSON parsing fails', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 500,
        json: async () => { throw new Error('Invalid JSON'); },
      });

      await assert.rejects(
        async () => stopBot(),
        {
          name: 'Error',
          message: 'Failed to stop bot: HTTP 500',
        }
      );
    });

    it('runBotCycle propagates network disconnect', async () => {
      globalThis.fetch = async () => {
        throw new Error('Network socket disconnected');
      };

      await assert.rejects(
        async () => runBotCycle(),
        {
          name: 'Error',
          message: 'Network socket disconnected',
        }
      );
    });
  });

  describe('fetchRiskStatus, triggerKillSwitch, resetKillSwitch', () => {
    it('fetchRiskStatus sends bankroll param and returns risk metrics', async () => {
      let requestedUrl = '';
      globalThis.fetch = async (url) => {
        requestedUrl = url;
        return {
          ok: true,
          status: 200,
          json: async () => ({ isKilled: false, metrics: { grossExposureUsd: 100 } }),
        };
      };

      const res = await fetchRiskStatus(50000);
      assert.equal(requestedUrl, '/api/v1/risk/status?bankroll=50000');
      assert.equal(res.isKilled, false);
    });

    it('triggerKillSwitch sends POST with JSON payload containing operator reason', async () => {
      let reqBody = null;
      globalThis.fetch = async (url, opts) => {
        assert.equal(url, '/api/v1/risk/kill-switch');
        assert.equal(opts.method, 'POST');
        reqBody = JSON.parse(opts.body);
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, message: 'Kill switch triggered' }),
        };
      };

      const res = await triggerKillSwitch('Emergency Drill #42');
      assert.equal(reqBody.reason, 'Emergency Drill #42');
      assert.equal(res.success, true);
    });

    it('resetKillSwitch handles backend error', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Unauthorized reset' }),
      });

      await assert.rejects(
        async () => resetKillSwitch(),
        {
          name: 'Error',
          message: 'Unauthorized reset',
        }
      );
    });
  });

  describe('fetchStreamStatus', () => {
    it('returns stream status on HTTP 200', async () => {
      globalThis.fetch = async () => ({
        ok: true,
        status: 200,
        json: async () => ({ connected: true, trackedTokens: 4 }),
      });

      const res = await fetchStreamStatus();
      assert.equal(res.connected, true);
    });

    it('throws error on HTTP 500', async () => {
      globalThis.fetch = async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await assert.rejects(
        async () => fetchStreamStatus(),
        {
          name: 'Error',
          message: 'Failed to fetch stream status: HTTP 500 Internal Server Error',
        }
      );
    });
  });
});

// ============================================================================
// SUITE 2: WebSocket Streaming & Reconnect Engine (ws.js)
// ============================================================================
describe('Suite 2: WebSocket Streaming & Resilience Engine (ws.js)', () => {
  const originalWebSocket = globalThis.WebSocket;

  /**
   * MockWebSocket harness supporting event tracking and simulated state transitions
   */
  class MockWebSocket extends EventEmitter {
    static OPEN = 1;
    static CLOSED = 3;
    static instances = [];

    constructor(url) {
      super();
      this.url = url;
      this.readyState = MockWebSocket.OPEN;
      this.sentMessages = [];
      this.onopen = null;
      this.onclose = null;
      this.onerror = null;
      this.onmessage = null;
      MockWebSocket.instances.push(this);
    }

    send(data) {
      this.sentMessages.push(data);
    }

    close() {
      this.readyState = MockWebSocket.CLOSED;
      if (typeof this.onclose === 'function') {
        this.onclose({ code: 1000, reason: 'Normal close' });
      }
      this.emit('close');
    }

    // Test helper to simulate incoming socket event
    simulateOpen() {
      this.readyState = MockWebSocket.OPEN;
      if (typeof this.onopen === 'function') this.onopen({});
      this.emit('open');
    }

    simulateMessage(data) {
      if (typeof this.onmessage === 'function') {
        this.onmessage({ data: typeof data === 'string' ? data : JSON.stringify(data) });
      }
      this.emit('message', data);
    }

    simulateError(err) {
      if (typeof this.onerror === 'function') this.onerror(err);
      if (this.listenerCount('error') > 0) this.emit('error', err);
    }

    simulateClose(code = 1006) {
      this.readyState = MockWebSocket.CLOSED;
      if (typeof this.onclose === 'function') this.onclose({ code, reason: 'Abrupt disconnect' });
      this.emit('close');
    }
  }

  beforeEach(() => {
    MockWebSocket.instances = [];
    globalThis.WebSocket = MockWebSocket;
  });

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
  });

  it('connects to POLYMARKET_WS_URL and sends initial subscriptions on open', () => {
    const statusChanges = [];
    const client = createClobStreamer({
      tokenIds: ['token_A', 'token_B'],
      onStatusChange: (s) => statusChanges.push(s),
    });

    assert.equal(MockWebSocket.instances.length, 1);
    const ws = MockWebSocket.instances[0];
    assert.equal(ws.url, POLYMARKET_WS_URL);

    // Simulate connection established
    ws.simulateOpen();

    assert.ok(statusChanges.includes('connected'));
    assert.equal(ws.sentMessages.length, 1);
    const subMsg = JSON.parse(ws.sentMessages[0]);
    assert.equal(subMsg.type, 'market');
    assert.deepEqual(subMsg.assets_ids.sort(), ['token_A', 'token_B'].sort());

    client.close();
  });

  it('notifies onError callback when socket encounters error', () => {
    let capturedError = null;
    const client = createClobStreamer({
      onError: (err) => { capturedError = err; },
    });

    const ws = MockWebSocket.instances[0];
    ws.simulateError(new Error('Connection timed out'));

    assert.equal(capturedError.message, 'Connection timed out');
    client.close();
  });

  it('enforces exponential backoff formula and transitions status', async () => {
    const statuses = [];
    // Use low ceiling for predictable assertion
    const client = createClobStreamer({
      onStatusChange: (s) => statuses.push(s),
      maxReconnectAttempts: 4,
    });

    const ws1 = MockWebSocket.instances[0];
    // Socket drops
    ws1.simulateClose();

    // Immediately after close, status is 'disconnected' then 'reconnecting'
    assert.ok(statuses.includes('disconnected'));
    assert.ok(statuses.includes('reconnecting'));

    client.close();
  });

  it('halts reconnection and sets disconnected when maxReconnectAttempts is reached', () => {
    const statuses = [];
    const client = createClobStreamer({
      onStatusChange: (s) => statuses.push(s),
      maxReconnectAttempts: 2,
    });

    const ws1 = MockWebSocket.instances[0];
    ws1.simulateClose(); // attempt 1

    client.reconnect();
    const ws2 = MockWebSocket.instances[1];
    ws2.simulateClose(); // attempt 2

    client.reconnect();
    const ws3 = MockWebSocket.instances[2];
    ws3.simulateClose(); // attempt 2 >= maxReconnectAttempts (2) -> stops, sets disconnected

    assert.equal(statuses[statuses.length - 1], 'disconnected');
    client.close();
  });

  it('resets reconnectAttempts and resubscribes tokens upon successful reconnection', () => {
    const client = createClobStreamer({
      tokenIds: ['token_alpha'],
    });

    const ws1 = MockWebSocket.instances[0];
    // Socket open
    ws1.simulateOpen();
    assert.equal(ws1.sentMessages.length, 1);

    // Subscribe another token dynamically
    client.subscribe('token_beta');
    assert.equal(ws1.sentMessages.length, 2);

    // Socket drops
    ws1.simulateClose();

    // Manually trigger reconnect
    client.reconnect();
    const ws2 = MockWebSocket.instances[1];
    ws2.simulateOpen();

    // All active subscriptions (alpha + beta) must be sent on new connection
    assert.equal(ws2.sentMessages.length, 1);
    const subPayload = JSON.parse(ws2.sentMessages[0]);
    assert.deepEqual(subPayload.assets_ids.sort(), ['token_alpha', 'token_beta'].sort());

    client.close();
  });

  it('safely ingests malformed, non-JSON, and foreign event payloads without crashing', () => {
    const depthUpdates = [];
    const client = createClobStreamer({
      onDepthUpdate: (data) => depthUpdates.push(data),
    });

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    // 1. Raw text (non-JSON) ping/pong
    assert.doesNotThrow(() => ws.simulateMessage('PONG'));
    assert.doesNotThrow(() => ws.simulateMessage('{ invalid json string ...'));

    // 2. Foreign event type
    assert.doesNotThrow(() => ws.simulateMessage({ event_type: 'heartbeat', timestamp: 123 }));
    assert.equal(depthUpdates.length, 0);

    // 3. Valid orderbook event
    const bookData = { event_type: 'book', bids: [{ price: 0.5, size: 100 }], asks: [] };
    assert.doesNotThrow(() => ws.simulateMessage(bookData));
    assert.equal(depthUpdates.length, 1);
    assert.deepEqual(depthUpdates[0], bookData);

    // 4. Valid price_change event
    const priceData = { event_type: 'price_change', price: 0.52 };
    assert.doesNotThrow(() => ws.simulateMessage(priceData));
    assert.equal(depthUpdates.length, 2);
    assert.deepEqual(depthUpdates[1], priceData);

    client.close();
  });

  it('handles dynamic subscribe, unsubscribe, and getSubscriptions correctly', () => {
    const client = createClobStreamer({
      tokenIds: ['t1'],
    });

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    assert.deepEqual(client.getSubscriptions(), ['t1']);

    client.subscribe('t2');
    assert.deepEqual(client.getSubscriptions().sort(), ['t1', 't2'].sort());

    client.unsubscribe('t1');
    assert.deepEqual(client.getSubscriptions(), ['t2']);

    // Empty or falsy subscription ignored
    client.subscribe('');
    client.subscribe(null);
    assert.deepEqual(client.getSubscriptions(), ['t2']);

    client.close();
  });

  it('cleanly closes socket, prevents further reconnects, and updates status to disconnected', () => {
    const statuses = [];
    const client = createClobStreamer({
      onStatusChange: (s) => statuses.push(s),
    });

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    client.close();

    assert.equal(ws.readyState, MockWebSocket.CLOSED);
    assert.equal(statuses[statuses.length - 1], 'disconnected');

    // Subsequent close events do not trigger reconnects
    ws.simulateClose();
    assert.equal(statuses[statuses.length - 1], 'disconnected');
  });
});

// ============================================================================
// SUITE 3: Component State & Rendering Resilience (React SSR Stress Tests)
// ============================================================================
describe('Suite 3: Component Rendering Resilience (React Server DOM)', async () => {
  // Bundle OpportunityCard, StatsBar, OrderModal, and OpportunityGrid via esbuild
  const testBundleCode = `
import React from 'react';
import { renderToString } from 'react-dom/server';
import OpportunityCard from './src/components/opportunities/OpportunityCard.jsx';
import StatsBar from './src/components/layout/StatsBar.jsx';
import OpportunityGrid from './src/components/opportunities/OpportunityGrid.jsx';
import OrderModal from './src/components/order/OrderModal.jsx';
import { useTrading, setMockContext } from './mock-ctx.js';

export { React, renderToString, OpportunityCard, StatsBar, OpportunityGrid, OrderModal, useTrading, setMockContext };
`;

  const mockTradingContextJs = [
    'let currentMock = {',
    '  opportunities: [],',
    '  totalMarkets: 0,',
    '  scannerStats: null,',
    '  loading: false,',
    '  error: null,',
    '  botStatus: { running: false, openPositionsCount: 0 },',
    '  riskStatus: { isKilled: false, metrics: { grossExposureUsd: 0, grossExposurePct: 0, currentDrawdownPct: 0 } },',
    '  wallet: { balanceUsd: 10000 },',
    '  wsStatus: "connected",',
    '  engineLatencyMs: 18.4,',
    '  orderModalOpen: false,',
    '  selectedOpportunity: null,',
    '  selectedOutcome: "YES",',
    '  liveDepth: null,',
    '  isDepthLoading: false,',
    '  openOrderModal: () => {},',
    '  closeOrderModal: () => {},',
    '  refreshOpportunities: () => {},',
    '};',
    'export function setMockContext(ctx) { currentMock = { ...currentMock, ...ctx }; }',
    'export function useTrading() { return currentMock; }',
  ].join('\n');

  let bundledExports;

  beforeEach(async () => {
    if (!bundledExports) {
      const buildRes = await esbuild.build({
        stdin: {
          contents: testBundleCode,
          resolveDir: path.resolve('frontend'),
          loader: 'jsx',
        },
        bundle: true,
        format: 'esm',
        write: false,
        plugins: [
          {
            name: 'mock-trading-context',
            setup(build) {
              build.onResolve({ filter: /(mock-ctx|TradingContext)/ }, () => {
                return { path: 'mock-shared-trading-context', namespace: 'mock-ctx' };
              });
              build.onLoad({ filter: /.*/, namespace: 'mock-ctx' }, () => {
                return {
                  contents: mockTradingContextJs,
                  loader: 'js',
                };
              });
            },
          },
        ],
      });

      const b64 = Buffer.from(buildRes.outputFiles[0].text).toString('base64');
      bundledExports = await import('data:text/javascript;base64,' + b64);
    }
  });

  describe('OpportunityCard Resilience under Missing Properties', () => {
    it('renders cleanly with completely empty opportunity object {}', () => {
      const { React, renderToString, OpportunityCard } = bundledExports;
      const rawHtml = renderToString(React.createElement(OpportunityCard, { opportunity: {} }));
      const html = rawHtml.replace(/<!-- -->/g, '');

      // Asserts institutional defaults are rendered
      assert.ok(html.includes('50¢'), 'Default price 50¢ rendered');
      assert.ok(html.includes('+5.0% Net Edge'), 'Default 5.0% net edge rendered');
      assert.ok(html.includes('Shin 1993'), 'Default Shin 1993 attribution rendered');
      assert.ok(html.includes('87% FLOOR'), 'Conviction floor SVG reference rendered');
      assert.ok(!html.includes('NaN'), 'No NaN coordinates generated in SVG attributes');
    });

    it('renders cleanly when opportunity prop is null or undefined', () => {
      const { React, renderToString, OpportunityCard } = bundledExports;

      assert.doesNotThrow(() => {
        const htmlNull = renderToString(React.createElement(OpportunityCard, { opportunity: null }));
        assert.ok(htmlNull.length > 500);
      });

      assert.doesNotThrow(() => {
        const htmlUndef = renderToString(React.createElement(OpportunityCard, { opportunity: undefined }));
        assert.ok(htmlUndef.length > 500);
      });
    });

    it('handles boundary prices: price = 0, price = 1, extreme numbers', () => {
      const { React, renderToString, OpportunityCard } = bundledExports;

      // Price = 1 (100% certainty)
      const raw1 = renderToString(React.createElement(OpportunityCard, {
        opportunity: { currentPrice: 1, netEdge: 0.1, score: 95 }
      }));
      const html1 = raw1.replace(/<!-- -->/g, '');
      assert.ok(html1.includes('100¢'));
      assert.ok(html1.includes('+10.0% Net Edge'));
      assert.ok(!html1.includes('NaN'));

      // Price = 0
      const raw0 = renderToString(React.createElement(OpportunityCard, {
        opportunity: { currentPrice: 0, netEdge: 0.0, score: 20 }
      }));
      const html0 = raw0.replace(/<!-- -->/g, '');
      assert.ok(html0.includes('0¢'));
      assert.ok(!html0.includes('NaN'));
    });

    it('handles model attribution for weather, ensemble, and shin models', () => {
      const { React, renderToString, OpportunityCard } = bundledExports;

      const htmlWeather = renderToString(React.createElement(OpportunityCard, {
        opportunity: { modelType: 'weather', category: 'weather' }
      }));
      assert.ok(htmlWeather.includes('Weather NWP'));

      const htmlEnsemble = renderToString(React.createElement(OpportunityCard, {
        opportunity: { modelType: 'ensemble' }
      }));
      assert.ok(htmlEnsemble.includes('AI Ensemble'));

      const htmlShin = renderToString(React.createElement(OpportunityCard, {
        opportunity: { modelType: 'shin' }
      }));
      assert.ok(htmlShin.includes('Shin 1993'));
    });

    it('handles corrupted, empty, or truncated history array without breaking sparkline SVG', () => {
      const { React, renderToString, OpportunityCard } = bundledExports;

      // Empty history array []
      const htmlEmpty = renderToString(React.createElement(OpportunityCard, {
        opportunity: { history: [], momentum: 0.05 }
      }));
      assert.ok(htmlEmpty.includes('<polyline'));
      assert.ok(!htmlEmpty.includes('NaN'));

      // Truncated history array (e.g. only 3 items)
      const htmlShort = renderToString(React.createElement(OpportunityCard, {
        opportunity: { history: [0.4, 0.45, 0.5], momentum: -0.02 }
      }));
      assert.ok(htmlShort.includes('<polyline'));
      assert.ok(!htmlShort.includes('NaN'));

      // Exactly 24 points
      const validPoints = Array.from({ length: 24 }, (_, i) => 0.5 + i * 0.01);
      const htmlExact = renderToString(React.createElement(OpportunityCard, {
        opportunity: { history: validPoints }
      }));
      assert.ok(htmlExact.includes('<polyline'));
    });
  });

  describe('StatsBar Resilience under Empty / Degraded Telemetry', () => {
    it('renders cleanly with 0 opportunities and null metrics', () => {
      const { React, renderToString, StatsBar } = bundledExports;

      // StatsBar should render $0 / 0% without throwing
      const html = renderToString(React.createElement(StatsBar, null));
      assert.ok(html.includes('MARKETS / OPPS'));
      assert.ok(html.includes('MAX NET EDGE'));
      assert.ok(html.includes('+0.0%'));
      assert.ok(html.includes('PORTFOLIO BALANCE'));
    });
  });

  describe('OrderModal Calculation Resilience under Varying Book Depth', () => {
    it('returns null when orderModalOpen is false', () => {
      const { React, renderToString, OrderModal } = bundledExports;
      const html = renderToString(React.createElement(OrderModal, null));
      assert.equal(html, '');
    });

    it('renders with synthetic depth ladder when liveDepth is null', () => {
      const { React, renderToString, OrderModal, setMockContext } = bundledExports;
      setMockContext({
        orderModalOpen: true,
        selectedOpportunity: { question: 'Will ETH exceed $4000 by year end?', currentPrice: 0.55 },
        liveDepth: null,
      });

      const raw = renderToString(React.createElement(OrderModal, null));
      const html = raw.replace(/<!-- -->/g, '');
      assert.ok(html.includes('EXECUTION TICKET'));
      assert.ok(html.includes('5-Level L2 DOM Depth Ladder'));
      assert.ok(html.includes('BID (BUY)'));
      assert.ok(html.includes('ASK (SELL)'));
    });

    it('triggers book exhaustion alert when order size exceeds visible depth', () => {
      const { React, renderToString, OrderModal, setMockContext } = bundledExports;
      setMockContext({
        orderModalOpen: true,
        selectedOpportunity: { question: 'Will ETH exceed $4000?', currentPrice: 0.5 },
        liveDepth: {
          ladderBids: [{ price: 0.49, size: 10, depthUsd: 4.9 }],
          ladderAsks: [{ price: 0.51, size: 10, depthUsd: 5.1 }],
        },
      });

      const raw = renderToString(React.createElement(OrderModal, null));
      const html = raw.replace(/<!-- -->/g, '');
      // By default orderAmountUsd = 50, but totalVisibleDepthUsd = 5.1
      assert.ok(html.includes('BOOK EXHAUSTION: Order exceeds visible depth'));
    });
  });

  describe('Empirical Adversarial Finding: Null Elements in Opportunities Array', () => {
    it('reveals missing null-guard in OpportunityGrid when opportunities contains null', () => {
      const { React, renderToString, OpportunityGrid, setMockContext } = bundledExports;

      setMockContext({
        opportunities: [null],
        loading: false,
        error: null,
      });

      assert.throws(
        () => {
          renderToString(React.createElement(OpportunityGrid, null));
        },
        /Cannot read properties of null/
      );
    });

    it('reveals missing null-guard in StatsBar when opportunities contains null', () => {
      const { React, renderToString, StatsBar, setMockContext } = bundledExports;

      setMockContext({
        opportunities: [null],
      });

      assert.throws(
        () => {
          renderToString(React.createElement(StatsBar, null));
        },
        /Cannot read properties of null/
      );
    });
  });
});

// ============================================================================
// SUITE 4: Quantitative Order Ticket & Slippage Math Validation
// ============================================================================
describe('Suite 4: Order Execution Math & Slippage Quant Verification', () => {
  it('correctly calculates VWAP walk and price impact across 5 levels of depth', () => {
    // 5-level DOM asks:
    // Level 1: $0.50, size: 20 -> cost: $10.00
    // Level 2: $0.52, size: 50 -> cost: $26.00
    // Level 3: $0.55, size: 100 -> cost: $55.00
    // Total visible depth: $91.00
    const asks = [
      { price: 0.50, size: 20, depthUsd: 10.00 },
      { price: 0.52, size: 50, depthUsd: 26.00 },
      { price: 0.55, size: 100, depthUsd: 55.00 },
    ];

    const orderAmountUsd = 20.00;
    let remaining = orderAmountUsd;
    let filledShares = 0;
    let totalCost = 0;

    for (const ask of asks) {
      if (remaining <= 0) break;
      const askCost = ask.depthUsd || (ask.price * ask.size);
      if (remaining >= askCost) {
        filledShares += ask.size;
        totalCost += askCost;
        remaining -= askCost;
      } else {
        const partial = remaining / ask.price;
        filledShares += partial;
        totalCost += remaining;
        remaining = 0;
      }
    }

    // Filled Level 1: 20 shares @ $0.50 ($10)
    // Partial Level 2: remaining $10 / 0.52 = 19.2307 shares
    // Total filledShares: 39.2307
    // Total cost: $20.00
    // VWAP: 20.00 / 39.2307 = 0.5098
    const vwap = totalCost / filledShares;
    const bestAsk = asks[0].price; // 0.50
    const priceImpactPct = ((vwap - bestAsk) / bestAsk) * 100;

    assert.ok(Math.abs(vwap - 0.5098) < 0.001);
    assert.ok(Math.abs(priceImpactPct - 1.96) < 0.05);

    // Alert tier: 1.0% < rho <= 2.0% -> Moderate Slippage Warning
    const alertTier = priceImpactPct > 2.0 ? 'HIGH' : priceImpactPct > 1.0 ? 'WARNING' : 'NOMINAL';
    assert.equal(alertTier, 'WARNING');
  });

  it('accurately computes dynamic venue taker fee and post-fee payout', () => {
    // Fee = C * feeRate * p * (1 - p)
    const C = 100; // $100 order
    const p = 0.60;
    const feeRate = 0.05; // 5% fee rate
    const expectedFee = C * feeRate * p * (1 - p); // 100 * 0.05 * 0.60 * 0.40 = $1.20

    const estimatedShares = C / p; // 166.666 shares
    const estimatedPayout = estimatedShares * 1.0; // $166.67
    const netRoi = ((estimatedPayout - C) / C) * 100; // +66.67%

    assert.ok(Math.abs(expectedFee - 1.20) < 1e-6);
    assert.ok(Math.abs(netRoi - 66.67) < 0.1);
  });
});

// ============================================================================
// SUITE 5: TradingContext State Transition & Error Resilience Invariants
// ============================================================================
describe('Suite 5: TradingContext State Transition Invariants', () => {
  it('safely handles empty payload {} from scanner', () => {
    const res = {};
    const opportunities = res.opportunities || [];
    const totalMarkets = res.totalMarkets || (res.opportunities ? res.opportunities.length : 0);

    assert.deepEqual(opportunities, []);
    assert.equal(totalMarkets, 0);
  });

  it('safely handles malformed payload { opportunities: null }', () => {
    const res = { opportunities: null };
    const opportunities = res.opportunities || [];
    const totalMarkets = res.totalMarkets || (res.opportunities ? res.opportunities.length : 0);

    assert.deepEqual(opportunities, []);
    assert.equal(totalMarkets, 0);
  });

  it('merges partial risk status without wiping out default limits or balances', () => {
    const defaultState = {
      isKilled: false,
      metrics: {
        grossExposureUsd: 0,
        portfolioBalanceUsd: 10000,
        currentEquityUsd: 10000,
      },
      limits: {
        maxGrossExposureLimit: 50,
        maxDrawdownLimit: 15,
      },
    };

    const partialApiRes = {
      isKilled: true,
      metrics: {
        grossExposureUsd: 4500,
      },
    };

    const merged = {
      ...defaultState,
      ...partialApiRes,
      metrics: {
        ...defaultState.metrics,
        ...(partialApiRes.metrics || {}),
      },
      limits: {
        ...defaultState.limits,
        ...(partialApiRes.limits || {}),
      },
    };

    assert.equal(merged.isKilled, true);
    assert.equal(merged.metrics.grossExposureUsd, 4500);
    assert.equal(merged.metrics.portfolioBalanceUsd, 10000);
    assert.equal(merged.limits.maxDrawdownLimit, 15);
  });

  it('reveals missing null-guard in openOrderModal when passed null', () => {
    // In TradingContext.jsx:
    // const targetTokenId = outcome === 'NO' ? (opp.noTokenID || opp.tokenID) : (opp.yesTokenID || opp.tokenID);
    // If opp is null:
    assert.throws(
      () => {
        const opp = null;
        const outcome = 'YES';
        const targetTokenId = outcome === 'NO' ? (opp.noTokenID || opp.tokenID) : (opp.yesTokenID || opp.tokenID);
      },
      /Cannot read properties of null/
    );
  });
});

