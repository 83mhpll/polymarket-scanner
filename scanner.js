// ═══════════════════════════════════════════════════════════════════
//  scanner.js — Core Scanner Logic v3.0
//  Fixed: pagination bug, time-window coverage, higher opportunity yield
// ═══════════════════════════════════════════════════════════════════

const GAMMA_API = "https://gamma-api.polymarket.com";

// ─── Config ───────────────────────────────────────────────────────
export let CONFIG = {
  MIN_PRICE: 0.87, // 87% — Win probability floor
  MAX_PRICE: 0.95, // 95% — Win probability ceiling
  MIN_LIQUIDITY: 10, // Very low threshold — filter by score instead
  MIN_VOL24HR: 0, // Include all volume levels
  MAX_SPREAD: 0.35, // Wide tolerance — high-price markets have narrow real spread
  TOP_N: 500, // Return up to 500 opportunities
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

// ─── Score (0-100) ────────────────────────────────────────────────
export function calcScore(o) {
  // Price score: reward being close to MAX_PRICE (highest certainty in range)
  const range = CONFIG.MAX_PRICE - CONFIG.MIN_PRICE || 0.08;
  const priceScore = Math.min(((o.price - CONFIG.MIN_PRICE) / range) * 30, 30);

  // Liquidity score (log scale)
  const liqScore = Math.min(
    (Math.log10(Math.max(o.liquidity, 1) + 1) / Math.log10(500_000)) * 25,
    25,
  );

  // Volume score
  const vol = o.vol24hr || 0;
  const volScore =
    vol > 0 ? Math.min((Math.log10(vol + 1) / Math.log10(50_000)) * 20, 20) : 0;

  // Spread score: tighter spread = higher score
  const spreadScore = Math.max(0, 1 - o.spread / CONFIG.MAX_SPREAD) * 15;

  // Urgency bonus: markets ending within 24h get +10
  const h = o.hoursLeft;
  const urgencyScore = h <= 1 ? 10 : h <= 6 ? 8 : h <= 24 ? 5 : h <= 72 ? 2 : 0;

  return Math.round(
    priceScore + liqScore + volScore + spreadScore + urgencyScore,
  );
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
// Strategy: fetch THREE date windows in parallel to maximise coverage
//   • Tier 1: Urgent (Ending within 6h) - Highest priority, fast fetch
//   • Tier 2: Daily  (Ending within 24h) - Main opportunity zone
//   • Tier 3: Weekly (Ending within 7d) - Medium-term breadth
// Then deduplicate by conditionId and return merged list.
export async function fetchMarkets(onProgress) {
  const PAGE = 500;
  const MAX_PAGES = 10; // Up to 5,000 markets per tier should be plenty

  const now = Date.now();
  const end6h = new Date(now + 6 * 3_600_000).toISOString();
  const end24h = new Date(now + 24 * 3_600_000).toISOString();
  const end7d = new Date(now + 168 * 3_600_000).toISOString();

  let totalFetched = 0;

  async function paginateTier(endDateParam, label) {
    const all = [];
    let offset = 0;
    let page = 0;
    let hasMore = true;

    console.log(
      `[Scanner] Fetching ${label} tier (max ${MAX_PAGES * PAGE} markets)...`,
    );

    while (hasMore && page < MAX_PAGES) {
      // Fetch in small parallel batches to stay within rate limits but move fast
      const BATCH = 2;
      const batchN = Math.min(BATCH, MAX_PAGES - page);
      const fetches = [];

      for (let i = 0; i < batchN; i++) {
        // We sort by 'volume24hr' to get the most liquid markets first in each tier
        const url = `${GAMMA_API}/markets?closed=false&active=true&limit=${PAGE}&offset=${offset + i * PAGE}&end_date_max=${endDateParam}&order=volume24hr&ascending=false`;
        fetches.push(
          fetchWithTimeout(url, 15_000).catch((err) => {
            console.warn(
              `[Scanner] Fetch failed for ${label} offset ${offset + i * PAGE}:`,
              err.message,
            );
            return [];
          }),
        );
      }

      const pages = await Promise.all(fetches);
      let gotShort = false;

      for (const pg of pages) {
        if (!Array.isArray(pg)) continue;
        all.push(...pg);
        totalFetched += pg.length;
        if (pg.length < PAGE) {
          hasMore = false;
          gotShort = true;
          break;
        }
      }

      page += batchN;
      offset += batchN * PAGE;

      if (onProgress) onProgress(totalFetched);
      if (gotShort) break;
    }

    console.log(`[Scanner] ${label}: ${all.length} raw markets fetched`);
    return all;
  }

  // Fetch tiers in parallel
  const [tier1, tier2, tier3] = await Promise.all([
    paginateTier(end6h, "Urgent (6h)"),
    paginateTier(end24h, "Daily (24h)"),
    paginateTier(end7d, "Weekly (7d)"),
  ]);

  // Deduplicate by conditionId (primary) or id/question (fallback)
  const seen = new Set();
  const merged = [];
  for (const m of [...tier1, ...tier2, ...tier3]) {
    const key = m.conditionId || m.id || m.question;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(m);
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

    const tradingEndDate = new Date(tradingEndRaw);
    const resolutionDate = new Date(resolutionRaw);

    if (isNaN(tradingEndDate.getTime())) continue;

    const hoursLeft = (tradingEndDate - now) / 3_600_000;
    if (hoursLeft < -0.5) continue; // Hide markets that ended more than 30 mins ago
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
      opp.score = calcScore(opp);
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
    stats,
    opportunities: allOpps.map((o) => ({
      ...o,
      tradingEnd: o.tradingEnd.toISOString(),
      resolution: o.resolution.toISOString(),
    })),
  };
}
