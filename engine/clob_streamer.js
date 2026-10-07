// ══════════════════════════════════════════════════════════════════════
//  engine/clob_streamer.js — Real-Time WebSocket CLOB Orderbook Streamer
//  Milestone M3: WebSocket Streamer, 5-Level Depth Ladder & Resiliency
// ══════════════════════════════════════════════════════════════════════

import WebSocket from 'ws';
import { calculateOrderbookSlippage } from './clob_depth.js';

export const CLOB_WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

/**
 * Institutional Real-time CLOB Orderbook Streamer
 */
export class ClobOrderbookStreamer {
  constructor(options = {}) {
    this.wsUrl = options.wsUrl || CLOB_WS_URL;
    this.ws = null;
    this.subscribedTokens = new Set(options.tokens || []);
    this.orderbooks = new Map(); // token_id -> { bids: [], asks: [], lastUpdate: string, bestBid: number, bestAsk: number }
    this.reconnectAttempts = 0;
    this.maxReconnectDelayMs = 30_000;
    this.isConnecting = false;
    this.isConnected = false;
    this.listeners = new Set();
    this.pingInterval = null;
    this.useRestFallback = options.useRestFallback !== undefined ? options.useRestFallback : true;
    this.stats = {
      messagesReceived: 0,
      snapshotsProcessed: 0,
      reconnectCount: 0,
      lastMessageAt: null
    };
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  emit(event, data) {
    this.listeners.forEach(fn => {
      try { fn(event, data); } catch (e) {}
    });
  }

  /**
   * Connect to Polymarket CLOB WebSocket
   */
  connect() {
    if (this.isConnected || this.isConnecting) return;
    this.isConnecting = true;

    try {
      this.ws = new WebSocket(this.wsUrl, {
        handshakeTimeout: 10_000
      });

      this.ws.on('open', () => {
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        console.log(`[CLOB Streamer] Connected to Polymarket CLOB WebSocket: ${this.wsUrl}`);
        this.emit('connected', { timestamp: new Date().toISOString() });

        // Start heartbeat ping
        this.startHeartbeat();

        // Subscribe to existing tokens
        this.resubscribeAll();
      });

      this.ws.on('message', (raw) => {
        this.handleMessage(raw);
      });

      this.ws.on('error', (err) => {
        console.warn(`[CLOB Streamer Warning] WebSocket error: ${err.message}`);
        this.emit('error', { error: err.message });
      });

      this.ws.on('close', (code, reason) => {
        this.isConnected = false;
        this.isConnecting = false;
        this.stopHeartbeat();
        console.warn(`[CLOB Streamer] WebSocket closed (${code}). Scheduling reconnect...`);
        this.emit('disconnected', { code, reason: reason?.toString() });
        this.scheduleReconnect();
      });
    } catch (e) {
      this.isConnecting = false;
      this.isConnected = false;
      console.warn(`[CLOB Streamer] Failed to initialize WebSocket: ${e.message}`);
      this.scheduleReconnect();
    }
  }

  /**
   * Jittered exponential backoff for reconnection
   */
  scheduleReconnect() {
    this.reconnectAttempts++;
    this.stats.reconnectCount++;

    const baseDelay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelayMs);
    const jitter = Math.random() * 1000;
    const delay = Math.round(baseDelay + jitter);

    console.log(`[CLOB Streamer] Reconnecting in ${delay}ms (Attempt #${this.reconnectAttempts})...`);
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try { this.ws.ping(); } catch (e) {}
      }
    }, 20_000);
  }

  stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Subscribe to live updates for a specific token ID
   */
  addTokenSubscription(tokenId) {
    if (!tokenId) return;
    this.subscribedTokens.add(tokenId);

    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg = JSON.stringify({
        assets_ids: [tokenId],
        type: 'market'
      });
      this.ws.send(msg);
    }
  }

  resubscribeAll() {
    if (this.subscribedTokens.size === 0) return;
    const tokens = Array.from(this.subscribedTokens);
    const msg = JSON.stringify({
      assets_ids: tokens,
      type: 'market'
    });
    this.ws.send(msg);
  }

  /**
   * Process incoming WebSocket message
   */
  handleMessage(raw) {
    try {
      this.stats.messagesReceived++;
      this.stats.lastMessageAt = new Date().toISOString();
      const data = JSON.parse(raw.toString());

      if (data.event_type === 'book' || data.bids || data.asks) {
        this.processBookSnapshot(data);
      }
    } catch (e) {
      // ignore malformed frame
    }
  }

  /**
   * Parse bids/asks and compute 5-level Depth Ladder (DOM)
   */
  processBookSnapshot(data) {
    const tokenId = data.asset_id || data.market || (data.bids?.[0]?.asset_id);
    if (!tokenId) return;

    // Parse and sort bids (descending) & asks (ascending)
    const rawBids = data.bids || [];
    const rawAsks = data.asks || [];

    const bids = rawBids
      .map(b => ({ price: parseFloat(b.price), size: parseFloat(b.size) }))
      .sort((a, b) => b.price - a.price)
      .slice(0, 5);

    const asks = rawAsks
      .map(a => ({ price: parseFloat(a.price), size: parseFloat(a.size) }))
      .sort((a, b) => a.price - b.price)
      .slice(0, 5);

    const bestBid = bids.length > 0 ? bids[0].price : 0;
    const bestAsk = asks.length > 0 ? asks[0].price : 1;
    const spread = parseFloat(Math.max(0, bestAsk - bestBid).toFixed(4));
    const midPrice = parseFloat(((bestBid + bestAsk) / 2).toFixed(4));

    const bookEntry = {
      tokenId,
      bestBid,
      bestAsk,
      spread,
      midPrice,
      depthLadder: {
        bids,
        asks
      },
      lastUpdate: new Date().toISOString()
    };

    this.orderbooks.set(tokenId, bookEntry);
    this.stats.snapshotsProcessed++;
    this.emit('book_update', bookEntry);
  }

  /**
   * Get live 5-level DOM ladder for token ID, with REST fallback
   */
  async getLiveDepth(tokenId) {
    // 1. Check in-memory streaming cache
    if (this.orderbooks.has(tokenId)) {
      return this.orderbooks.get(tokenId);
    }

    // 2. Fallback to REST API if WebSocket not yet populated
    if (this.useRestFallback) {
      try {
        const restResult = await calculateOrderbookSlippage(tokenId, 100);
        if (restResult && restResult.bids && restResult.bids.length > 0) {
          const bestBid = restResult.bestBid || 0.50;
          const bestAsk = restResult.bestAsk || 0.52;

          const fallbackEntry = {
            tokenId,
            bestBid,
            bestAsk,
            spread: parseFloat((bestAsk - bestBid).toFixed(4)),
            midPrice: parseFloat(((bestBid + bestAsk) / 2).toFixed(4)),
            depthLadder: {
              bids: (restResult.bids || []).slice(0, 5),
              asks: (restResult.asks || []).slice(0, 5)
            },
            source: 'REST_FALLBACK',
            lastUpdate: new Date().toISOString()
          };

          this.orderbooks.set(tokenId, fallbackEntry);
          this.addTokenSubscription(tokenId);
          return fallbackEntry;
        }
      } catch (err) {}
    }

    return this.getSyntheticLadder(tokenId);
  }

  getSyntheticLadder(tokenId) {
    return {
      tokenId,
      bestBid: 0.48,
      bestAsk: 0.51,
      spread: 0.03,
      midPrice: 0.495,
      depthLadder: {
        bids: [
          { price: 0.48, size: 1250 },
          { price: 0.47, size: 2100 },
          { price: 0.46, size: 3400 },
          { price: 0.45, size: 5000 },
          { price: 0.44, size: 8200 }
        ],
        asks: [
          { price: 0.51, size: 1100 },
          { price: 0.52, size: 2400 },
          { price: 0.53, size: 3800 },
          { price: 0.54, size: 5500 },
          { price: 0.55, size: 9100 }
        ]
      },
      source: 'SYNTHETIC_DEFAULT',
      lastUpdate: new Date().toISOString()
    };
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      subscribedCount: this.subscribedTokens.size,
      cachedBooksCount: this.orderbooks.size,
      stats: this.stats
    };
  }
}

// Global singleton instance
export const clobStreamerInstance = new ClobOrderbookStreamer();
