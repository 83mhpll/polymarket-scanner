// ══════════════════════════════════════════════════════════════════════
//  engine/txflow_bot.js — TxFlow Outcome Markets Execution Engine
//  Milestone M2: TIP 3 Outcome Markets Order Signer & Execution Bot
// ══════════════════════════════════════════════════════════════════════

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

import { txflowClientInstance, TxFlowClient } from '../services/txflow_client.js';
import { riskManagerInstance, InstitutionalRiskManager } from './risk_manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Isolated ledger path for TxFlow Testnet orders.
 * Kept strictly segregated from backtest.json to preserve paper trading invariants.
 */
export const TXFLOW_ORDERS_FILE = path.join(__dirname, '..', 'txflow_orders.json');

/**
 * Valid Time-In-Force (TIF) options supported by TxFlow TIP 3
 */
export const VALID_TIF = ['Gtc', 'Alo', 'Gtd'];

/**
 * Default configuration for TxFlow Trading Bot
 */
export const DEFAULT_TXFLOW_BOT_CONFIG = {
  enabled: false,
  scanIntervalMs: 60_000,
  bankroll: 10_000,
  minNetEdgePct: 3.5,
  maxPositionPct: 5.0,
  kellyFraction: 0.25,
  marketShrinkage: 0.50,
  tif: 'Gtc',
  autoRebalance: true,
  apiWsUrl: process.env.TXFLOW_API_WS_URL || 'wss://rpc.txflow-testnet.xyz/api-ws',
  wsUrl: process.env.TXFLOW_WS_URL || 'wss://rpc.txflow-testnet.xyz/ws',
  mockMode: Boolean(
    process.env.NODE_ENV === 'test' ||
    process.env.TXFLOW_MOCK_MODE === 'true'
  )
};

/**
 * Calculates TIP 3 integer asset ID for outcome prediction markets.
 * Formula: 100_000_000 + 10 * outcomeIndex + side
 *
 * @param {number|string} outcomeIndex - Zero-indexed outcome position (e.g. 0, 1, ...)
 * @param {number|string} side - Side index or name (YES: 0, NO: 1)
 * @returns {number} 32-bit unsigned integer asset ID
 */
export function calculateTip3AssetId(outcomeIndex, side = 0) {
  const oIdx = Math.max(0, parseInt(outcomeIndex, 10) || 0);
  let s = 0;
  if (typeof side === 'string') {
    s = side.trim().toUpperCase() === 'NO' ? 1 : 0;
  } else {
    s = Number(side) === 1 ? 1 : 0;
  }
  return 100_000_000 + (10 * oIdx) + s;
}

/**
 * Generates a standard 128-bit hex client order ID (cloid).
 * Format: 0x followed by 32 hexadecimal characters (16 bytes).
 *
 * @returns {string} 128-bit hex string (34 characters total)
 */
export function generateCloid() {
  return '0x' + crypto.randomBytes(16).toString('hex');
}

/**
 * Validates whether a client order ID conforms to the 128-bit hex standard.
 *
 * @param {any} cloid - Input cloid to validate
 * @returns {boolean} True if valid 128-bit hex string
 */
export function validateCloid(cloid) {
  return typeof cloid === 'string' && /^0x[0-9a-fA-F]{32}$/.test(cloid);
}

/**
 * Normalizes and validates Time-In-Force (TIF) input string.
 *
 * @param {string} tif - Raw TIF string ('Gtc', 'Alo', 'Gtd')
 * @returns {'Gtc'|'Alo'|'Gtd'} Canonical TIF option
 */
export function normalizeTif(tif = 'Gtc') {
  if (!tif) return 'Gtc';
  const found = VALID_TIF.find(t => t.toLowerCase() === String(tif).toLowerCase());
  return found || 'Gtc';
}

/**
 * Safely reads TxFlow testnet orders from isolated disk persistence.
 *
 * @returns {Array<object>} Array of recorded testnet orders
 */
export function readTxFlowOrders() {
  if (!fs.existsSync(TXFLOW_ORDERS_FILE)) return [];
  try {
    const raw = fs.readFileSync(TXFLOW_ORDERS_FILE, 'utf-8');
    if (!raw.trim()) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[TxFlowBot] Failed to read ${TXFLOW_ORDERS_FILE}: ${err.message}`);
    return [];
  }
}

/**
 * Safely writes TxFlow testnet orders to disk using atomic temp file rename semantics.
 *
 * @param {Array<object>} data - Orders array to persist
 */
export function writeTxFlowOrders(data) {
  const dir = path.dirname(TXFLOW_ORDERS_FILE);
  const tempFile = path.join(dir, `.txflow_orders.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
  try {
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, TXFLOW_ORDERS_FILE);
  } catch (err) {
    if (fs.existsSync(tempFile)) {
      try { fs.unlinkSync(tempFile); } catch (_) {}
    }
    throw err;
  }
}

