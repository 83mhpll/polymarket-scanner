# ⚙️ PART 12 – PART 20: SYSTEM & ALGORITHMIC ARCHITECTURE
**Prediction Market Edge Engine — Technical Architecture & Quantitative Specifications**

---

# PART 12: SYSTEM ARCHITECTURE & DATA PIPELINE

```
                              [ EXTERNAL DATA SOURCES ]
            ┌─────────────────────┬───────────────────┬─────────────────┐
            │   Polymarket CLOB   │    Kalshi API     │   On-Chain RPC  │
            │   (WebSocket/REST)  │  (REST / Streams) │ (Polygon Node)  │
            └──────────┬──────────┴─────────┬─────────┴────────┬────────┘
                       │                    │                  │
┌──────────────────────▼────────────────────▼──────────────────▼───────────────────────┐
│                           HIGH-THROUGHPUT INGESTION LAYER                            │
│                  (Rust / Python Asyncio Worker Cluster)                              │
│  • Rate Limiting & Backoff   • Orderbook Snapshots (100ms)   • Event Logs & Trades   │
└──────────────────────────────────────┬───────────────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────────────────┐
│                                STORAGE & CACHE LAYER                                 │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌──────────────────────┐  │
│  │   Redis 7 (In-Memory)   │  │ TimescaleDB (Tick Data) │  │ PostgreSQL (Rel/App) │  │
│  │   Orderbook & Fast Cache│  │ OHLCV, Trades, Spreads  │  │ Users, Wallets, Orgs │  │
│  └─────────────────────────┘  └─────────────────────────┘  └──────────────────────┘  │
└──────────────────────────────────────┬───────────────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────────────────┐
│                              CORE COMPUTATION ENGINES                                │
│  ┌────────────────────────┐  ┌────────────────────────┐  ┌────────────────────────┐  │
│  │  NLP Market Matcher    │  │  Net Arbitrage Engine  │  │  Smart Money Profiler  │  │
│  │  (Transformer Embeds)  │  │  (Fee/Slippage Matrix) │  │  (PnL/Win-Rate Foren)  │  │
│  └────────────────────────┘  └────────────────────────┘  └────────────────────────┘  │
│  ┌────────────────────────┐  ┌────────────────────────┐  ┌────────────────────────┐  │
│  │  AI Probability Engine │  │  Risk & Kelly Engine   │  │  Backtest Simulator   │  │
│  │  (Brier Calibrated)    │  │  (Drawdown / Sizing)   │  │  (Realistic Fill Model)│  │
│  └────────────────────────┘  └────────────────────────┘  └────────────────────────┘  │
└──────────────────────────────────────┬───────────────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼───────────────────────────────────────────────┐
│                             API & PRESENTATION LAYER                                 │
│         FastAPI (REST & WebSocket Server)  •  EIP-712 Execution Gateway             │
│               Liquid Glass Web Dashboard   •   Telegram VIP Bot                      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

---

# PART 13: DATABASE SCHEMA (PostgreSQL + TimescaleDB)

```sql
-- 1. Platforms
CREATE TABLE platforms (
    platform_id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    base_currency VARCHAR(16) DEFAULT 'USDC',
    taker_fee_bps NUMERIC DEFAULT 0,
    maker_fee_bps NUMERIC DEFAULT 0,
    api_status VARCHAR(16) DEFAULT 'ONLINE'
);

-- 2. Standardized Markets
CREATE TABLE standardized_markets (
    market_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_id VARCHAR(32) REFERENCES platforms(platform_id),
    native_market_id VARCHAR(128) NOT NULL,
    event_slug VARCHAR(256),
    question TEXT NOT NULL,
    normalized_question TEXT NOT NULL,
    category VARCHAR(64),
    yes_token_id VARCHAR(128),
    no_token_id VARCHAR(128),
    resolution_source VARCHAR(256),
    resolution_date TIMESTAMPTZ,
    status VARCHAR(32) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(platform_id, native_market_id)
);

