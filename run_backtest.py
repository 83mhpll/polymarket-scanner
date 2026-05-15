"""
run_backtest.py — Single-Market Backtester สำหรับ Polymarket Scanner
รับ slug จาก server.js แล้วรัน backtest ด้วย PolyTest API คืนผล JSON
Usage: python3 run_backtest.py --slug "btc-updown-5m-..." --capital 1000
"""

import sys
import json
import requests
import numpy as np
import argparse
import logging

logging.basicConfig(level=logging.WARNING)

POLYTEST_API_KEY = "pt_live_6s4c243a2w5h5i4549220i5u5h6z6z3v"
BASE_URL = "https://api.polytest.io/api/v1"
HEADERS = {"X-API-Key": POLYTEST_API_KEY}


def find_market_by_slug(slug: str):
    """ค้นหา market ด้วย slug จาก PolyTest API"""
    # ลองทุก market_type ที่รองรับ
    for market_type in ["5m", "15m"]:
        res = requests.get(f"{BASE_URL}/markets?market_type={market_type}&limit=200", headers=HEADERS)
        if res.status_code != 200:
            continue
        data = res.json()
        for m in data.get("markets", []):
            if m.get("slug") == slug or slug in m.get("slug", ""):
                return m, market_type
    return None, None


def find_similar_markets(slug: str, limit: int = 20):
    """หาตลาดที่คล้ายกัน (coin เดียวกัน) สำหรับ Backtest"""
    coin = "btc"
    if "eth" in slug.lower():
        coin = "eth"

    markets = []
    for market_type in ["5m", "15m"]:
        res = requests.get(f"{BASE_URL}/markets?market_type={market_type}&limit={limit}", headers=HEADERS)
        if res.status_code != 200:
            continue
        data = res.json()
        for m in data.get("markets", []):
            if m.get("winner") and m.get("coin", "") == coin:
                markets.append((m, market_type))
    return markets


def get_snapshots(market_id: str, limit: int = 300):
    res = requests.get(f"{BASE_URL}/markets/{market_id}/snapshots?limit={limit}", headers=HEADERS)
    if res.status_code != 200:
        return []
    return res.json().get("snapshots", [])


def run_backtest(markets_with_type, capital: float):
    """รัน backtest ด้วยกลยุทธ์ Mean Reversion"""
    current_capital = capital
    trades = []

    for m, _ in markets_with_type:
        snapshots = get_snapshots(m["market_id"], limit=300)
        if len(snapshots) < 15:
            continue

        prices_up = [float(s.get("price_up") or 0.5) for s in snapshots]
        lookback = 10

        for i in range(lookback, len(prices_up)):
            window = prices_up[i - lookback:i]
            mean_p = np.mean(window)
            std_p = np.std(window)
            if std_p < 0.001:
                continue

            current_p = prices_up[i]
            z = (current_p - mean_p) / std_p

            if z < -0.8 and current_p < 0.55 and current_capital > 50:
                # Kelly Criterion (Quarter-Kelly)
                win_prob = 0.52
                kelly = max(0, (win_prob - (1 - win_prob))) * 0.25
                bet = max(20.0, min(current_capital * kelly, current_capital * 0.10))

                is_win = m.get("winner") == "Up"
                pnl = ((1.0 / current_p) - 1) * bet if is_win else -bet
                current_capital += pnl

                trades.append({
                    "slug": m.get("slug", ""),
                    "side": "UP",
                    "entry_price": round(current_p, 3),
                    "bet_usd": round(bet, 2),
                    "winner": m.get("winner"),
                    "outcome": "WIN" if is_win else "LOSS",
                    "pnl_usd": round(pnl, 2)
                })
                break  # 1 trade per market

    return trades, current_capital


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug", type=str, default="")
    parser.add_argument("--capital", type=float, default=1000.0)
    args = parser.parse_args()

    result = {"slug": args.slug, "status": "ok", "trades": [], "metrics": {}}

    # หาตลาดที่คล้ายกับ slug ที่ผู้ใช้ส่งมา
    similar = find_similar_markets(args.slug, limit=30)

    if not similar:
        result["status"] = "no_data"
        result["message"] = "PolyTest API ไม่มีข้อมูล Historical สำหรับ market นี้ (free plan อาจจำกัด)"
        print(json.dumps(result))
        return

    trades, final_capital = run_backtest(similar, args.capital)

    if not trades:
        result["status"] = "no_trades"
        result["message"] = "ไม่มีสัญญาณเทรดเกิดขึ้น (กลยุทธ์ไม่ตรงเงื่อนไข)"
        print(json.dumps(result))
        return

    wins = [t for t in trades if t["outcome"] == "WIN"]
    losses = [t for t in trades if t["outcome"] == "LOSS"]
    total_pnl = sum(t["pnl_usd"] for t in trades)
    roi = (final_capital - args.capital) / args.capital * 100
    win_rate = len(wins) / len(trades) * 100 if trades else 0

    avg_win = sum(t["pnl_usd"] for t in wins) / len(wins) if wins else 0
    avg_loss = sum(t["pnl_usd"] for t in losses) / len(losses) if losses else 0
    profit_factor = abs(sum(t["pnl_usd"] for t in wins) / sum(t["pnl_usd"] for t in losses)) if losses and sum(t["pnl_usd"] for t in losses) != 0 else 99

    result["trades"] = trades[-10:]  # ส่งแค่ 10 รายการล่าสุด
    result["metrics"] = {
        "total_trades": len(trades),
        "win_rate": round(win_rate, 1),
        "total_pnl": round(total_pnl, 2),
        "roi": round(roi, 2),
        "initial_capital": args.capital,
        "final_capital": round(final_capital, 2),
        "avg_win": round(avg_win, 2),
        "avg_loss": round(avg_loss, 2),
        "profit_factor": round(profit_factor, 2),
        "strategy": "Mean Reversion on Similar BTC/ETH Markets (PolyTest.io)",
        "note": "Backtest ใช้ตลาดที่คล้ายกัน (BTC Up/Down) เนื่องจาก PolyTest มีข้อมูลเฉพาะตลาดประเภทนี้"
    }

    print(json.dumps(result))


if __name__ == "__main__":
    main()