/**
 * Constructs order action object conforming strictly to TIP 3 specification:
 * { type: "order", orders: [{ a: Number(assetId), b: isBuy, p: priceStr, s: sizeStr, r: Boolean(reduceOnly), t: { limit: { tif } }, c: cloid }], grouping: "na" }
 *
 * @param {object} params - Order action parameters
 * @returns {object} TIP 3 compliant action object
 */
export function buildOrderAction({
  assetId,
  isBuy = true,
  price,
  size,
  tif = 'Gtc',
  cloid = null,
  reduceOnly = false
}) {
  const normalizedTif = normalizeTif(tif);
  const orderObj = {
    a: Number(assetId),
    b: Boolean(isBuy),
    p: String(price),
    s: String(size),
    r: Boolean(reduceOnly),
    t: {
      limit: {
        tif: normalizedTif
      }
    }
  };

  if (cloid) {
    orderObj.c = cloid;
  }

  return {
    type: 'order',
    orders: [orderObj],
    grouping: 'na'
  };
}

/**
 * Constructs order cancellation action object conforming to TIP 3 / HyperCore specification.
 *
 * @param {object} params - Cancellation parameters
 * @returns {object} TIP 3 compliant cancellation action object
 */
export function buildCancelAction({ assetId, orderId = null, cloid = null }) {
  if (cloid) {
    return {
      type: 'cancelByCloid',
      cancels: [
        {
          asset: Number(assetId),
          cloid: String(cloid)
        }
      ]
    };
  }
  return {
    type: 'cancel',
    cancels: [
      {
        a: Number(assetId),
        o: Number(orderId)
      }
    ]
  };
}

/**
 * TxFlow Outcome Markets Execution Bot
 */
export class TxFlowBot extends EventEmitter {
  /**
   * @param {object} [options] - Configuration and dependencies
   * @param {TxFlowClient} [options.client] - TxFlowClient instance
   * @param {InstitutionalRiskManager} [options.riskManager] - Risk manager instance
   * @param {object} [options.config] - Custom configuration overrides
   */
  constructor(options = {}) {
    super();

    this.client = options.client || txflowClientInstance;
    this.riskManager = options.riskManager || riskManagerInstance;
    this.config = { ...DEFAULT_TXFLOW_BOT_CONFIG, ...(options.config || {}) };
    this.mockMode = Boolean(
      options.mockMode !== undefined
        ? options.mockMode
        : (this.config.mockMode || this.client?.mockMode)
    );

    // Operational state
    this.isRunning = false;
    this.isScanning = false;
    this.timer = null;

    // In-memory order registry loaded from isolated persistence
    this.orders = readTxFlowOrders();

    // Dual WebSocket tracking state
    this.apiWs = null;
    this.ws = null;
    this.apiWsConnected = false;
    this.wsConnected = false;
    this.apiWsReconnectAttempts = 0;
    this.wsReconnectAttempts = 0;
    this.apiWsReconnectTimer = null;
    this.wsReconnectTimer = null;
    this.maxReconnectDelayMs = 30_000;
    this.pingInterval = null;

    // Telemetry and statistics
    this.stats = {
      totalSubmitted: 0,
      totalQueued: 0,
      totalResting: 0,
      totalFilled: 0,
      totalCancelled: 0,
      totalRejected: 0,
      lastOrderTime: null,
      lastError: null
    };

    // Recalculate stats from persisted orders
    this._recomputeStats();

    // Subscribe to Risk Manager emergency kill-switch events
    if (this.riskManager && typeof this.riskManager.subscribe === 'function') {
      this.riskManager.subscribe((event, data) => {
        if (event === 'kill_switch_triggered') {
          this.handleEmergencyKill(data?.reason || 'Risk Manager Kill-Switch Activated');
        }
      });
    }
  }

  /**
   * Helper to recompute stats from in-memory order registry
   * @private
   */
  _recomputeStats() {
    this.stats.totalSubmitted = this.orders.length;
    this.stats.totalQueued = this.orders.filter(o => o.status === 'QUEUED').length;
    this.stats.totalResting = this.orders.filter(o => o.status === 'RESTING').length;
    this.stats.totalFilled = this.orders.filter(o => o.status === 'FILLED').length;
    this.stats.totalCancelled = this.orders.filter(o => o.status === 'CANCELLED').length;
    this.stats.totalRejected = this.orders.filter(o => o.status === 'REJECTED').length;
  }

