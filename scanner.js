// ═══════════════════════════════════════════════════════════════════
//  scanner.js — Core Scanner Logic v3.0
//  Fixed: pagination bug, time-window coverage, higher opportunity yield
// ═══════════════════════════════════════════════════════════════════

const GAMMA_API = "https://gamma-api.polymarket.com";

// ─── Config ───────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dir = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ───────────────────────────────────────────────────────
export let CONFIG = {
  MIN_PRICE: 0.87,  // 87% — Win probability floor (Smart Scanner threshold)
  MAX_PRICE: 0.99,  // 99% — Win probability ceiling
  MIN_LIQUIDITY: 200, // Minimum $200 liquidity for meaningful markets
  MIN_VOL24HR: 0,   // Include all volume levels
  MAX_SPREAD: 0.10, // Max 10% spread — tighter for high-conviction filter
  TOP_N: 500,       // Return up to 500 opportunities
};

export function updateConfig(newCfg) {
  if (newCfg) CONFIG = { ...CONFIG, ...newCfg };
  return CONFIG;
}

// ─── Category Tagger ──────────────────────────────────────────────
export function getCategory(m) {
  const question = (m.question || "").toLowerCase();
  const slug = (m.slug || "").toLowerCase();
  const event =
    Array.isArray(m.events) && m.events[0]
      ? (m.events[0].title || m.events[0].slug || "").toLowerCase()
      : "";
  const desc = (m.description || "").toLowerCase();

  const text = `${question} ${slug} ${event} ${desc}`;

  // Crypto
  if (
    /bitcoin|btc|ethereum|eth|solana|sol|crypto|binance|coinbase|defi|nft|polygon|matic|avax|doge|shib|coin|token|ledger|sec\b|tether|usdc|kraken|ripple|xrp|cardano|ada|pepe|memecoin/.test(
      text,
    )
  )
    return "Crypto";

  // Sports (expanded)
  if (
    /nba|nfl|nhl|mlb|premier league|champions league|europa league|la liga|serie a|bundesliga|ligue 1|world cup|euro 2024|copa america|soccer|football|basketball|tennis|golf|f1|formula|mma|ufc|boxing|fight|match|tournament|playoff|finals|super bowl|grand slam|wimbledon|liverpool|arsenal|chelsea|manchester|real madrid|barcelona|bayern|psg|juventus|city|united|tottenham|lakers|warriors|celtics|yankees|dodgers|\bvs\b|\bwin\b|score|goal|touchdown|home run|knockout|inter miami|messi|ronaldo|olympics|olympic/.test(
      text,
    )
  )
    return "Sports";

  // Politics (expanded)
  if (
    /election|democrat|republican|biden|trump|harris|kamala|vance|walz|senate|president|governor|vote|congress|supreme court|parliament|politics|white house|debate|poll|primaries|government|mayor|pm\b|prime minister|tory|labour/.test(
      text,
    )
  )
    return "Politics";

  // Weather
  if (
    /temperature|°c|°f|weather|rain|snow|hurricane|tornado|earthquake|storm|flood|wildfire|climate|heatwave|degree/.test(
      text,
    )
  )
    return "Weather";

  // Twitter / Social Media
  if (
    /tweet|twitter|elon|musk|x\.com|social media|post|follower|view|youtube|subscriber|instagram|tiktok/.test(
      text,
    )
  )
    return "Twitter";

  return "Other";
}

