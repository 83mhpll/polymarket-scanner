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
    this.orderbooks = new Map(); // token_id -> depth schema entry
    this.reconnectAttempts = 0;
    this.maxReconnectDelayMs = 30_000;
    this.reconnectTimer = null;
    this.isConnecting = false;
    this.isConnected = false;
    this.isAlive = true;
    this.connectedAt = null;
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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.isConnected || this.isConnecting) return;
    this.isConnecting = true;

    try {
      this.ws = new WebSocket(this.wsUrl, {
        handshakeTimeout: 10_000
      });

      this.ws.on('open', () => {
        this.isConnected = true;
        this.isConnecting = false;
        this.isAlive = true;
        this.connectedAt = Date.now();
        this.reconnectAttempts = 0;
        console.log(`[CLOB Streamer] Connected to Polymarket CLOB WebSocket: ${this.wsUrl}`);
        this.emit('connected', { timestamp: new Date().toISOString() });

        // Start heartbeat ping
        this.startHeartbeat();

        // Subscribe to existing tokens
        this.resubscribeAll();
      });

      this.ws.on('pong', () => {
        this.isAlive = true;
      });

      this.ws.on('message', (raw) => {
        this.handleMessage(raw);
      });

      this.ws.on('error', (err) => {
        this.isConnecting = false;
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
   * Disconnect and clear all timers
   */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
    this.isConnected = false;
    this.isConnecting = false;
    this.connectedAt = null;
  }

  /**
   * Jittered exponential backoff for reconnection
   */
  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.reconnectAttempts++;
    this.stats.reconnectCount++;

    const baseDelay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelayMs);
    const jitter = Math.random() * 1000;
    const delay = Math.round(baseDelay + jitter);

    console.log(`[CLOB Streamer] Reconnecting in ${delay}ms (Attempt #${this.reconnectAttempts})...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.isAlive = true;
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        if (this.isAlive === false) {
          console.warn('[CLOB Streamer] Heartbeat missed, terminating connection...');
          try { this.ws.terminate(); } catch (e) {}
          return;
        }
        this.isAlive = false;
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
      const parsed = JSON.parse(raw.toString());
      const messages = Array.isArray(parsed) ? parsed : [parsed];

      for (const data of messages) {
        if (data.event_type === 'book' || data.bids || data.asks) {
          this.processBookSnapshot(data);
        }
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
    const rawBids = (data.bids || [])
      .map(b => ({ price: parseFloat(b.price), size: parseFloat(b.size) }))
      .filter(b => !isNaN(b.price) && !isNaN(b.size) && b.price > 0 && b.size > 0);

    const rawAsks = (data.asks || [])
      .map(a => ({ price: parseFloat(a.price), size: parseFloat(a.size) }))
      .filter(a => !isNaN(a.price) && !isNaN(a.size) && a.price > 0 && a.size > 0);

    const sortedBids = rawBids.sort((a, b) => b.price - a.price);
    const sortedAsks = rawAsks.sort((a, b) => a.price - b.price);

    const ladderBids = sortedBids.slice(0, 5).map(b => ({
      price: b.price,
      size: b.size,
      depthUsd: parseFloat((b.price * b.size).toFixed(2))
    }));

    const ladderAsks = sortedAsks.slice(0, 5).map(a => ({
      price: a.price,
      size: a.size,
      depthUsd: parseFloat((a.price * a.size).toFixed(2))
    }));

    const bestBid = ladderBids.length > 0 ? ladderBids[0].price : 0;
    const bestAsk = ladderAsks.length > 0 ? ladderAsks[0].price : 1;
    const spread = parseFloat(Math.max(0, bestAsk - bestBid).toFixed(4));
    const spreadPercent = bestAsk > 0 ? parseFloat(((spread / bestAsk) * 100).toFixed(2)) : 0;
    const midPrice = parseFloat(((bestBid + bestAsk) / 2).toFixed(4));

    const bookEntry = {
      success: true,
      tokenId,
      bestBid,
      bestAsk,
      spread,
      spreadPercent,
      midPrice,
      midpoint: midPrice,
      depthLadder: {
        bids: ladderBids,
        asks: ladderAsks
      },
      ladderBids,
      ladderAsks,
      bids: ladderBids,
      asks: ladderAsks,
      bidsDepthCount: sortedBids.length,
      asksDepthCount: sortedAsks.length,
      slippagePercent: 0,
      effectiveCent: (bestAsk * 100).toFixed(1),
      netVwapWithFee: bestAsk,
      breakEvenProb: bestAsk,
      source: 'websocket',
      lastUpdate: new Date().toISOString()
    };

    this.orderbooks.set(tokenId, bookEntry);
    this.stats.snapshotsProcessed++;
    this.emit('book_update', bookEntry);
  }

  /**
   * Get live 5-level DOM ladder for token ID, with REST fallback
   */
  async getLiveDepth(tokenId, amount = 100) {
    if (tokenId) {
      this.addTokenSubscription(tokenId);
    }

    // 1. Check in-memory streaming cache
    if (this.orderbooks.has(tokenId)) {
      return this.orderbooks.get(tokenId);
    }

    // 2. Fallback to REST API if WebSocket not yet populated
    if (this.useRestFallback) {
      try {
        const restResult = await calculateOrderbookSlippage(tokenId, amount);
        const rBids = restResult.ladderBids || restResult.bids || [];
        const rAsks = restResult.ladderAsks || restResult.asks || [];
        if (restResult && (rBids.length > 0 || rAsks.length > 0)) {
          const bestBid = restResult.bestBid ?? (rBids[0]?.price ?? 0.50);
          const bestAsk = restResult.bestAsk ?? (rAsks[0]?.price ?? 0.52);
          const spread = parseFloat(Math.max(0, bestAsk - bestBid).toFixed(4));
          const spreadPct = bestAsk > 0 ? parseFloat(((spread / bestAsk) * 100).toFixed(2)) : 0;
          const midPrice = parseFloat(((bestBid + bestAsk) / 2).toFixed(4));

          const ladderBids = rBids.slice(0, 5).map(b => ({
            price: b.price,
            size: b.size,
            depthUsd: b.depthUsd !== undefined ? b.depthUsd : parseFloat((b.price * b.size).toFixed(2))
          }));
          const ladderAsks = rAsks.slice(0, 5).map(a => ({
            price: a.price,
            size: a.size,
            depthUsd: a.depthUsd !== undefined ? a.depthUsd : parseFloat((a.price * a.size).toFixed(2))
          }));

          const fallbackEntry = {
            success: true,
            tokenId,
            bestBid,
            bestAsk,
            spread,
            spreadPercent: spreadPct,
            midPrice,
            midpoint: midPrice,
            depthLadder: { bids: ladderBids, asks: ladderAsks },
            ladderBids,
            ladderAsks,
            bids: ladderBids,
            asks: ladderAsks,
            bidsDepthCount: restResult.bidsDepthCount || ladderBids.length,
            asksDepthCount: restResult.asksDepthCount || ladderAsks.length,
            slippagePercent: restResult.slippagePercent || 0,
            effectiveCent: restResult.effectiveCent || (bestAsk * 100).toFixed(1),
            netVwapWithFee: restResult.netVwapWithFee || bestAsk,
            breakEvenProb: restResult.breakEvenProb || bestAsk,
            feeRatePercent: restResult.feeRatePercent || 0,
            feeRateBps: restResult.feeRateBps || 0,
            source: 'REST_FALLBACK',
            lastUpdate: new Date().toISOString()
          };

          this.orderbooks.set(tokenId, fallbackEntry);
          return fallbackEntry;
        }
      } catch (err) {}
    }

    return this.getSyntheticLadder(tokenId, amount);
  }

  getSyntheticLadder(tokenId, amount = 100) {
    const bids = [
      { price: 0.48, size: 1250, depthUsd: 600.0 },
      { price: 0.47, size: 2100, depthUsd: 987.0 },
      { price: 0.46, size: 3400, depthUsd: 1564.0 },
      { price: 0.45, size: 5000, depthUsd: 2250.0 },
      { price: 0.44, size: 8200, depthUsd: 3608.0 }
    ];
    const asks = [
      { price: 0.51, size: 1100, depthUsd: 561.0 },
      { price: 0.52, size: 2400, depthUsd: 1248.0 },
      { price: 0.53, size: 3800, depthUsd: 2014.0 },
      { price: 0.54, size: 5500, depthUsd: 2970.0 },
      { price: 0.55, size: 9100, depthUsd: 5005.0 }
    ];
    return {
      success: true,
      tokenId,
      bestBid: 0.48,
      bestAsk: 0.51,
      spread: 0.03,
      spreadPercent: 5.88,
      midPrice: 0.495,
      midpoint: 0.495,
      depthLadder: {
        bids,
        asks
      },
      ladderBids: bids,
      ladderAsks: asks,
      bids,
      asks,
      bidsDepthCount: bids.length,
      asksDepthCount: asks.length,
      slippagePercent: 0.1,
      effectiveCent: '51.0',
      netVwapWithFee: 0.51,
      breakEvenProb: 0.51,
      feeRatePercent: 0,
      feeRateBps: 0,
      source: 'SYNTHETIC_DEFAULT',
      lastUpdate: new Date().toISOString()
    };
  }

  getStatus() {
    const status = this.isConnected ? 'CONNECTED' : (this.isConnecting ? 'CONNECTING' : 'DISCONNECTED');
    const uptimeSeconds = this.connectedAt && this.isConnected ? Math.round((Date.now() - this.connectedAt) / 1000) : 0;
    return {
      status,
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      wsUrl: this.wsUrl,
      subscribedCount: this.subscribedTokens.size,
      cachedBooksCount: this.orderbooks.size,
      uptimeSeconds,
      stats: this.stats
    };
  }
}

// Global singleton instance
export const clobStreamerInstance = new ClobOrderbookStreamer();