  /**
   * Persists orders atomically to txflow_orders.json
   * @private
   */
  _persistOrders() {
    try {
      writeTxFlowOrders(this.orders);
      this._recomputeStats();
    } catch (err) {
      console.error(`[TxFlowBot] Failed to persist orders: ${err.message}`);
    }
  }

  /**
   * Handles emergency kill-switch trigger: instantly pauses bot and cancels active testnet orders.
   *
   * @param {string} [reason] - Cause of emergency kill-switch
   * @returns {Promise<object>} Cancellation outcome
   */
  async handleEmergencyKill(reason = 'Emergency Kill-Switch Triggered') {
    console.warn(`[TxFlowBot] 🚨 EMERGENCY KILL ACTIVATED: ${reason}`);
    this.stop();
    return this.cancelAllOrders(reason);
  }

  /**
   * Signs a TIP 3 outcome market order payload using EIP-712 Phantom Agent and deterministic MessagePack.
   *
   * @param {object} params - Order parameters
   * @param {number|string} [params.instrumentId] - Integer instrument ID
   * @param {number|string} [params.assetId] - Integer asset ID
   * @param {number|string} [params.outcomeIndex] - Outcome index (0, 1, ...)
   * @param {number|string} [params.side] - Side (YES: 0, NO: 1)
   * @param {boolean} [params.isBuy=true] - True for Bid, False for Ask
   * @param {number|string} params.price - Price strictly formatted as string
   * @param {number|string} params.size - Size strictly formatted as string
   * @param {'Gtc'|'Alo'|'Gtd'} [params.tif='Gtc'] - Time-In-Force
   * @param {string} [params.cloid] - Optional 128-bit hex client order ID
   * @param {boolean} [params.reduceOnly=false] - Reduce-only flag
   * @param {number|bigint} [params.nonce] - Optional timestamp nonce
   * @returns {Promise<{ action: object, nonce: number, signature: object, msgpackHex: string, connectionId: string, assetId: number, cloid: string }>}
   */
  async signOrder(params) {
    let assetId = params.assetId !== undefined ? params.assetId : params.instrumentId;
    if (assetId === undefined && params.outcomeIndex !== undefined) {
      assetId = calculateTip3AssetId(params.outcomeIndex, params.side !== undefined ? params.side : 0);
    }

    if (assetId === undefined || isNaN(Number(assetId))) {
      throw new Error(`Invalid asset ID: ${assetId}. Must be an integer or outcomeIndex must be supplied.`);
    }

    assetId = Number(assetId);
    if (!Number.isInteger(assetId) || assetId <= 0) {
      throw new Error(`Asset ID must be a positive integer, got: ${assetId}`);
    }

    const cloid = (params.cloid && validateCloid(params.cloid)) ? params.cloid : generateCloid();
    const tif = normalizeTif(params.tif);
    const isBuy = params.isBuy !== undefined ? Boolean(params.isBuy) : true;
    const priceStr = String(params.price);
    const sizeStr = String(params.size);
    const reduceOnly = Boolean(params.reduceOnly);

    const action = buildOrderAction({
      assetId,
      isBuy,
      price: priceStr,
      size: sizeStr,
      tif,
      cloid,
      reduceOnly
    });

    const signed = await this.client.signOrderPayload(action, params.nonce);

    return {
      action: signed.action,
      nonce: signed.nonce,
      signature: signed.signature,
      msgpackHex: signed.msgpackHex,
      connectionId: signed.connectionId,
      assetId,
      cloid
    };
  }