// ─── Score (0-100) — Phase 1 Enhanced ────────────────────────────
export function calcScore(o) {
  const vol = o.vol24hr || 0;

  // ── Base signals (unchanged weights) ──────────────────────────
  const range = CONFIG.MAX_PRICE - CONFIG.MIN_PRICE || 0.12;
  const priceScore   = Math.min(((o.price - CONFIG.MIN_PRICE) / range) * 30, 30);
  const liqScore     = Math.min((Math.log10(Math.max(o.liquidity, 1) + 1) / Math.log10(500_000)) * 25, 25);
  const volScore     = vol > 0 ? Math.min((Math.log10(vol + 1) / Math.log10(50_000)) * 20, 20) : 0;
  const spreadScore  = Math.max(0, 1 - o.spread / CONFIG.MAX_SPREAD) * 15;
  const h            = o.hoursLeft;
  const urgencyScore = h <= 1 ? 10 : h <= 6 ? 8 : h <= 24 ? 5 : h <= 72 ? 2 : 0;

  // ── Phase 1: Smart Bonus Signals ──────────────────────────────

  // Momentum Surge: price moved significantly in last 24h (smart money signal)
  const momentum = o.momentum || 0;
  const momentumBonus = momentum > 0.05 ? 10
    : momentum > 0.03 ? 7
    : momentum > 0.01 ? 3
    : 0;

  // Volume Anomaly: unusual trading activity relative to pool size
  const volRatio = o.liquidity > 0 ? vol / o.liquidity : 0;
  const volumeAnomalyBonus = volRatio > 2 ? 8
    : volRatio > 1 ? 5
    : volRatio > 0.5 ? 2
    : 0;

  // Conviction Zone: 87–93% is the "edge sweet spot" — high confidence, not yet maxed
  const convictionBonus = o.price >= 0.87 && o.price <= 0.93 ? 5 : 0;

  // Tight Spread Bonus: < 2% spread = excellent orderbook, low slippage
  const tightSpreadBonus = o.spread < 0.02 ? 5 : o.spread < 0.04 ? 2 : 0;

  // Stale Market Penalty: no volume + far expiry = dead market, not worth entering
  const stalePenalty = (vol === 0 && h > 72) ? -15
    : (vol === 0 && h > 24) ? -8
    : 0;

  return Math.max(0, Math.round(
    priceScore + liqScore + volScore + spreadScore + urgencyScore +
    momentumBonus + volumeAnomalyBonus + convictionBonus + tightSpreadBonus + stalePenalty
  ));
}

// ─── Phase 2: Rule-based Rationale Generator ─────────────────────
// Returns array of { icon, text, strength: 'high'|'medium'|'low' }
export function generateRationale(o) {
  const signals = [];
  const vol     = o.vol24hr || 0;
  const momentum = o.momentum || 0;
  const h        = o.hoursLeft;
  const volRatio = o.liquidity > 0 ? vol / o.liquidity : 0;

  // Momentum
  if (momentum > 0.05)
    signals.push({ icon: '🚀', text: `Price surged +${(momentum*100).toFixed(1)}% in 24h — strong bullish momentum`, strength: 'high' });
  else if (momentum > 0.03)
    signals.push({ icon: '📈', text: `Positive drift +${(momentum*100).toFixed(1)}% — market gaining conviction`, strength: 'medium' });
  else if (momentum < -0.03)
    signals.push({ icon: '⚠️', text: `Price dropped ${(momentum*100).toFixed(1)}% — weakening conviction`, strength: 'low' });

  // Volume Anomaly
  if (volRatio > 2)
    signals.push({ icon: '🐋', text: `Volume spike ${volRatio.toFixed(1)}× vs pool — institutional activity detected`, strength: 'high' });
  else if (volRatio > 1)
    signals.push({ icon: '📊', text: `Above-average volume ${volRatio.toFixed(1)}× — elevated market interest`, strength: 'medium' });
  else if (vol === 0)
    signals.push({ icon: '💤', text: 'No 24h volume — illiquid market, enter with caution', strength: 'low' });

  // Spread Quality
  if (o.spread < 0.02)
    signals.push({ icon: '✅', text: `Tight spread ${(o.spread*100).toFixed(1)}% — excellent orderbook, minimal slippage`, strength: 'high' });
  else if (o.spread < 0.05)
    signals.push({ icon: '🟡', text: `Acceptable spread ${(o.spread*100).toFixed(1)}% — manageable entry cost`, strength: 'medium' });
  else
    signals.push({ icon: '⚠️', text: `Wide spread ${(o.spread*100).toFixed(1)}% — expect notable slippage on entry`, strength: 'low' });

  // Time / Urgency
  if (h <= 1)
    signals.push({ icon: '⏰', text: `Closing in ${Math.round(h*60)} min — final window to enter`, strength: 'high' });
  else if (h <= 6)
    signals.push({ icon: '⚡', text: `${h.toFixed(1)}h remaining — time pressure reduces downside risk`, strength: 'high' });
  else if (h <= 24)
    signals.push({ icon: '🕐', text: `${Math.round(h)}h remaining — short-dated position, quick resolution`, strength: 'medium' });

  // Liquidity Depth
  if (o.liquidity >= 100_000)
    signals.push({ icon: '💎', text: `Deep liquidity $${(o.liquidity/1000).toFixed(0)}K — safe to size up position`, strength: 'high' });
  else if (o.liquidity >= 10_000)
    signals.push({ icon: '💰', text: `Solid liquidity $${(o.liquidity/1000).toFixed(0)}K — adequate for medium size`, strength: 'medium' });
  else
    signals.push({ icon: '⚠️', text: `Thin liquidity $${o.liquidity.toFixed(0)} — small position only`, strength: 'low' });

  // Conviction Zone
  if (o.price >= 0.87 && o.price <= 0.93)
    signals.push({ icon: '🎯', text: `Price ${(o.price*100).toFixed(0)}% is in the conviction edge zone (87–93%) — optimal EV range`, strength: 'high' });
  else if (o.price > 0.96)
    signals.push({ icon: '🔒', text: `Price ${(o.price*100).toFixed(0)}% near certainty — very low ROI upside, minimal risk`, strength: 'medium' });

  // NegRisk Flag
  if (o.negRisk)
    signals.push({ icon: '🛡️', text: 'NegRisk market — losses on one outcome partially offset by gains on others', strength: 'medium' });

  return signals;
}

