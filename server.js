// ══════════════════════════════════════════════════════════════════════
//  server.js — Polymarket Pro Scanner  |  Production-Ready Server
//  รัน: npm start  แล้วเปิด http://localhost:3001
// ══════════════════════════════════════════════════════════════════════

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { createRequire } from "module";

import { runScan, CONFIG, updateConfig, TIME_WINDOWS } from "./scanner.js";
import { placeTrade } from "./trader.js";

// ─── Load .env ──────────────────────────────────────────────────────────
const require = createRequire(import.meta.url);
try {
  const dotenv = require("dotenv");
  dotenv.config();
} catch (e) {}

const PORT = parseInt(process.env.PORT || "3001");
const __dir = path.dirname(fileURLToPath(import.meta.url));

// ─── In-Memory Cache ────────────────────────────────────────────────────
let cache = null,
  cacheTime = 0;
const CACHE_TTL = 120_000; // 2 min cache (matches scan interval)

// ─── Alert State ────────────────────────────────────────────────────────
// เก็บ opportunities ที่ score สูงมาก เพื่อส่ง alert ไปหน้าเว็บ
let lastAlerts = [];

// ─── File DB helpers ────────────────────────────────────────────────────
function readJSON(file, fallback = []) {
  const fp = path.join(__dir, file);
  if (!fs.existsSync(fp)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(fp, "utf-8"));
  } catch (e) {
    return fallback;
  }
}
function writeJSON(file, data) {
  fs.writeFileSync(path.join(__dir, file), JSON.stringify(data, null, 2));
}

// ─── CORS / response helpers ─────────────────────────────────────────────
function withHeaders(res, type = "application/json") {
  res.setHeader("Content-Type", type);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
function ok(res, data) {
  withHeaders(res);
  res.end(JSON.stringify(data));
}
function err(res, msg, code = 400) {
  withHeaders(res);
  res.writeHead(code);
  res.end(JSON.stringify({ success: false, error: msg }));
}
async function readBody(req) {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => {
      b += c.toString();
    });
    req.on("end", () => resolve(b));
  });
}

let isScanning = false;
async function backgroundScan() {
  if (isScanning) return;
  isScanning = true;
  console.log("[Scanner] Starting background scan...");
  try {
    let fetched = 0;
    const result = await runScan((n) => {
      // Log progress every 1000 markets fetched
      if (n - fetched >= 1000) {
        fetched = n;
        console.log(`[Scanner] Fetched ${n} markets so far...`);
      }
    });
    const highConv = (result.opportunities || []).filter((o) => o.score >= 85);
    lastAlerts = highConv.slice(0, 20); // Store full objects for rich alerts
    cache = result;
    cacheTime = Date.now();
    console.log(
      `[Scanner] Done — ${result.opportunities.length} opps from ${result.totalMarkets} markets`,
    );
  } catch (e) {
    console.error("[Background Scan Error]", e.message);
  }
  isScanning = false;
}

// Start background loop — scan every 2 minutes
backgroundScan();
setInterval(backgroundScan, 120_000);

