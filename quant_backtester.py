"""
==========================================================
 Polymarket Quantitative Backtester v2 — PolyTest Edition
 ใช้ข้อมูลจริงจาก PolyTest API (pt_live key)
 กลยุทธ์: Mean Reversion บน BTC Up/Down 5-Minute Markets
==========================================================
"""

import pandas as pd
import numpy as np
import requests
import json
import logging
from dataclasses import dataclass, field
from typing import List, Tuple, Optional
from datetime import datetime

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

POLYTEST_API_KEY = "pt_live_6s4c243a2w5h5i4549220i5u5h6z6z3v"
BASE_URL = "https://api.polytest.io/api/v1"
HEADERS = {"X-API-Key": POLYTEST_API_KEY}


# ==========================================
# 1. DATA SCHEMA (จาก PolyTest API จริง)
# ==========================================
@dataclass
class PriceSnapshot:
    """ข้อมูล Tick-level จาก PolyTest API"""
    timestamp: str      # ISO time
    spot_price: float   # ราคา BTC ณ ขณะนั้น
    price_up: float     # ความน่าจะเป็น YES/UP (0.0 - 1.0)
    price_down: float   # ความน่าจะเป็น NO/DOWN (0.0 - 1.0)

@dataclass
class MarketResult:
    """ข้อมูลสรุปของตลาดที่ปิดแล้ว"""
    market_id: str
    slug: str
    coin: str
    market_type: str
    start_time: str
    end_time: str
    price_start: float
    price_end: Optional[float]
    winner: Optional[str]   # 'Up' หรือ 'Down'
    final_volume: Optional[float]

@dataclass
class Trade:
    """บันทึกการเทรดแต่ละครั้ง"""
    market_id: str
    side: str           # 'UP' หรือ 'DOWN'
    entry_price: float  # ราคาที่ซื้อ (0.0-1.0)
    entry_time: str
    size_usd: float     # จำนวนเงินที่ลงทุน
    outcome: str = ""   # 'WIN' หรือ 'LOSS'
    pnl_usd: float = 0.0
    exit_price: float = 0.0


# ==========================================
# 2. POLYTEST DATA FEED (API ที่ถูกต้อง)
# ==========================================
class PolyTestFeed:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update(HEADERS)

    def get_resolved_markets(self, market_type: str = "5m", limit: int = 50) -> List[MarketResult]:
        """ดึงตลาดที่ปิดแล้ว (มี winner) มาใช้ Backtest"""
        url = f"{BASE_URL}/markets?market_type={market_type}&limit={limit}"
        res = self.session.get(url)
        data = res.json()
        
        markets = []
        for m in data.get("markets", []):
            if m.get("winner"):  # กรองเฉพาะตลาดที่ resolve แล้ว
                markets.append(MarketResult(
                    market_id=m["market_id"],
                    slug=m["slug"],
                    coin=m.get("coin", "btc"),
                    market_type=m["market_type"],
                    start_time=m["start_time"],
                    end_time=m["end_time"],
                    price_start=m.get("price_start", 0),
                    price_end=m.get("price_end"),
                    winner=m["winner"],
                    final_volume=m.get("final_volume", 0)
                ))
        logging.info(f"Found {len(markets)} resolved {market_type} markets")
        return markets

    def get_snapshots(self, market_id: str, limit: int = 500) -> List[PriceSnapshot]:
        """ดึง Price Snapshots ย้อนหลัง (Millisecond Resolution)"""
        url = f"{BASE_URL}/markets/{market_id}/snapshots?limit={limit}"
        res = self.session.get(url)
        data = res.json()
        
        snaps = []
        for s in data.get("snapshots", []):
            snaps.append(PriceSnapshot(
                timestamp=s["time"],
                spot_price=s.get("spot_price", 0),
                price_up=float(s["price_up"] or 0.5),
                price_down=float(s["price_down"] or 0.5)
            ))
        return snaps


# ==========================================
# 3. BACKTEST ENGINE + KELLY CRITERION
# ==========================================
class BacktestEngine:
    def __init__(self, initial_capital: float):
        self.initial_capital = initial_capital
        self.capital = initial_capital
        self.trades: List[Trade] = []

    def calculate_kelly(self, win_prob: float, win_payout: float = 1.0, fraction: float = 0.25) -> float:
        """
        Kelly Criterion (Half-Kelly) สำหรับ Position Sizing
        f* = (p * b - q) / b  โดย b = payout, p = win_prob, q = 1-p
        fraction = 0.25 = Quarter Kelly (อนุรักษ์นิยม)
        """
        q = 1.0 - win_prob
        b = win_payout
        kelly = (b * win_prob - q) / b
        return max(0.0, kelly * fraction)

    def run_market(self, market: MarketResult, snapshots: List[PriceSnapshot]):
        """จำลองการเทรดในตลาดเดียว"""
        if len(snapshots) < 10:
            return

        prices_up = [s.price_up for s in snapshots]
        
        # คำนวณ Moving Average (Lookback 10 ticks)
        lookback = 10
        for i in range(lookback, len(snapshots)):
            window = prices_up[i-lookback:i]
            mean_prob = np.mean(window)
            std_prob = np.std(window)
            
            if std_prob < 0.001:  # ราคาไม่ขยับ ข้ามไป
                continue

            current_prob = prices_up[i]
            z_score = (current_prob - mean_prob) / std_prob

            # --- ENTRY SIGNAL: Mean Reversion ---
            # ถ้า prob_up ตกต่ำผิดปกติ (z < -1.0) -> BUY UP (เดิมพันว่าจะดีดขึ้น)
            if z_score < -1.0 and current_prob < 0.50 and self.capital > 100:
                kelly_pct = self.calculate_kelly(win_prob=0.52, win_payout=1.0)
                bet_usd = self.capital * kelly_pct
                bet_usd = max(20.0, min(bet_usd, self.capital * 0.10))  # Min $20, Max 10% ของพอร์ต

                # จำลองซื้อ UP shares ที่ราคา current_prob
                self.capital -= bet_usd
                
                # คำนวณผลลัพธ์ตอนปิดตลาด
                is_win = market.winner == "Up"
                exit_price = 1.0 if is_win else 0.0
                shares = bet_usd / current_prob  # จำนวน shares ที่ได้
                pnl = (exit_price - current_prob) * shares if is_win else -bet_usd
                self.capital += (bet_usd + pnl)

                t = Trade(
                    market_id=market.market_id,
                    side="UP",
                    entry_price=current_prob,
                    entry_time=snapshots[i].timestamp,
                    size_usd=bet_usd,
                    outcome="WIN" if is_win else "LOSS",
                    pnl_usd=pnl,
                    exit_price=exit_price
                )
                self.trades.append(t)
                break  # 1 trade per market


