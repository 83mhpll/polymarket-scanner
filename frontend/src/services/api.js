/**
 * Polymarket Pro Institutional API Service
 * Communicates with Node.js backend (server.js) via Vite reverse proxy
 */

const BASE_URL = '';

/**
 * Fetch active market opportunities from scanner
 * @param {boolean} force - Force cache bypass / background scan trigger
 */
export async function fetchOpportunities(force = false) {
  const url = force ? '/api/opportunities?force=true' : '/api/opportunities';
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch opportunities: HTTP ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Fetch live 5-level L2 CLOB depth ladder and slippage telemetry
 * @param {string} tokenId - Market token asset ID
 * @param {number} amount - Simulation dollar size in USDC
 */
export async function fetchLiveDepth(tokenId, amount = 100) {
  if (!tokenId) {
    throw new Error('tokenId parameter is required for fetchLiveDepth');
  }
  const res = await fetch(`/api/v1/clob/live-depth?token_id=${encodeURIComponent(tokenId)}&amount=${amount}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch live depth: HTTP ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Fetch 24/7 Autonomous Paper Trading Bot telemetry and operational state
 */
export async function fetchBotStatus() {
  const res = await fetch('/api/v1/bot/status');
  if (!res.ok) {
    throw new Error(`Failed to fetch bot status: HTTP ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Start the autonomous paper trading bot
 */
export async function startBot() {
  const res = await fetch('/api/v1/bot/start', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to start bot: HTTP ${res.status}`);
  }
  return await res.json();
}

/**
 * Pause / Stop the autonomous paper trading bot
 */
export async function stopBot() {
  const res = await fetch('/api/v1/bot/stop', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to stop bot: HTTP ${res.status}`);
  }
  return await res.json();
}

/**
 * Execute a single paper trading evaluation cycle immediately
 */
export async function runBotCycle() {
  const res = await fetch('/api/v1/bot/run-cycle', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to run bot cycle: HTTP ${res.status}`);
  }
  return await res.json();
}

/**
 * Fetch real-time institutional risk evaluation and kill-switch status
 * @param {number} bankroll - Reference bankroll in USD
 */
export async function fetchRiskStatus(bankroll = 10000) {
  const res = await fetch(`/api/v1/risk/status?bankroll=${bankroll}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch risk status: HTTP ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Activate Emergency Hard Kill-Switch (sub-second halt & cancel open orders)
 * @param {string} reason - Operator reason for halt
 */
export async function triggerKillSwitch(reason = 'Manual Emergency Kill-Switch Activated via Terminal UI') {
  const res = await fetch('/api/v1/risk/kill-switch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to trigger kill switch: HTTP ${res.status}`);
  }
  return await res.json();
}

/**
 * Reset Emergency Kill-Switch with operator authorization
 */
export async function resetKillSwitch() {
  const res = await fetch('/api/v1/risk/reset', { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to reset kill switch: HTTP ${res.status}`);
  }
  return await res.json();
}

/**
 * Fetch CLOB streamer WebSocket connectivity status
 */
export async function fetchStreamStatus() {
  const res = await fetch('/api/v1/clob/stream-status');
  if (!res.ok) {
    throw new Error(`Failed to fetch stream status: HTTP ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Fetch bot and scanner configuration
 */
export async function fetchConfig() {
  const res = await fetch('/api/config');
  if (!res.ok) {
    throw new Error(`Failed to fetch config: HTTP ${res.status}`);
  }
  return await res.json();
}

/**
 * Update bot and scanner configuration
 */
export async function updateConfig(newConfig) {
  const res = await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newConfig),
  });
  if (!res.ok) {
    throw new Error(`Failed to update config: HTTP ${res.status}`);
  }
  return await res.json();
}

/**
 * Fetch high conviction alerts
 */
export async function fetchAlerts() {
  const res = await fetch('/api/alerts');
  if (!res.ok) {
    throw new Error(`Failed to fetch alerts: HTTP ${res.status}`);
  }
  return await res.json();
}

/**
 * ═══════════════════════════════════════════════════════════════
 * TxFlow Testnet (TIP 3: Outcome Markets) REST API Client
 * ═══════════════════════════════════════════════════════════════
 */

/**
 * Fetch combined TxFlow testnet status: balances, agent approval, and order telemetry
 */
export async function fetchTxFlowStatus() {
  const res = await fetch('/api/v1/txflow/status');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch TxFlow status: HTTP ${res.status} ${res.statusText}`);
  }
  return await res.json();
}

/**
 * Request testnet USDC funds from TxFlow faucet into perp sub-account
 * @param {string|null} address - Optional target wallet address
 */
export async function claimTxFlowFaucet(address = null) {
  const res = await fetch('/api/v1/txflow/faucet', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(address ? { address } : {}),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to claim TxFlow faucet: HTTP ${res.status}`);
  }
  return await res.json();
}

/**
 * Rebalance collateral from perp sub-account to outcome sub-account
 * @param {number|string} amount - USDC amount to transfer
 */
export async function transferTxFlowCollateral(amount = 1000) {
  const res = await fetch('/api/v1/txflow/transfer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to transfer collateral: HTTP ${res.status}`);
  }
  return await res.json();
}

/**
 * Submit signed TIP 3 CLOB order to TxFlow matching engine
 * @param {Object} params - Order parameters { instrumentId, isBuy, price, size, tif, cloid }
 */
export async function submitTxFlowOrder(params) {
  const res = await fetch('/api/v1/txflow/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to submit TxFlow order: HTTP ${res.status}`);
  }
  return await res.json();
}

/**
 * Cancel open TxFlow order by cloid or orderId
 * @param {Object} params - Cancel parameters { orderId, cloid, instrumentId }
 */
export async function cancelTxFlowOrder(params) {
  const res = await fetch('/api/v1/txflow/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to cancel TxFlow order: HTTP ${res.status}`);
  }
  return await res.json();
}

/**
 * Fetch active TxFlow TIP 3 outcome prediction markets
 */
export async function fetchTxFlowMarkets() {
  const res = await fetch('/api/v1/txflow/markets');
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to fetch TxFlow markets: HTTP ${res.status}`);
  }
  return await res.json();
}