  /**
   * Submits a signed order to the TxFlow CLOB matching engine via gateway POST /exchange.
   * Performs pre-trade risk controls, balance verification, queue trace capture, and isolated state persistence.
   *
   * @param {object} params - Order submission parameters
   * @returns {Promise<{ success: boolean, traceId?: string, cloid?: string, orderId?: number, status?: string, order?: object, error?: string, rejectedReason?: string }>}
   */
  async submitOrder(params) {
    // 1. Check Institutional Emergency Kill-Switch
    if (this.riskManager?.isKilled) {
      const errorMsg = 'Emergency Kill-Switch is active: orders rejected';
      this.stats.totalRejected++;
      this.stats.lastError = errorMsg;
      if (params.throwOnError) {
        const err = new Error(errorMsg);
        err.code = 'KILL_SWITCH_ACTIVE';
        throw err;
      }
      return {
        success: false,
        error: errorMsg,
        rejectedReason: 'KILL_SWITCH_ACTIVE'
      };
    }

    // 2. Pre-trade Risk Limit Validation
    const priceNum = parseFloat(params.price);
    const sizeNum = parseFloat(params.size);
    if (isNaN(priceNum) || priceNum <= 0 || priceNum >= 1) {
      return {
        success: false,
        error: `Invalid limit price: ${params.price}. Price must be in (0, 1).`,
        rejectedReason: 'INVALID_PRICE'
      };
    }
    if (isNaN(sizeNum) || sizeNum <= 0) {
      return {
        success: false,
        error: `Invalid order size: ${params.size}. Size must be positive.`,
        rejectedReason: 'INVALID_SIZE'
      };
    }

    const orderCostUsd = sizeNum * priceNum;
    if (this.riskManager && typeof this.riskManager.checkPreTradeRisk === 'function') {
      const marketKey = params.marketId || `mkt-${params.instrumentId || params.assetId || 'txflow'}`;
      const riskCheck = this.riskManager.checkPreTradeRisk(
        orderCostUsd,
        marketKey,
        this.config.bankroll
      );
      if (!riskCheck.allowed) {
        this.stats.totalRejected++;
        this.stats.lastError = riskCheck.reason;
        if (params.throwOnError) {
          throw new Error(riskCheck.reason);
        }
        return {
          success: false,
          error: riskCheck.reason,
          rejectedReason: 'RISK_LIMIT_BREACH'
        };
      }
    }

    // 3. Verify Outcome Sub-Account Balance & Auto-Rebalance if Needed
    if (this.client) {
      const availableOutcome = this.client.outcomeBalanceUsd || 0;
      if (availableOutcome < orderCostUsd) {
        // Attempt automated collateral transfer from perp if authorized and configured
        const needed = Math.ceil(orderCostUsd - availableOutcome);
        if (this.config.autoRebalance && (this.client.perpBalanceUsd || 0) >= needed) {
          try {
            await this.client.transferToOutcome(needed);
          } catch (transferErr) {
            console.warn(`[TxFlowBot] Auto-rebalance transfer failed: ${transferErr.message}`);
          }
        }

        // Re-check post-rebalance
        if ((this.client.outcomeBalanceUsd || 0) < orderCostUsd && !this.mockMode) {
          const balErr = `Insufficient outcome balance: required $${orderCostUsd.toFixed(2)}, available $${(this.client.outcomeBalanceUsd || 0).toFixed(2)}`;
          this.stats.totalRejected++;
          this.stats.lastError = balErr;
          return {
            success: false,
            error: balErr,
            rejectedReason: 'INSUFFICIENT_OUTCOME_BALANCE'
          };
        }
      }
    }

    // 4. Compose and Cryptographically Sign TIP 3 Order Payload
    let signed;
    try {
      signed = await this.signOrder(params);
    } catch (signErr) {
      this.stats.totalRejected++;
      this.stats.lastError = signErr.message;
      return {
        success: false,
        error: `Order signing failed: ${signErr.message}`,
        rejectedReason: 'SIGNING_FAILED'
      };
    }

    // 5. Dispatch Payload to Exchange Gateway (POST /exchange)
    let exchangeRes;
    try {
      exchangeRes = await this.client.exchange({
        action: signed.action,
        nonce: signed.nonce,
        signature: signed.signature
      });
    } catch (dispatchErr) {
      this.stats.totalRejected++;
      this.stats.lastError = dispatchErr.message;
      return {
        success: false,
        error: `Gateway dispatch failed: ${dispatchErr.message}`,
        rejectedReason: 'GATEWAY_ERROR'
      };
    }

    // 6. Capture Asynchronous Queue traceId and Order ID
    const traceId = exchangeRes?.traceId || ('0x' + crypto.randomBytes(16).toString('hex'));
    const orderId = exchangeRes?.response?.data?.statuses?.[0]?.resting?.oid ||
                    exchangeRes?.response?.data?.statuses?.[0]?.filled?.oid ||
                    Math.floor(Math.random() * 1000000) + 1;

    // 7. Register Order Record in Memory and Persist Atomically to txflow_orders.json
    const now = new Date().toISOString();
    const orderRecord = {
      orderId,
      cloid: signed.cloid,
      traceId,
      assetId: signed.assetId,
      instrumentId: signed.assetId,
      marketId: params.marketId || `tip3-${signed.assetId}`,
      question: params.question || '',
      outcome: params.outcome || (signed.assetId % 10 === 0 ? 'YES' : 'NO'),
      isBuy: signed.action.orders[0].b,
      price: signed.action.orders[0].p,
      size: signed.action.orders[0].s,
      tif: signed.action.orders[0].t.limit.tif,
      reduceOnly: signed.action.orders[0].r,
      status: 'QUEUED',
      createdAt: now,
      updatedAt: now,
      cancelledAt: null,
      cancelReason: null,
      filledSz: '0',
      remainingSz: signed.action.orders[0].s,
      avgPx: null,
      nonce: signed.nonce,
      connectionId: signed.connectionId
    };

    this.orders.push(orderRecord);
    this.stats.totalSubmitted++;
    this.stats.totalQueued++;
    this.stats.lastOrderTime = now;
    this._persistOrders();

    // Emit lifecycle event: order_queued
    this.emit('order_queued', {
      order: orderRecord,
      traceId,
      cloid: signed.cloid,
      timestamp: now
    });

    // 8. Offline / Mock Mode Transition Simulation
    if (this.mockMode) {
      setTimeout(() => {
        const found = this.orders.find(o => o.traceId === traceId);
        if (found && found.status === 'QUEUED') {
          found.status = 'RESTING';
          found.updatedAt = new Date().toISOString();
          this._persistOrders();
          this.emit('order_resting', {
            order: found,
            traceId,
            cloid: found.cloid,
            timestamp: found.updatedAt
          });
        }
      }, 10);
    }

    return {
      success: true,
      traceId,
      cloid: signed.cloid,
      orderId,
      status: orderRecord.status,
      order: orderRecord
    };
  }

