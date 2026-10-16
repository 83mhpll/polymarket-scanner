// ══════════════════════════════════════════════════════════════════════
//  engine/backtest_resolver.js — Bounded Parallel Portfolio Resolution
//  Milestone M3: High-Concurrency Deduplicated Settlement Engine
// ══════════════════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const BACKTEST_FILE = path.join(__dir, '..', 'backtest.json');

/**
 * Concurrency worker pool executing tasks with a bounded concurrency limit.
 * Eliminates event loop blocking without flooding external API rate limits.
 * 
 * @template T, R
 * @param {T[]} items - Array of items to process
 * @param {number} concurrency - Max concurrent workers (default: 8, bounded [5, 10])
 * @param {(item: T, index: number) => Promise<R>} workerFn - Async worker function
 * @returns {Promise<R[]>} Ordered array of results
 */
export async function mapConcurrent(items, concurrency = 8, workerFn) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array(items.length);
  let nextIdx = 0;

  const worker = async () => {
    while (nextIdx < items.length) {
      const idx = nextIdx++;
      try {
        results[idx] = await workerFn(items[idx], idx);
      } catch (err) {
        results[idx] = { error: err };
      }
    }
  };

  const pool = Array.from({ length: limit }, () => worker());
  await Promise.all(pool);
  return results;
}

/**
 * Fetch market event data from Polymarket Gamma API with timeout guard.
 * Always clears timer in finally block to eliminate event loop timer leaks.
 * 
 * @param {string} slug - Polymarket event slug
 * @param {number} timeoutMs - Timeout guard in milliseconds (default: 5000ms)
 * @param {function} fetchFn - Fetch implementation (default: global fetch)
 * @returns {Promise<object|null>} Event data or null
 */
export async function fetchGammaEvent(slug, timeoutMs = 5000, fetchFn = fetch) {
  if (!slug || typeof slug !== 'string') return null;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = `https://gamma-api.polymarket.com/events?slug=${encodeURIComponent(slug.trim())}`;
    const r = await fetchFn(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' }
    });
    if (!r.ok) return null;
    const data = await r.json();
    if (Array.isArray(data)) return data[0] || null;
    if (data?.events && Array.isArray(data.events)) return data.events[0] || null;
    return null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(tid); // Guarantees zero timer resource leaks
  }
}

/**
 * Safely read ledger from disk.
 */
export function readLedger(filePath = BACKTEST_FILE) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) return [];
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

/**
 * Safely write ledger to disk atomically via temporary file and atomic rename.
 */