// ─── Phase 3: Statistical Mispricing Detector ────────────────────
// Compares implied market probability vs historical base rates
// Returns null if no significant mispricing detected

const BASE_RATES = {
  Politics: {
    // Most competitive elections ~ 50/50, incumbents ~60%
    election:    { rate: 0.52, label: 'competitive election' },
    incumbent:   { rate: 0.62, label: 'incumbent advantage' },
    appointment: { rate: 0.55, label: 'political appointment' },
    default:     { rate: 0.52, label: 'political event' },
  },
  Crypto: {
    price_above: { rate: 0.50, label: 'crypto price target' },  // pure coin-flip directionally
    default:     { rate: 0.50, label: 'crypto event' },
  },
  Sports: {
    favorite:    { rate: 0.60, label: 'sports favorite' },
    default:     { rate: 0.55, label: 'sports outcome' },
  },
  Weather: {
    default:     { rate: 0.45, label: 'weather event' },
  },
  Twitter: {
    default:     { rate: 0.50, label: 'social media event' },
  },
  Other: {
    default:     { rate: 0.50, label: 'event' },
  },
};

export function detectMispricing(o) {
  const text  = (o.question || '').toLowerCase();
  const price = o.price;
  const cat   = o.category || 'Other';
  const catRates = BASE_RATES[cat] || BASE_RATES.Other;

  // Pick sub-type based on question keywords
  let entry;
  if (cat === 'Politics') {
    if (/incumbent|re-elect|re-run/.test(text))           entry = catRates.incumbent;
    else if (/appoint|nominate|confirm/.test(text))       entry = catRates.appointment;
    else                                                   entry = catRates.election;
  } else if (cat === 'Crypto') {
    if (/above|over|exceed|reach|hit|\$|k\b/.test(text)) entry = catRates.price_above;
    else                                                   entry = catRates.default;
  } else if (cat === 'Sports') {
    if (/favorite|champion|title|defend/.test(text))      entry = catRates.favorite;
    else                                                   entry = catRates.default;
  } else {
    entry = catRates.default;
  }

  const baseRate = entry.rate;
  const gap      = price - baseRate;
  const absGap   = Math.abs(gap);

  // Only flag if gap is meaningful (>15 percentage points)
  if (absGap < 0.15) return null;

  const confidence = absGap > 0.30 ? 'HIGH' : absGap > 0.20 ? 'MEDIUM' : 'LOW';
  const signal     = gap > 0 ? 'OVERBOUGHT' : 'UNDERVALUED';

  return {
    detected:      true,
    baseRate:      baseRate,
    baseRateLabel: entry.label,
    marketPrice:   price,
    gap:           parseFloat(gap.toFixed(3)),
    signal,
    confidence,
    suggestion: gap > 0
      ? `Market at ${(price*100).toFixed(0)}% vs ~${(baseRate*100).toFixed(0)}% base rate — may be OVERBOUGHT, consider NO`
      : `Market at ${(price*100).toFixed(0)}% vs ~${(baseRate*100).toFixed(0)}% base rate — may be UNDERVALUED, YES has edge`,
  };
}