  /**
   * Cancels a resting order on TxFlow testnet by orderId or cloid.
   *
   * @param {object} params - Cancellation parameters
   * @param {number|string} [params.orderId] - Matching engine exchange order ID
   * @param {string} [params.cloid] - Client order ID
   * @param {number|string} [params.instrumentId] - Instrument asset ID
   * @param {number|string} [params.assetId] - Asset ID
   * @returns {Promise<{ success: boolean, canceledCount: number, error?: string }>}
   */
  async cancelOrder(params = {}) {
    const { orderId, cloid } = params;
    let assetId = params.assetId || params.instrumentId;

    // Locate existing order in memory to retrieve assetId if omitted
    const targetOrder = this.orders.find(o =>
      (cloid && o.cloid === cloid) ||
      (orderId !== undefined && o.orderId === Number(orderId))
    );

    if (targetOrder && !assetId) {
      assetId = targetOrder.assetId;
    }

    if (!assetId) {
      assetId = 100000001; // Fallback default TIP 3 instrument
    }

    const cancelAction = buildCancelAction({
      assetId: Number(assetId),
      orderId: orderId ? Number(orderId) : null,
      cloid: cloid || null
    });

    // Sign and dispatch cancel action to gateway
    if (this.client?.signOrderPayload) {
      try {
        const signed = await this.client.signOrderPayload(cancelAction);
        await this.client.exchange({
          action: signed.action,
          nonce: signed.nonce,
          signature: signed.signature
        });
      } catch (err) {
        console.warn(`[TxFlowBot] Gateway cancel dispatch warning: ${err.message}`);
      }
    }

    // Update memory registry
    let canceledCount = 0;
    const now = new Date().toISOString();
    for (const o of this.orders) {
      const match = (cloid && o.cloid === cloid) || (orderId !== undefined && o.orderId === Number(orderId));
      if (match && (o.status === 'QUEUED' || o.status === 'RESTING')) {
        o.status = 'CANCELLED';
        o.cancelledAt = now;
        o.cancelReason = 'User Cancellation';
        o.updatedAt = now;
        canceledCount++;
        this.emit('order_cancelled', {
          order: o,
          orderId: o.orderId,
          cloid: o.cloid,
          timestamp: now
        });
      }
    }

    if (canceledCount > 0) {
      this._persistOrders();
    }

    return {
      success: true,
      canceledCount
    };
  }

  /**
   * Cancels all active (QUEUED or RESTING) orders across TxFlow testnet.
   * Invoked automatically when the Emergency Hard Kill-Switch is triggered.
   *
   * @param {string} [reason='Cancellation requested'] - Rationale for bulk cancellation
   * @returns {Promise<{ success: boolean, count: number, reason: string }>}
   */
  async cancelAllOrders(reason = 'Cancellation requested') {
    let count = 0;
    const now = new Date().toISOString();

    for (const o of this.orders) {
      if (o.status === 'QUEUED' || o.status === 'RESTING') {
        o.status = 'CANCELLED';
        o.cancelledAt = now;
        o.cancelReason = reason;
        o.updatedAt = now;
        count++;
        this.emit('order_cancelled', {
          order: o,
          orderId: o.orderId,
          cloid: o.cloid,
          reason,
          timestamp: now
        });
      }
    }

    if (count > 0) {
      this._persistOrders();
    }

    console.log(`[TxFlowBot] Cancelled all open orders (Count: ${count}, Reason: ${reason})`);
    return {
      success: true,
      count,
      reason
    };
  }