# ==========================================
# 4. PERFORMANCE METRICS (Sharpe, Drawdown)
# ==========================================
def calculate_metrics(engine: BacktestEngine):
    trades = engine.trades
    if not trades:
        return None

    df = pd.DataFrame([t.__dict__ for t in trades])
    wins = df[df['outcome'] == 'WIN']
    losses = df[df['outcome'] == 'LOSS']

    total_trades = len(df)
    win_rate = len(wins) / total_trades * 100
    total_pnl = df['pnl_usd'].sum()
    roi = (engine.capital - engine.initial_capital) / engine.initial_capital * 100
    avg_win = wins['pnl_usd'].mean() if len(wins) > 0 else 0
    avg_loss = losses['pnl_usd'].mean() if len(losses) > 0 else 0
    profit_factor = abs(wins['pnl_usd'].sum() / losses['pnl_usd'].sum()) if len(losses) > 0 and losses['pnl_usd'].sum() != 0 else 999

    # Max Drawdown
    cumulative = df['pnl_usd'].cumsum() + engine.initial_capital
    peak = cumulative.cummax()
    drawdown = (cumulative - peak) / peak * 100
    max_drawdown = drawdown.min()

    # Brier Score (วัดความแม่นยำของการคาดการณ์ probability)
    df['actual'] = (df['outcome'] == 'WIN').astype(int)
    brier = np.mean((df['entry_price'] - df['actual'])**2)

    return {
        "Total Markets Tested": total_trades,
        "Win Rate": f"{win_rate:.1f}%",
        "Total PnL": f"${total_pnl:+.2f}",
        "ROI": f"{roi:+.2f}%",
        "Final Capital": f"${engine.capital:.2f}",
        "Avg Win": f"${avg_win:+.2f}",
        "Avg Loss": f"${avg_loss:+.2f}",
        "Profit Factor": f"{profit_factor:.2f}x",
        "Max Drawdown": f"{max_drawdown:.2f}%",
        "Brier Score (lower=better)": f"{brier:.4f}"
    }, df


# ==========================================
# 5. MAIN EXECUTION
# ==========================================
if __name__ == "__main__":
    print("\n" + "="*56)
    print("  🚀 POLYMARKET QUANTITATIVE BACKTESTER v2.0")
    print("  📡 Data: PolyTest.io (Real Millisecond Snapshots)")
    print("  🎯 Strategy: Mean Reversion on BTC 5-Min Markets")
    print("="*56)

    feed = PolyTestFeed()
    engine = BacktestEngine(initial_capital=5000.0)

    # ดึงตลาด 5m ที่ปิดแล้ว (resolve แล้ว มี winner)
    print("\n[1] Fetching resolved markets from PolyTest API...")
    markets = feed.get_resolved_markets(market_type="5m", limit=50)

    if not markets:
        print("❌ No resolved markets found. Check API key or plan limits.")
        exit(1)

    print(f"\n[2] Running backtest across {len(markets)} resolved markets...")
    for i, market in enumerate(markets):
        snapshots = feed.get_snapshots(market.market_id, limit=500)
        engine.run_market(market, snapshots)
        print(f"  [{i+1}/{len(markets)}] {market.slug} | Winner: {market.winner} | Snapshots: {len(snapshots)}")

    print("\n[3] Calculating Performance Metrics...")
    result = calculate_metrics(engine)

    if result is None:
        print("\n⚠️  No trades were triggered. Markets may have been too stable.")
    else:
        metrics, df = result
        print("\n" + "="*40)
        print("  📊 BACKTEST RESULTS")
        print("="*40)
        for k, v in metrics.items():
            print(f"  {k:<30} {v}")
        print("="*40)

        # แสดง Trade Log
        print("\n📋 Trade Log (Last 10):")
        print(df[['market_id','side','entry_price','size_usd','outcome','pnl_usd']].tail(10).to_string(index=False))

    print("\n✅ Backtest completed.\n")
