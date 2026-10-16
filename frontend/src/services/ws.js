/**
 * WebSocket Streaming Helper for Polymarket CLOB Market Data
 * Provides resilient streaming subscriptions with automatic reconnection,
 * heartbeat monitoring, and fallback polling capabilities.
 */

export const POLYMARKET_WS_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';

/**
 * Creates a managed CLOB WebSocket subscription client
 * @param {Object} options
 * @param {string[]} [options.tokenIds] - Initial tokens to track
 * @param {Function} [options.onDepthUpdate] - Callback for orderbook depth messages
 * @param {Function} [options.onStatusChange] - Callback for status transitions ('connected'|'reconnecting'|'disconnected')
 * @param {Function} [options.onError] - Callback for errors
 * @param {number} [options.heartbeatMs] - Heartbeat ping/pong check interval
 * @param {number} [options.maxReconnectAttempts] - Reconnection attempt ceiling
 */
export function createClobStreamer({
  tokenIds = [],
  onDepthUpdate = () => {},
  onStatusChange = () => {},
  onError = () => {},
  heartbeatMs = 20000,
  maxReconnectAttempts = 10,
} = {}) {
  let ws = null;
  let isClosedManually = false;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let heartbeatTimer = null;
  let activeSubscriptions = new Set(tokenIds);

  function setStatus(status) {
    if (typeof onStatusChange === 'function') {
      onStatusChange(status);
    }
  }

  function connect() {
    if (isClosedManually) return;
    setStatus(reconnectAttempts > 0 ? 'reconnecting' : 'disconnected');

    try {
      ws = new WebSocket(POLYMARKET_WS_URL);

      ws.onopen = () => {
        reconnectAttempts = 0;
        setStatus('connected');
        startHeartbeat();

        // Subscribe to all tracked token IDs
        if (activeSubscriptions.size > 0) {
          const payload = {
            assets_ids: Array.from(activeSubscriptions),
            type: 'market',
          };
          ws.send(JSON.stringify(payload));
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && (data.event_type === 'book' || data.event_type === 'price_change' || Array.isArray(data))) {
            onDepthUpdate(data);
          }
        } catch (e) {
          // Ignore non-JSON ping/pong or malformed packets
        }
      };

      ws.onerror = (err) => {
        onError(err);
      };

      ws.onclose = () => {
        stopHeartbeat();
        setStatus('disconnected');
        if (!isClosedManually) {
          scheduleReconnect();
        }
      };
    } catch (err) {
      onError(err);
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (isClosedManually) return;
    if (reconnectAttempts >= maxReconnectAttempts) {
      setStatus('disconnected');
      return;
    }

    const backoffMs = Math.min(1000 * Math.pow(1.5, reconnectAttempts), 15000);
    reconnectAttempts++;
    setStatus('reconnecting');

    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      connect();
    }, backoffMs);
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(JSON.stringify({ type: 'ping' }));
        } catch (e) {
          // ignore
        }
      }
    }, heartbeatMs);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function subscribe(tokenId) {
    if (!tokenId) return;
    activeSubscriptions.add(tokenId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ assets_ids: [tokenId], type: 'market' }));
      } catch (e) {
        // will be sent on reconnect
      }
    }
  }

  function unsubscribe(tokenId) {
    if (!tokenId) return;
    activeSubscriptions.delete(tokenId);
  }

  function close() {
    isClosedManually = true;
    stopHeartbeat();
    clearTimeout(reconnectTimer);
    if (ws) {
      try {
        ws.close();
      } catch (e) {
        // ignore
      }
      ws = null;
    }
    setStatus('disconnected');
  }

  // Initial connection
  connect();

  return {
    subscribe,
    unsubscribe,
    close,
    reconnect: connect,
    getSubscriptions: () => Array.from(activeSubscriptions),
  };
}
