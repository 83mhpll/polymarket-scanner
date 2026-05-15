# 🎯 Polymarket Scanner & Backtest Suite

A comprehensive toolkit for discovering high-probability trading opportunities on **Polymarket** and running algorithmic backtests to validate trading strategies.

---

## 🚀 Features

### 1. 🌐 Real-time Web Dashboard (Node.js)

A professional, "Dark Neon Glassmorphism" web application designed for live market scanning.

- **High-Conviction Scanning:** Automatically filters for markets with high win rates (e.g., >95%), sufficient liquidity, and tight spreads.
- **Granular Time Filtering:** Filter markets ending in 10 mins, 30 mins, 1 hour, or up to 7 days.
- **Paper Trading (Forward Testing):** Click **"📝 Paper Trade"** on any market to record an entry. View your simulated PnL dynamically in the **Backtest Log** once markets resolve.
- **Live Configuration:** Dynamically adjust `MIN_PRICE`, `MIN_LIQUIDITY`, `MAX_SPREAD` without restarting the server.
- **Fact-Checking & Context:** Read market context directly from Polymarket or use quick-links to Google News / X (Twitter) for instant verification.

### 2. 🤖 Algorithmic Backtest Engine (Python)

An event-driven backtesting framework for simulating trading strategies against historical CLOB data.

- **Event-Driven Architecture:** Prevents look-ahead bias by iterating through orderbook ticks chronologically.
- **Slippage & Spread Simulation:** Accurately accounts for transaction costs and liquidity constraints.
- **Custom Strategies:** Easily inject custom logic (e.g., Orderbook Imbalance, Mean Reversion).

---

## 🛠️ Installation & Setup

### Prerequisites

- **Node.js** (v16+ recommended)
- **Python** (3.8+)

### 1. Install Node.js Dependencies (Dashboard)

```bash
npm install
```

### 2. Install Python Dependencies (Backtester)

```bash
python3 -m pip install pandas numpy
```

---

## 💻 Usage

### 🟢 Running the Web Dashboard

```bash
npm start
# OR
node server.js
```

- **Access the UI:** Open `http://localhost:3001` in your browser.
- **Paper Trading Log:** Your simulated trades will be saved locally in `backtest.json`.

### 🟢 Running the Python Backtester

```bash
python3 polymarket_backtester.py
```

- The script will execute a simulated "Orderbook Imbalance" strategy using mock data and print the resulting Initial Capital, Final Capital, ROI, and Total Trades.

---

## 📂 Project Structure

- `server.js` - Express backend proxy and Paper Trading API handler.
- `scanner.js` - Core logic for querying and filtering the Polymarket Gamma API.
- `public/index.html` - The frontend Dashboard UI (HTML/CSS/JS).
- `polymarket_backtester.py` - Event-driven Python backtesting framework.
- `backtest.json` - Local database storing your Paper Trading / Forward Backtest results.
- `sample_markets.json` - Fallback / cached market data.

---

**Disclaimer:** This software is for educational and research purposes only. It is not financial advice. Trading on prediction markets involves significant risk.