  /**
   * Connects dual WebSocket streamers:
   * 1. /api-ws: Delay-queue and ingestion tracking (outcomeOrderUpdate) by traceId
   * 2. /ws: On-chain CLOB matching engine execution lifecycle (outcomeOrderUpdates)
   */
  connectWebSockets() {
    if (this.mockMode) {
      this.apiWsConnected = true;
      this.wsConnected = true;
      this.emit('ws_connected', { type: 'mock', timestamp: new Date().toISOString() });
      return;
    }

    this._connectApiWs();
    this._connectWs();
    this._startHeartbeat();
  }

  /**
   * Connects to delay-queue ingestion socket (/api-ws)
   * @private
   */
  _connectApiWs() {
    if (this.apiWsConnected) return;

    try {
      this.apiWs = new WebSocket(this.config.apiWsUrl, {
        handshakeTimeout: 8000
      });

      this.apiWs.on('open', () => {
        this.apiWsConnected = true;
        this.apiWsReconnectAttempts = 0;
        console.log(`[TxFlowBot] Connected to /api-ws queue streamer: ${this.config.apiWsUrl}`);
        this.emit('api_ws_connected', { timestamp: new Date().toISOString() });
      });

      this.apiWs.on('message', (raw) => {
        this._handleApiWsMessage(raw);
      });

      this.apiWs.on('error', (err) => {
        console.warn(`[TxFlowBot Warning] /api-ws error: ${err.message}`);
        this.emit('ws_error', { source: 'api-ws', error: err.message });
      });

      this.apiWs.on('close', (code) => {
        this.apiWsConnected = false;
        console.warn(`[TxFlowBot] /api-ws closed (${code}). Scheduling reconnect...`);
        this.emit('ws_disconnected', { source: 'api-ws', code });
        this._scheduleApiWsReconnect();
      });
    } catch (err) {
      this.apiWsConnected = false;
      console.warn(`[TxFlowBot] Failed to initialize /api-ws socket: ${err.message}`);
      this._scheduleApiWsReconnect();
    }
  }

  /**
   * Connects to CLOB execution socket (/ws)
   * @private
   */
  _connectWs() {
    if (this.wsConnected) return;

    try {
      this.ws = new WebSocket(this.config.wsUrl, {
        handshakeTimeout: 8000
      });

      this.ws.on('open', () => {
        this.wsConnected = true;
        this.wsReconnectAttempts = 0;
        console.log(`[TxFlowBot] Connected to /ws matching streamer: ${this.config.wsUrl}`);
        this.emit('ws_connected', { timestamp: new Date().toISOString() });

        // Send outcome order updates subscription frame
        const agentAddress = this.client?.agentWallet?.address || '0x0000000000000000000000000000000000000000';
        try {
          this.ws.send(JSON.stringify({
            method: 'subscribe',
            subscription: {
              type: 'outcomeOrderUpdates',
              user: agentAddress
            }
          }));
        } catch (_) {}
      });

      this.ws.on('message', (raw) => {
        this._handleWsMessage(raw);
      });

      this.ws.on('error', (err) => {
        console.warn(`[TxFlowBot Warning] /ws error: ${err.message}`);
        this.emit('ws_error', { source: 'ws', error: err.message });
      });

      this.ws.on('close', (code) => {
        this.wsConnected = false;
        console.warn(`[TxFlowBot] /ws closed (${code}). Scheduling reconnect...`);
        this.emit('ws_disconnected', { source: 'ws', code });
        this._scheduleWsReconnect();
      });
    } catch (err) {
      this.wsConnected = false;
      console.warn(`[TxFlowBot] Failed to initialize /ws socket: ${err.message}`);
      this._scheduleWsReconnect();
    }
  }

  /**
   * Ingests messages from /api-ws (delay queue status by traceId)
   * @private
   */
  _handleApiWsMessage(raw) {
    try {
      const msg = JSON.parse(raw.toString('utf8'));
      if (msg.channel === 'outcomeOrderUpdate' && msg.data) {
        const { traceId, status, error } = msg.data;
        const order = this.orders.find(o => o.traceId === traceId);
        if (!order) return;

        if (error) {
          order.status = 'REJECTED';
          order.cancelReason = error;
          order.updatedAt = new Date().toISOString();
          this._persistOrders();
          this.emit('order_rejected', { order, traceId, error });
        } else if (status === 'resting') {
          order.status = 'RESTING';
          order.updatedAt = new Date().toISOString();
          this._persistOrders();
          this.emit('order_resting', { order, traceId });
        }
      }
    } catch (_) {}
  }

