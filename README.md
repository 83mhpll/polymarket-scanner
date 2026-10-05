# 🎯 Polymarket Scanner & Quant Suite

> A professional toolkit for discovering high-probability trading opportunities on **Polymarket** — featuring real-time market scanning, algorithmic backtesting, multi-strategy trading engines, and one-command Docker deployment.

[![Node.js](https://img.shields.io/badge/Node.js-v16+-339933?logo=node.js)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.8+-3776AB?logo=python)](https://python.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker)](https://docker.com)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## ✨ Features

| Module | Description |
|--------|-------------|
| 🌐 **Live Dashboard** | Dark-neon fintech UI with real-time market scanning |
| 🔍 **Smart Scanner** | High-conviction filter engine (87–95% win prob, liquidity, spread) |
| 📊 **Quant Backtester** | Monte Carlo + Mean Reversion backtesting via PolyTest API |
| 🐳 **Docker Deployment** | One-command cloud deployment with `docker-compose` |
| ⚡ **Trading Strategies** | Arbitrage, Whale Radar, Dust Sniper, NegRisk modules |
| 🧪 **Test Suite** | Production trading tests and quantitative test suite |

---

## 🏗️ Architecture

```
polymarket-scanner/
├── server.js                  # Express backend — proxy, API, paper trading
├── scanner.js                 # Core scanner v3.0 — market filter engine
├── trader.js                  # Live trade execution via Polymarket CLOB API
├── public/
│   └── index.html             # Dashboard UI (Dark Neon Glassmorphism)
│
├── quant_backtester.py        # Quant Backtester v2 (PolyTest API + Monte Carlo)
├── run_backtest.py            # Backtest runner CLI
├── polymarket_backtester.py   # Event-driven backtester (local mock data)
│
├── engine/                    # Advanced trading engines
│   ├── ai_probability.js      # AI-assisted probability scoring
│   ├── kalshi_client.js       # Kalshi market data client
│   ├── market_matcher.js      # Cross-market opportunity matcher
│   ├── net_arbitrage.js       # Net arbitrage detector
│   └── smart_money.js         # Smart money flow tracker
│
├── cross_market_arbitrage.js  # Cross-market arbitrage strategy
├── negrisk_arbitrage.js       # NegRisk arbitrage module
├── dust_sniper_1c.js          # 1¢ dust market sniper
├── whale_radar.js             # Large position tracker
├── sniper_simulator.js        # Strategy simulator
│
├── Dockerfile                 # Docker image definition
├── docker-compose.yml         # Multi-service deployment
├── deploy.sh                  # Deployment automation script
├── .env.example               # Environment config template
│
└── team/                      # Team docs, agent roster, edge engine research
```

---

## 🚀 Quick Start

### Option A — Local (Node.js)

```bash
# 1. Clone & install
git clone https://github.com/83mhpll/polymarket-scanner.git
cd polymarket-scanner
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and add your API keys

# 3. Start the dashboard
npm start
```

Open **http://localhost:3001** in your browser.

---

### Option B — Docker (Recommended for Production)

```bash
# 1. Clone & configure
git clone https://github.com/83mhpll/polymarket-scanner.git
cd polymarket-scanner
cp .env.example .env
# Edit .env with your API keys

# 2. Deploy with one command
docker-compose up -d

# 3. View logs
docker-compose logs -f
```

---

## 📊 Quant Backtester

### Setup

```bash
pip install pandas numpy requests
```

### Run Backtest (PolyTest API — Real Data)

```bash
python3 run_backtest.py
```

The `quant_backtester.py` connects to [PolyTest API](https://polytest.io) and runs:
- **Mean Reversion** strategy on BTC Up/Down 5-minute markets
- **Monte Carlo** simulation for risk/reward analysis
- Reports: Initial Capital, Final Capital, ROI, Total Trades, Sharpe Ratio

### Run Event-Driven Backtest (Local Mock Data)

```bash
python3 polymarket_backtester.py
```

---

## ⚡ Trading Strategies

### Engine Modules (`engine/`)

| Module | Description |
|--------|-------------|
| `ai_probability.js` | ML-assisted win probability scoring |
| `market_matcher.js` | Finds correlated markets across Polymarket & Kalshi |
| `net_arbitrage.js` | Detects net arbitrage (YES+NO > $1.00) |
| `smart_money.js` | Tracks whale wallet activity |
| `kalshi_client.js` | Pulls live data from Kalshi API |

### Standalone Strategies

```bash
# Cross-market arbitrage
node cross_market_arbitrage.js

# NegRisk arbitrage (multi-outcome markets)
node negrisk_arbitrage.js

# 1¢ dust market sniper
node dust_sniper_1c.js

# Whale radar — track large positions
node whale_radar.js
```

---

## 🌐 Dashboard Features

| Feature | Detail |
|---------|--------|
| **High-Conviction Filter** | Win prob 87–95%, configurable liquidity & spread |
| **Time Windows** | 10 min / 30 min / 1 hr / 7 days |
| **Category Tags** | Crypto, Sports, Politics, Weather, Finance, Science |
| **Paper Trading** | Click "📝 Paper Trade" → auto-records to `backtest.json` |
| **Live PnL** | Simulated PnL updates as markets resolve |
| **Fact-Check Links** | Quick links to Google News / X for each market |
| **Live Config** | Adjust `MIN_PRICE`, `MIN_LIQUIDITY`, `MAX_SPREAD` without restart |

---

## 🔧 Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
PORT=3001
NODE_ENV=production

# PolyTest API (for backtesting)
POLYTEST_API_KEY=your_key_here

# Polymarket CLOB API (for live trading)
POLY_BUILDER_CODE=your_builder_code
POLY_API_KEY=your_api_key
POLY_API_SECRET=your_api_secret
POLY_API_PASSPHRASE=your_passphrase
```

> ⚠️ **Never commit your `.env` file.** It is already in `.gitignore`.

---

## 🌿 Branch Structure

| Branch | Purpose |
|--------|---------|
| `main` | Stable production code |
| `feat/scanner-core` | Scanner, server, trader improvements |
| `feat/frontend-ui` | Dashboard redesign |
| `feat/quant-backtesting` | Quant backtester upgrades |
| `feat/trading-strategies` | Engine modules + strategy scripts |
| `feat/docker-deployment` | Docker + CI/CD infra |
| `test/trading-tests` | Production and quant test suite |
| `docs/team` | Team roster, guides, edge engine research |

---

## 🧪 Running Tests

```bash
# Production trading simulation
node test_production_trading.js

# Quant strategy test suite
node test_quant_suite.js

# Local integration test
node run_local_test.js
```

---

## 📁 Data Files

| File | Description |
|------|-------------|
| `backtest.json` | Paper trading log (auto-generated) |
| `sample_markets.json` | Cached market data (fallback) |
| `watchlist.json` | Saved watchlist markets |

---

## 🚢 Deploy to Cloud

```bash
chmod +x deploy.sh
./deploy.sh
```

The `deploy.sh` script handles environment validation, Docker image build & push, and zero-downtime service restart.

---

## ⚠️ Disclaimer

This software is for **educational and research purposes only**. It is not financial advice. Trading on prediction markets involves significant risk of loss. Always do your own research.

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit: `git commit -m "feat: add your feature"`
4. Push: `git push origin feat/your-feature`
5. Open a Pull Request to `main`

---

*Built with ❤️ for the Polymarket community*