export function writeLedger(data, filePath = BACKTEST_FILE) {
  const dir = path.dirname(filePath);
  const tempFile = path.join(
    dir,
    `.${path.basename(filePath)}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
  );
  try {
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempFile, filePath);
  } catch (err) {
    if (fs.existsSync(tempFile)) {
      try { fs.unlinkSync(tempFile); } catch (_) {}
    }
    throw err;
  }
}

// In-flight resolution mutex/deduplication promise
let inFlightResolution = null;

/**
 * Resolves open paper trades in backtest.json with bounded parallel fetching.
 * Deduplicates slug queries, enforces timeout guards, and performs atomic
 * disk re-read and merge to prevent race conditions with Kill-Switch or bot trades.
 * 
 * @param {object} options
 * @param {number} [options.concurrency=8] - Bounded concurrency limit (5-10)
 * @param {number} [options.timeoutMs=5000] - Per-query timeout in ms
 * @param {function} [options.fetchFn=fetch] - Custom fetch implementation
 * @param {string} [options.filePath=BACKTEST_FILE] - Path to backtest ledger
 * @returns {Promise<Array>} Current updated backtest ledger
 */
export async function resolveBacktestPortfolio(options = {}) {
  if (inFlightResolution) {
    return inFlightResolution;
  }

  inFlightResolution = (async () => {
    try {
      return await _executeResolveBacktestPortfolio(options);
    } finally {
      inFlightResolution = null;
    }
  })();

  return inFlightResolution;
}

async function _executeResolveBacktestPortfolio({
  concurrency = 8,
  timeoutMs = 5000,
  fetchFn = fetch,
  filePath = BACKTEST_FILE
} = {}) {
  const initialLedger = readLedger(filePath);
  const openTrades = initialLedger.filter((t) => t.status === 'Open');

  // If no open trades, return current ledger immediately without network calls
  if (openTrades.length === 0) {
    return initialLedger;
  }

  // 1. Deduplicate event slugs across open trades
  const slugSet = new Set();
  for (const t of openTrades) {
    if (t.slug && typeof t.slug === 'string') {
      slugSet.add(t.slug.trim());
    }
  }
  const uniqueSlugs = Array.from(slugSet);

  // 2. Fetch event data with bounded concurrency pool
  const slugEvents = await mapConcurrent(
    uniqueSlugs,
    concurrency,
    async (slug) => {
      const ev = await fetchGammaEvent(slug, timeoutMs, fetchFn);
      return { slug, ev };
    }
  );

  const slugMap = new Map();
  for (const item of slugEvents) {
    if (item && item.slug && item.ev) {
      slugMap.set(item.slug, item.ev);
    }
  }

  // 3. Compute resolution updates for each open trade
  const updates = new Map();
  for (const trade of openTrades) {
    if (!trade.slug) continue;
    const ev = slugMap.get(trade.slug);
    if (!ev || !ev.markets || ev.markets.length === 0) continue;

    // Match market by question or fallback to first
    const m = ev.markets.find((mkt) => mkt.question === trade.question) || ev.markets[0];
    if (!m) continue;

    let prices = [];
    if (Array.isArray(m.outcomePrices)) {
      prices = m.outcomePrices;
    } else if (typeof m.outcomePrices === 'string') {
      try {
        prices = JSON.parse(m.outcomePrices);
      } catch (_) {
        prices = [];
      }
    }

    if (prices.length === 0) continue;

    // Resolve outcome index
    let outcomeIdx = 0;
    if (trade.outcomeIdx !== undefined && trade.outcomeIdx !== null) {
      outcomeIdx = Number(trade.outcomeIdx);
    } else if (trade.outcome && m.outcomes) {
      let outcomes = [];
      if (Array.isArray(m.outcomes)) outcomes = m.outcomes;
      else if (typeof m.outcomes === 'string') {
        try { outcomes = JSON.parse(m.outcomes); } catch (_) {}
      }
      const idx = outcomes.findIndex(
        (o) => String(o).trim().toLowerCase() === String(trade.outcome).trim().toLowerCase()
      );
      if (idx >= 0) outcomeIdx = idx;
    }

    const currentP = parseFloat(prices[outcomeIdx] ?? 0);
    if (isNaN(currentP)) continue;

    const entryPrice = parseFloat(trade.price);
    const safeEntryPrice = (!isNaN(entryPrice) && entryPrice > 0) ? entryPrice : 0.5;

    if (ev.closed || m.closed) {
      const isWin = currentP >= 0.99;
      const pnl = isWin
        ? ((1 - safeEntryPrice) / safeEntryPrice) * 100
        : -100;

      updates.set(trade.id, {
        status: 'Closed',
        result: isWin ? 'Win' : 'Loss',
        currentPrice: currentP,
        pnl: Math.round(pnl * 100) / 100,
        resolvedAt: new Date().toISOString()
      });
    } else {
      // Unrealized PnL
      const unrealizedPnl = ((currentP - safeEntryPrice) / safeEntryPrice) * 100;
      updates.set(trade.id, {
        currentPrice: currentP,
        pnl: Math.round(unrealizedPnl * 100) / 100,
        lastCheckedAt: new Date().toISOString()
      });
    }
  }

  // 4. Re-read disk ledger and apply updates atomically without race conditions
  const currentDiskLedger = readLedger(filePath);
  let hasModifications = false;

  for (const diskTrade of currentDiskLedger) {
    const update = updates.get(diskTrade.id);
    if (!update) continue;

    // RACE CONDITION SHIELD:
    // If trade was cancelled (e.g. by Emergency Kill-Switch) while resolution was in-flight,
    // NEVER overwrite or revert it! Preserve the cancellation state.
    if (diskTrade.status !== 'Open') {
      continue;
    }

    Object.assign(diskTrade, update);
    hasModifications = true;
  }

  if (hasModifications) {
    writeLedger(currentDiskLedger, filePath);
  }

  return currentDiskLedger;
}