// ─── Main Request Handler ────────────────────────────────────────────────
async function handler(req, res) {
  const url = req.url.split("?")[0];

  // CORS preflight
  if (req.method === "OPTIONS") {
    withHeaders(res);
    res.end();
    return;
  }

  // ══ GET /api/scan ══════════════════════════════════════════════════════
  if (url === "/api/scan") {
    try {
      const force = req.url.includes("force=true");
      if (force) {
        // Kick off fresh scan (fire-and-forget), don't wait
        isScanning = false;
        backgroundScan();
      }
      // Always return current cache immediately
      if (cache) {
        ok(res, { cached: true, scanning: isScanning, ...cache });
        return;
      } else {
        // First load: return skeleton so UI shows progress bar
        ok(res, {
          cached: false,
          scanning: isScanning,
          scannedAt: new Date().toISOString(),
          totalMarkets: 0,
          stats: TIME_WINDOWS.map((w) => ({
            label: w.label,
            hours: w.hours,
            count: 0,
          })),
          opportunities: [],
          loading: true,
        });
        return;
      }
    } catch (e) {
      err(res, e.message, 500);
      return;
    }
  }

  // ══ GET /api/alerts — High-conviction opportunities (for push notifications) ══
  if (url === "/api/alerts") {
    ok(res, { alerts: lastAlerts, timestamp: Date.now() });
    return;
  }

  // ══ GET|POST /api/config ════════════════════════════════════════════════
  if (url === "/api/config") {
    if (req.method === "GET") {
      ok(res, CONFIG);
      return;
    }
    if (req.method === "POST") {
      const b = await readBody(req);
      try {
        const newCfg = JSON.parse(b);
        updateConfig(newCfg);
        cache = null;
        ok(res, CONFIG);
      } catch (e) {
        err(res, "Invalid JSON");
      }
      return;
    }
  }

  // ══ WATCHLIST ══════════════════════════════════════════════════════════
  if (url === "/api/watchlist") {
    if (req.method === "GET") {
      ok(res, readJSON("watchlist.json", []));
      return;
    }
    if (req.method === "POST") {
      const b = await readBody(req);
      try {
        const item = JSON.parse(b);
        const wl = readJSON("watchlist.json", []);
        // ไม่เพิ่มซ้ำ
        if (
          !wl.find((x) => x.slug === item.slug && x.outcome === item.outcome)
        ) {
          item.savedAt = new Date().toISOString();
          wl.unshift(item);
          writeJSON("watchlist.json", wl);
        }
        ok(res, { success: true });
      } catch (e) {
        err(res, "Invalid payload");
      }
      return;
    }
    if (req.method === "DELETE") {
      const b = await readBody(req);
      try {
        const { slug, outcome } = JSON.parse(b);
        let wl = readJSON("watchlist.json", []);
        wl = wl.filter((x) => !(x.slug === slug && x.outcome === outcome));
        writeJSON("watchlist.json", wl);
        ok(res, { success: true });
      } catch (e) {
        err(res, "Invalid payload");
      }
      return;
    }
  }

  // ══ PAPER TRADE (Backtest log) ═════════════════════════════════════════
  if (url === "/api/backtest/log") {
    ok(res, readJSON("backtest.json", []));
    return;
  }

  if (url === "/api/backtest/add" && req.method === "POST") {
    const b = await readBody(req);
    try {
      const trade = JSON.parse(b);
      trade.id = Date.now().toString();
      trade.status = "Open";
      trade.timestamp = new Date().toISOString();
      const db = readJSON("backtest.json", []);
      db.unshift(trade);
      writeJSON("backtest.json", db);
      ok(res, { success: true });
    } catch (e) {
      err(res, "Invalid payload");
    }
    return;
  }

  // ══ PAPER TRADE: Auto-resolve via Gamma API ════════════════════════════
  if (url === "/api/backtest/check") {
    try {
      const db = readJSON("backtest.json", []);
      let updated = false;
      for (const trade of db) {
        if (trade.status !== "Open") continue;
        try {
          const r = await fetch(
            `https://gamma-api.polymarket.com/events?slug=${trade.slug}`,
          );
          const data = await r.json();
          const ev = data?.[0];
          if (ev && ev.markets && ev.markets.length > 0) {
            // Find the correct market in the event. Since we don't have conditionId stored, we'll try to match by question or fallback to first.
            const m =
              ev.markets.find((m) => m.question === trade.question) ||
              ev.markets[0];
            const p = m.outcomePrices;
            if (p) {
              const prices = JSON.parse(p);
              const currentP = parseFloat(prices[trade.outcomeIdx] ?? 0);

              if (ev.closed || m.closed) {
                trade.status = "Closed";
                trade.result = currentP >= 0.99 ? "Win" : "Loss";
                trade.pnl =
                  currentP >= 0.99
                    ? ((1 - trade.price) / trade.price) * 100
                    : -100;
              } else {
                // Calculate Unrealized PnL
                trade.currentPrice = currentP;
                trade.pnl = ((currentP - trade.price) / trade.price) * 100;
              }
              updated = true;
            }
          }
        } catch (e) {
          /* skip if Gamma fails for one trade */
        }
      }
      if (updated) writeJSON("backtest.json", db);
      ok(res, db);
    } catch (e) {
      err(res, e.message, 500);
    }
    return;
  }

  // ══ DELETE a paper trade ════════════════════════════════════════════════
  if (url === "/api/backtest/delete" && req.method === "DELETE") {
    const b = await readBody(req);
    try {
      const { id } = JSON.parse(b);
      let db = readJSON("backtest.json", []);
      db = db.filter((t) => t.id !== id);
      writeJSON("backtest.json", db);
      ok(res, { success: true });
    } catch (e) {
      err(res, "Invalid payload");
    }
    return;
  }

  // ══ BACKTEST: Run Python PolyTest backtester ════════════════════════════
  if (url === "/api/backtest/run" && req.method === "POST") {
    const b = await readBody(req);
    try {
      const { slug, capital } = JSON.parse(b);
      const scriptPath = path.join(__dir, "run_backtest.py");
      const proc = spawn("python3", [
        scriptPath,
        "--slug",
        slug || "",
        "--capital",
        String(capital || 1000),
      ]);
      let out = "",
        errOut = "";
      proc.stdout.on("data", (d) => {
        out += d.toString();
      });
      proc.stderr.on("data", (d) => {
        errOut += d.toString();
      });
      proc.on("close", () => {
        try {
          ok(res, JSON.parse(out.trim()));
        } catch (e) {
          ok(res, {
            status: "error",
            message: errOut.slice(0, 300) || "Script error",
          });
        }
      });
    } catch (e) {
      err(res, e.message);
    }
    return;
  }

  // ══ LIVE TRADE: Polymarket Builder API ═════════════════════════════════
  if (url === "/api/trade" && req.method === "POST") {
    const b = await readBody(req);
    try {
      const tradeReq = JSON.parse(b);
      if (!tradeReq.tokenID) throw new Error("Missing tokenID");
      const response = await placeTrade(tradeReq, CONFIG);
      ok(res, { success: true, data: response });
    } catch (e) {
      err(res, e.message);
    }
    return;
  }

  // ══ Static files ═══════════════════════════════════════════════════════
  if (url === "/" || url === "/index.html") {
    const fp = path.join(__dir, "public", "index.html");
    try {
      withHeaders(res, "text/html; charset=utf-8");
      res.end(fs.readFileSync(fp, "utf-8"));
    } catch {
      err(res, "Not found", 404);
    }
    return;
  }

  err(res, "Not found", 404);
}

// ─── Start Server ────────────────────────────────────────────────────────
const server = http.createServer(handler);
server.listen(PORT, () => {
  console.log(
    "\n╔════════════════════════════════════════════════════════════╗",
  );
  console.log("║   🎯 POLYMARKET PRO SCANNER  — Production Server          ║");
  console.log(
    `║   http://localhost:${PORT}                                   ║`,
  );
  console.log("║                                                            ║");
  console.log("║   📡 Scanner  | 📝 Paper Trade  | 🔬 Backtest  | ⭐ Watch  ║");
  console.log(
    "╚════════════════════════════════════════════════════════════╝\n",
  );
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────
process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  server.close(() => process.exit(0));
});