// ─── Fetch with Timeout ───────────────────────────────────────────
async function fetchWithTimeout(url, ms = 10_000) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(tid);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } catch (e) {
    clearTimeout(tid);
    throw e;
  }
}

// ─── Fetch Markets ────────────────────────────────────────────────
export async function fetchMarkets(onProgress) {
  const PAGE = 100;
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const end6h = new Date(now + 6 * 3_600_000).toISOString();
  const end24h = new Date(now + 24 * 3_600_000).toISOString();
  const end7d = new Date(now + 168 * 3_600_000).toISOString();

  let totalFetched = 0;

  async function paginateTier(queryUrl, label, maxPages) {
    const all = [];
    let offset = 0;
    let page = 0;
    let hasMore = true;

    console.log(`[Scanner] Fetching ${label} (max ${maxPages * PAGE} markets)...`);

    while (hasMore && page < maxPages && offset <= 2000) {
      const url = `${queryUrl}&limit=${PAGE}&offset=${offset}`;
      
      try {
        const pg = await fetchWithTimeout(url, 12_000);
        if (Array.isArray(pg)) {
          all.push(...pg);
          totalFetched += pg.length;
          if (pg.length < PAGE) {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      } catch (err) {
        console.warn(`[Scanner] Fetch failed for ${label} offset ${offset}:`, err.message);
        hasMore = false;
      }

      page++;
      offset += PAGE;

      if (onProgress) onProgress(totalFetched);
      await new Promise(resolve => setTimeout(resolve, 120));
    }

    console.log(`[Scanner] ${label}: ${all.length} raw markets fetched`);
    return all;
  }

  // Tier 1: Highest 24h volume active markets
  const tier1 = await paginateTier(
    `${GAMMA_API}/markets?closed=false&active=true&order=volume24hr&ascending=false`,
    "Top 24h Volume",
    6
  );

  // Tier 2: Ending soonest markets
  const tier2 = await paginateTier(
    `${GAMMA_API}/markets?closed=false&active=true&end_date_min=${nowIso}&end_date_max=${end7d}&order=volume24hr&ascending=false`,
    "Ending This Week",
    6
  );

  // Tier 3: Highest liquidity markets
  const tier3 = await paginateTier(
    `${GAMMA_API}/markets?closed=false&active=true&order=liquidityNum&ascending=false`,
    "Top Liquidity",
    4
  );

  // Deduplicate by conditionId (primary) or id/question (fallback)
  const seen = new Set();
  const merged = [];
  for (const m of [...tier1, ...tier2, ...tier3]) {
    const key = m.conditionId || m.id || m.question;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(m);
  }

  // Fallback to sample_markets.json if network failed completely
  if (merged.length === 0) {
    try {
      const samplePath = path.join(__dir, "sample_markets.json");
      if (fs.existsSync(samplePath)) {
        console.log("[Scanner] Live fetch returned 0 markets, falling back to cached sample_markets.json...");
        const sample = JSON.parse(fs.readFileSync(samplePath, "utf-8"));
        if (Array.isArray(sample) && sample.length > 0) {
          return sample;
        }
      }
    } catch (e) {
      console.warn("[Scanner] Fallback load failed:", e.message);
    }
  }

  console.log(
    `[Scanner] Merged: ${merged.length} unique markets from ${totalFetched} total records`,
  );
  return merged;
}

// ─── Filter + Score ───────────────────────────────────────────────
export function filterAndScore(markets, maxHours = 0) {
  const now = new Date();
  const results = [];

  for (const m of markets) {
    if (m.closed || !m.active) continue;

    // ─── Time Logic (Trading End vs Resolution) ───
    let marketEnd = m.endDateIso || m.endDate || "";
    let eventStart =
      Array.isArray(m.events) && m.events[0] ? m.events[0].startDate : null;
    let eventEnd =
      Array.isArray(m.events) && m.events[0] ? m.events[0].endDate : null;

    const cat = getCategory(m);

    // Trading End: When does trading actually stop?
    // Rule: For Sports, trading usually halts when the game STARTS.
    let tradingEndRaw = marketEnd;
    if (cat === "Sports" && eventStart) {
      tradingEndRaw = eventStart;
    }

    // Resolution Time: When is the money settled?
    let resolutionRaw = eventEnd || marketEnd;

    let tradingEndDate = new Date(tradingEndRaw);
    let resolutionDate = new Date(resolutionRaw);

    if (isNaN(tradingEndDate.getTime())) {
      tradingEndDate = new Date(now.getTime() + 7 * 86400000);
    }
    if (isNaN(resolutionDate.getTime())) {
      resolutionDate = tradingEndDate;
    }

    let hoursLeft = (tradingEndDate - now) / 3_600_000;
    if (hoursLeft < -0.5) {
      if (m.active && !m.closed) {
        // If active market has legacy timestamp, adjust forward for display
        hoursLeft = 24;
        tradingEndDate = new Date(now.getTime() + 24 * 3_600_000);
        resolutionDate = tradingEndDate;
      } else {
        continue; // Hide markets that ended more than 30 mins ago
      }
    }
    if (maxHours > 0 && hoursLeft > maxHours) continue;

    const spread = parseFloat(m.spread ?? 1);
    const liq = parseFloat(m.liquidityNum ?? m.liquidity ?? 0);
    const vol24 = parseFloat(m.volume24hr ?? 0);

    // Basic safety filters
    if (spread > CONFIG.MAX_SPREAD) continue;
    if (liq < CONFIG.MIN_LIQUIDITY) continue;

    let prices, outcomes, clobTokenIds;
    try {
      prices =
        typeof m.outcomePrices === "string"
          ? JSON.parse(m.outcomePrices)
          : m.outcomePrices || [];
      outcomes =
        typeof m.outcomes === "string"
          ? JSON.parse(m.outcomes)
          : m.outcomes || [];
      clobTokenIds =
        typeof m.clobTokenIds === "string"
          ? JSON.parse(m.clobTokenIds)
          : m.clobTokenIds || [];
      prices = prices.map(Number);
    } catch (e) {
      continue;
    }

    if (!prices.length || prices.length !== outcomes.length) continue;

    for (let idx = 0; idx < prices.length; idx++) {
      const price = prices[idx];
      if (price < CONFIG.MIN_PRICE || price > CONFIG.MAX_PRICE) continue;

      const eventSlug =
        Array.isArray(m.events) && m.events[0]?.slug
          ? m.events[0].slug
          : m.slug || "";

      const opp = {
        question: m.question,
        outcome: outcomes[idx] ?? `Outcome ${idx}`,
        price,
        spread,
        liquidity: liq,
        vol24hr: vol24,
        tradingEnd: tradingEndDate,
        resolution: resolutionDate,
        hoursLeft,
        negRisk: m.negRisk ?? false,
        momentum: m.oneDayPriceChange ?? null,
        url: `https://polymarket.com/event/${eventSlug}`,
        category: cat,
        slug: eventSlug,
        outcomeIdx: idx,
        tokenID: clobTokenIds[idx] || null,
        context:
          (Array.isArray(m.events) &&
            m.events[0]?.eventMetadata?.context_description) ||
          "",
      };
      opp.score      = calcScore(opp);
      opp.rationale  = generateRationale(opp);
      opp.mispricing = detectMispricing(opp);
      results.push(opp);
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, CONFIG.TOP_N);
}

// ─── Time Windows (matches 9 UI buttons) ─────────────────────────
export const TIME_WINDOWS = [
  { label: "10 mins", hours: 10 / 60 },
  { label: "30 mins", hours: 30 / 60 },
  { label: "1 hr", hours: 1 },
  { label: "5 hr", hours: 5 },
  { label: "12 hr", hours: 12 },
  { label: "24 hr", hours: 24 },
  { label: "2 day", hours: 48 },
  { label: "3 day", hours: 72 },
  { label: "7 day", hours: 168 },
];

// ─── Run Full Scan ────────────────────────────────────────────────
export async function runScan(onProgress) {
  const t0 = Date.now();
  const markets = await fetchMarkets(onProgress);

  // Score ALL markets first (no time filter) — UI filters client-side
  const allOpps = filterAndScore(markets, 0);

  // Count per time window for stats
  const stats = TIME_WINDOWS.map((w) => ({
    label: w.label,
    hours: w.hours,
    count: allOpps.filter((o) => o.hoursLeft <= w.hours).length,
  }));

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `[Scanner] Scan complete: ${allOpps.length} opportunities from ${markets.length} markets in ${elapsed}s`,
  );

  return {
    scannedAt: new Date().toISOString(),
    totalMarkets: markets.length,
    rawMarkets: markets,
    stats,
    opportunities: allOpps.map((o) => ({
      ...o,
      tradingEnd: o.tradingEnd.toISOString(),
      resolution: o.resolution.toISOString(),
    })),
  };
}

// ─── Midpoint Arbitrage Detection ──────────────────────────────────
export function scanMidpointArbitrage(markets) {
  const results = [];
  for (const m of markets) {
    if (m.closed || !m.active) continue;
    let prices, outcomes, bestBids, bestAsks;
    try {
      prices = typeof m.outcomePrices === "string" ? JSON.parse(m.outcomePrices) : m.outcomePrices || [];
      outcomes = typeof m.outcomes === "string" ? JSON.parse(m.outcomes) : m.outcomes || [];
      bestBids = typeof m.bestBids === "string" ? JSON.parse(m.bestBids) : m.bestBids || typeof m.bestBid === "string" ? JSON.parse(m.bestBid) : m.bestBid || [];
      bestAsks = typeof m.bestAsks === "string" ? JSON.parse(m.bestAsks) : m.bestAsks || typeof m.bestAsk === "string" ? JSON.parse(m.bestAsk) : m.bestAsk || [];
    } catch(e) { continue; }
    
    if (!prices.length || prices.length !== bestBids.length || prices.length !== bestAsks.length) continue;
    
    for (let i = 0; i < prices.length; i++) {
      const price = Number(prices[i]);
      const bid = Number(bestBids[i]);
      const ask = Number(bestAsks[i]);
      
      if (bid > 0 && ask > 0) {
        const midpoint = (bid + ask) / 2;
        const diff = Math.abs(midpoint - price);
        
        // "significantly different" -> say > 0.05
        if (diff >= 0.05) {
          // Kelly estimation for midpoint reversion
          const expectedProb = midpoint;
          const b = (1.0 / price) - 1;
          const q = 1 - expectedProb;
          let kelly = b > 0 ? (b * expectedProb - q) / b : 0;
          kelly = Math.max(0, Math.min(1, kelly));

          // Confidence
          let confidence = 50 + (diff * 200);
          confidence = Math.min(100, Math.max(0, Math.round(confidence)));

          results.push({
            type: 'midpoint_arbitrage',
            question: m.question,
            outcome: outcomes[i] ?? `Outcome ${i}`,
            price: price,
            bestBid: bid,
            bestAsk: ask,
            midpoint: parseFloat(midpoint.toFixed(3)),
            diff: parseFloat(diff.toFixed(3)),
            kellyPositionPercent: parseFloat((kelly * 100).toFixed(2)),
            confidence: confidence,
            url: `https://polymarket.com/event/${m.slug}`,
            detectedAt: new Date().toISOString()
          });
        }
      }
    }
  }
  return results.sort((a,b) => b.diff - a.diff);
}