-- 3. Market Matching Pairs (Cross-Exchange Equivalences)
CREATE TABLE cross_market_pairs (
    pair_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    market_a_id UUID REFERENCES standardized_markets(market_id),
    market_b_id UUID REFERENCES standardized_markets(market_id),
    similarity_score NUMERIC(5,4),
    resolution_match_verified BOOLEAN DEFAULT FALSE,
    rule_parity_notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. TimescaleDB Hypertable for Tick-by-Tick Orderbook Snapshots
CREATE TABLE market_ticks (
    time TIMESTAMPTZ NOT NULL,
    market_id UUID NOT NULL,
    best_bid NUMERIC(8,4) NOT NULL,
    best_ask NUMERIC(8,4) NOT NULL,
    mid_price NUMERIC(8,4) NOT NULL,
    last_price NUMERIC(8,4),
    volume_24h NUMERIC(16,2),
    liquidity_usd NUMERIC(16,2),
    depth_1pct_usd NUMERIC(16,2)
);
SELECT create_hypertable('market_ticks', 'time');

-- 5. Wallet Profiles & Smart Money Forensics
CREATE TABLE wallet_profiles (
    wallet_address VARCHAR(66) PRIMARY KEY,
    platform_id VARCHAR(32) REFERENCES platforms(platform_id),
    label VARCHAR(64),
    total_trades INT DEFAULT 0,
    total_volume_usd NUMERIC(16,2) DEFAULT 0,
    realized_pnl_usd NUMERIC(16,2) DEFAULT 0,
    unrealized_pnl_usd NUMERIC(16,2) DEFAULT 0,
    win_rate NUMERIC(5,4) DEFAULT 0,
    consistency_score NUMERIC(5,2) DEFAULT 0,
    smart_money_score NUMERIC(5,2) DEFAULT 0,
    is_market_maker BOOLEAN DEFAULT FALSE,
    last_active TIMESTAMPTZ
);
```

---

# PART 14: API ARCHITECTURE & SPECIFICATIONS

### 1. REST Endpoints (FastAPI)
- `GET /api/v1/opportunities/live` — Returns active opportunities sorted by `net_edge` or `final_score`.
- `GET /api/v1/arbitrage/cross-market` — Lists real-time verified 2-leg cross-exchange arbitrage sets.
- `GET /api/v1/whales/smart-money` — Leaderboard of verified non-MM smart money wallets.
- `GET /api/v1/ai/calibrated-predictions` — Model probabilities with historical Brier error.
- `POST /api/v1/execution/prepare-order` — Generates unsigned EIP-712 order payload with embedded Builder Code.

### 2. WebSocket Real-Time Feeds
- `WS /ws/v1/edge-stream` — Sub-second broadcast of new opportunities and sudden whale fills.
- `WS /ws/v1/orderbook-depth?market_id=...` — L2 depth stream with live spread calculations.

---

# PART 15: AI/ML PROBABILITY ENGINE & CALIBRATION

## 1. Probabilistic Modeling Framework
Rather than asking an LLM for arbitrary percentage guesses, our AI Probability Engine uses a **Hybrid Quant-LLM Architecture**:

1. **Statistical Base Prior ($P_{\text{prior}}$):** Derived from historical outcomes of similar base-rate events (e.g. historical incumbent election win rates, Fed rate hike probabilities from CME FedWatch).
2. **Real-time News Sentiment Delta ($\Delta P_{\text{news}}$):** Fine-tuned transformer model (RoBERTa / FinBERT) trained on financial headlines and news wire APIs.
3. **Smart Money Flow Delta ($\Delta P_{\text{whale}}$):** Order flow imbalance from verified Smart Money wallets ($S > 80$).
4. **Bayesian Posterior Calculation:**
$$P_{\text{model}} = \sigma\left(\text{logit}(P_{\text{prior}}) + \alpha \cdot \text{Sentiment} + \beta \cdot \text{SmartMoneyImbalance}\right)$$

## 2. Calibration Verification (Brier Score Tracking)
Every prediction made by the model is logged and evaluated upon market resolution:
$$\text{Brier Score} = \frac{1}{N}\sum_{t=1}^{N} (P_{\text{model}, t} - O_t)^2 \quad \text{where } O_t \in \{0, 1\}$$
- Target Brier Score $< 0.12$ (equivalent to Superforecaster grade).
- Display a live **Calibration Reliability Curve** (Predicted vs Observed frequencies) directly on the UI.

---

# PART 16: NET EXECUTABLE ARBITRAGE FORMULATION

To guarantee that arbitrage recommendations are profitable in reality, the engine evaluates the full cost matrix:

### The Net Arbitrage Equation
$$\text{Gross Profit} = 1.00 - (\text{Ask}_{\text{Venue A, YES}} + \text{Ask}_{\text{Venue B, NO}})$$

$$\text{Taker Fees} = (\text{Size} \cdot \text{Ask}_A \cdot \text{FeeRate}_A) + (\text{Size} \cdot \text{Ask}_B \cdot \text{FeeRate}_B)$$

$$\text{Slippage Cost} = \int_{0}^{\text{Size}} \left(P_A(q) - \text{Ask}_A\right)dq + \int_{0}^{\text{Size}} \left(P_B(q) - \text{Ask}_B\right)dq$$

$$\text{Gas / Bridge Cost} = \text{GasCost}_{\text{Polygon}} + \text{Dep/WithdrawCost}$$

$$\mathbf{Net\ Executable\ Profit} = (\text{Gross Profit} \cdot \text{Size}) - \text{Taker Fees} - \text{Slippage Cost} - \text{Gas / Bridge Cost}$$

$$\mathbf{Net\ ROI\%} = \frac{\mathbf{Net\ Executable\ Profit}}{\text{Total Invested USD}} \times 100$$

> **The Zero-Tolerance Threshold:** If $\text{Net ROI\%} \le 1.0\%$, the opportunity is classified as **"THEORETICAL ONLY / UNEXECUTABLE"** and suppressed from high-conviction alert feeds.

---

# PART 17: SMART MONEY SCORING (0–100) & ANTI-MM FILTER

### 1. The 5 Metrics of Wallet Quality
1. **Realized PnL Quality ($M_1, 30\%$):** Total net profits normalized by capital turnover.
2. **Win Rate Consistency ($M_2, 25\%$):** Ratio of profitable closed positions, requiring sample size $N \ge 15$.
3. **Information Timing Ratio ($M_3, 20\%$):** Did the wallet enter $> 2\text{ hours}$ before major price breakouts?
4. **Drawdown Resilience ($M_4, 15\%$):** Maximum peak-to-trough capital loss.
5. **Position-to-Liquidity Ratio ($M_5, 10\%$):** Did they accumulate without creating $>3\%$ self-slippage?

### 2. Market Maker & Wash Trader Detection Filter
A wallet is automatically flagged with `is_market_maker = TRUE` (and excluded from whale signals) if:
- Trade Frequency $> 100\text{ trades/day}$ AND
- Ratio of YES volume to NO volume is between $0.85$ and $1.15$ (delta-neutral rebalancing) AND
- Average holding time $< 15\text{ minutes}$.

---

# PART 18: RISK ENGINE & KELLY CRITERION SIZING

For any non-arbitrage directional opportunity with model edge, the Risk Engine calculates optimal position sizing via Fractional Kelly Criterion ($f^* = 0.25 \times \text{Full Kelly}$ to prevent catastrophic ruin):

$$f^* = \frac{b \cdot P_{\text{model}} - (1 - P_{\text{model}})}{b} \times 0.25 \quad \text{where } b = \frac{1 - \text{Price}}{\text{Price}}$$

- **Max Position Limit:** Hard cap at $5\%$ of user portfolio or $10\%$ of available top-of-book depth (whichever is smaller).
- **Legging Risk Guard:** For 2-leg arbitrage, if leg 1 fills and leg 2 fails within $500\text{ms}$, execute immediate market unhedge to limit loss to spread width.

---

# PART 19: BACKTESTING & SIMULATION ENGINE

- **Tick-Level Replay:** Replays historical orderbook L2 ticks rather than daily candle averages.
- **Slippage Simulation:** Walks down the historical orderbook ladder to match real fills based on order size.
- **Outputs Produced:**
  - Annualized Return (CAGR)
  - Sharpe Ratio & Sortino Ratio
  - Maximum Drawdown (MDD) % and Duration
  - Total Fees & Slippage Paid vs Gross Edge
  - Profit Factor & Win/Loss Trade Distribution

---

# PART 20: 1-CLICK NON-CUSTODIAL EXECUTION GATEWAY

1. **Non-Custodial Principle:** Private keys never touch our servers.
2. **EIP-712 Order Signing:** The frontend constructs the typed structured order (`Order` struct with `salt`, `maker`, `signer`, `taker`, `tokenId`, `makerAmount`, `takerAmount`).
3. **Builder Code Monetization:** Embedded directly in the order creation payload to ensure our platform automatically receives commission rebates on every trade executed.