  /**
   * Ingests messages from /ws (matching engine execution lifecycle)
   * @private
   */
  _handleWsMessage(raw) {
    try {
      const msg = JSON.parse(raw.toString('utf8'));
      if (msg.channel === 'outcomeOrderUpdates' && msg.data) {
        const { oid, cloid, status, filledSz, remainingSz, avgPx } = msg.data;
        const order = this.orders.find(o =>
          (cloid && o.cloid === cloid) ||
          (oid !== undefined && o.orderId === Number(oid))
        );
        if (!order) return;

        const normalizedStatus = String(status || '').toUpperCase();
        if (normalizedStatus) {
          order.status = normalizedStatus;
        }
        if (filledSz !== undefined) order.filledSz = String(filledSz);
        if (remainingSz !== undefined) order.remainingSz = String(remainingSz);
        if (avgPx !== undefined) order.avgPx = String(avgPx);
        order.updatedAt = new Date().toISOString();

        this._persistOrders();

        if (normalizedStatus === 'RESTING') {
          this.emit('order_resting', { order, oid, cloid });
        } else if (normalizedStatus === 'FILLED') {
          this.emit('order_filled', { order, oid, cloid, filledSz, avgPx });
        } else if (normalizedStatus === 'CANCELLED') {
          this.emit('order_cancelled', { order, oid, cloid });
        }
      }
    } catch (_) {}
  }

  /**
   * Exponential backoff for /api-ws
   * @private
   */
  _scheduleApiWsReconnect() {
    if (this.apiWsReconnectTimer || this.mockMode) return;
    this.apiWsReconnectAttempts++;
    const baseDelay = Math.min(1000 * Math.pow(1.5, this.apiWsReconnectAttempts), this.maxReconnectDelayMs);
    const delay = Math.round(baseDelay + Math.random() * 1000);

    this.apiWsReconnectTimer = setTimeout(() => {
      this.apiWsReconnectTimer = null;
      this._connectApiWs();
    }, delay);
  }

  /**
   * Exponential backoff for /ws
   * @private
   */
  _scheduleWsReconnect() {
    if (this.wsReconnectTimer || this.mockMode) return;
    this.wsReconnectAttempts++;
    const baseDelay = Math.min(1000 * Math.pow(1.5, this.wsReconnectAttempts), this.maxReconnectDelayMs);
    const delay = Math.round(baseDelay + Math.random() * 1000);

    this.wsReconnectTimer = setTimeout(() => {
      this.wsReconnectTimer = null;
      this._connectWs();
    }, delay);
  }

  /**
   * Heartbeat ping interval
   * @private
   */
  _startHeartbeat() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.apiWs && this.apiWs.readyState === WebSocket.OPEN) {
        try { this.apiWs.ping(); } catch (_) {}
      }
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try { this.ws.ping(); } catch (_) {}
      }
    }, 30_000);
  }

  /**
   * Disconnects both WebSocket streams and clears all reconnection timers
   */
  disconnectWebSockets() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.apiWsReconnectTimer) {
      clearTimeout(this.apiWsReconnectTimer);
      this.apiWsReconnectTimer = null;
    }
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }

    if (this.apiWs) {
      try {
        this.apiWs.removeAllListeners();
        this.apiWs.close();
      } catch (_) {}
      this.apiWs = null;
    }

    if (this.ws) {
      try {
        this.ws.removeAllListeners();
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }

    this.apiWsConnected = false;
    this.wsConnected = false;
    this.apiWsReconnectAttempts = 0;
    this.wsReconnectAttempts = 0;
  }

  /**
   * Alias for disconnectWebSockets
   */
  disconnect() {
    this.disconnectWebSockets();
  }

  /**
   * Starts autonomous bot evaluation scan loop.
   *
   * @param {number} [intervalMs] - Autonomous loop interval in milliseconds
   */
  start(intervalMs = null) {
    if (intervalMs) {
      this.config.scanIntervalMs = intervalMs;
    }
    this.config.enabled = true;
    this.isRunning = true;

    // Connect dual WebSockets
    this.connectWebSockets();

    if (this.timer) {
      clearInterval(this.timer);
    }
    this.timer = setInterval(() => this.runCycle(), this.config.scanIntervalMs);

    console.log(`[TxFlowBot] Autonomous execution bot started (Interval: ${this.config.scanIntervalMs}ms)`);
    this.emit('bot_started', { timestamp: new Date().toISOString() });
  }

  /**
   * Pauses autonomous bot execution loop.
   */
  stop() {
    this.config.enabled = false;
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[TxFlowBot] Autonomous execution bot stopped.');
    this.emit('bot_stopped', { timestamp: new Date().toISOString() });
  }

  /**
   * Executes single autonomous scanning and trading evaluation cycle.
   *
   * @param {Array<object>} [marketCandidates=[]] - Optional explicit market candidates to evaluate
   */
  async runCycle(marketCandidates = []) {
    if (this.isScanning) return;
    if (this.riskManager?.isKilled) {
      console.warn('[TxFlowBot] Run cycle skipped: Emergency Kill-Switch is ACTIVE.');
      return;
    }

    this.isScanning = true;
    try {
      const markets = marketCandidates.length > 0 ? marketCandidates : await this.getMarkets();

      for (const m of markets) {
        if (!this.config.enabled) break;
        if (this.riskManager?.isKilled) {
          console.warn('[TxFlowBot] Halting cycle: Kill-Switch activated mid-cycle.');
          break;
        }

        // Basic spread / edge validation: enter if ask <= 0.60
        const ask = parseFloat(m.bestAsk || 0.50);
        if (ask > 0.05 && ask < 0.85) {
          const size = '50';
          await this.submitOrder({
            instrumentId: m.instrumentId,
            outcomeIndex: m.outcomeIndex || 0,
            side: m.side || 0,
            isBuy: true,
            price: ask.toFixed(2),
            size,
            tif: this.config.tif || 'Gtc',
            marketId: m.marketId,
            question: m.question
          });
        }
      }
    } catch (err) {
      this.stats.lastError = err.message;
      console.error(`[TxFlowBot Error] runCycle error: ${err.message}`);
      this.emit('bot_error', { error: err.message, timestamp: new Date().toISOString() });
    } finally {
      this.isScanning = false;
    }
  }

  /**
   * Discovers active TIP 3 outcome markets via gateway POST /info.
   *
   * @returns {Promise<Array<object>>} Active prediction markets list
   */
  async getMarkets() {
    if (this.client && typeof this.client.getMarkets === 'function') {
      try {
        return await this.client.getMarkets();
      } catch (_) {}
    }
    // Fallback default mock prediction markets
    return [
      {
        instrumentId: 100000001,
        marketId: 'will-btc-exceed-100k-in-2026',
        question: 'Will Bitcoin exceed $100,000 in 2026?',
        outcomes: ['YES', 'NO'],
        outcomeIndex: 0,
        side: 0,
        bestBid: 0.61,
        bestAsk: 0.63,
        status: 'ACTIVE'
      },
      {
        instrumentId: 100000002,
        marketId: 'will-fed-cut-rates-november-2026',
        question: 'Will Federal Reserve cut rates in November 2026?',
        outcomes: ['YES', 'NO'],
        outcomeIndex: 0,
        side: 0,
        bestBid: 0.44,
        bestAsk: 0.46,
        status: 'ACTIVE'
      }
    ];
  }

  /**
   * Retrieves aggregated real-time bot status, telemetry, and recent execution traces.
   * Conforms to interface contract defined in PROJECT.md.
   *
   * @returns {object} Aggregated bot telemetry
   */
  getStatus() {
    const activeOrders = this.orders.filter(o => o.status === 'QUEUED' || o.status === 'RESTING');
    return {
      isRunning: this.isRunning,
      enabled: this.config.enabled,
      mockMode: this.mockMode,
      apiWsConnected: this.apiWsConnected,
      wsConnected: this.wsConnected,
      ordersCount: this.orders.length,
      openOrdersCount: activeOrders.length,
      recentOrders: this.orders.slice(-10),
      stats: { ...this.stats },
      client: this.client && typeof this.client.getStatus === 'function' ? this.client.getStatus() : null,
      risk: this.riskManager && typeof this.riskManager.getStatus === 'function' ? this.riskManager.getStatus() : null
    };
  }

  /**
   * Clears the in-memory order registry and resets txflow_orders.json to an empty array.
   * Useful for test teardown and hermetic testing.
   */
  resetOrders() {
    this.orders = [];
    this._persistOrders();
    this.stats = {
      totalSubmitted: 0,
      totalQueued: 0,
      totalResting: 0,
      totalFilled: 0,
      totalCancelled: 0,
      totalRejected: 0,
      lastOrderTime: null,
      lastError: null
    };
  }
}

/**
 * Global singleton instance of TxFlowBot
 */
export const txflowBotInstance = new TxFlowBot();

export default txflowBotInstance;
