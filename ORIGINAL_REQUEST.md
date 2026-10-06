# Original User Request

## 2026-10-06T19:20:52Z

An institutional prediction market quantitative research and autonomous execution system featuring a Weather Domain Fair Value model (Open-Meteo ensemble NWP), a 24/7 Autonomous Paper-Trading Bot, Real-time WebSocket CLOB streamer, and Risk/Kill-switch engine integrated into the terminal.

Working directory: /Users/mk83/.gemini/antigravity/scratch/polymarket-scanner
Integrity mode: development

## Requirements

### R1. Domain Fair Value Quantitative Model (Weather & Ensemble NWP)
- Implement an independent probability pricing engine for prediction markets (specifically calibrated for Weather markets using ensemble NWP weather forecast distributions, such as Open-Meteo GFS/ECMWF).
- Compute probability estimations in logit/expit space.
- Apply standard de-vigging methods (Multiplicative, Power, Shin 1993) to extract unbiased probabilities from market bids and asks.
- Factor in dynamic taker and maker trading fee schedules queried from Polymarket fee endpoints.
- Evaluate edge using Proper Scoring Rules (Brier Score and log-loss) benchmarked against historical settlements and market-implied probabilities.

### R2. 24/7 Autonomous Paper-Trading Engine & Fill Simulator
- Operate strictly in simulated paper-trading mode logging all positions, transactions, and balances to `backtest.json`.
- Enforce regional compliance (zero live-capital execution for restricted jurisdictions).
- Simulate passive queue placement, spread-crossing execution, slippage, and liquidity consumption accurately.
- Size orders using Fractional Kelly Criterion with market shrinkage to prevent overbetting under estimation noise.

### R3. Low-Latency Market Data & Orderbook Streaming
- Connect to Polymarket CLOB via WebSocket for streaming BBO, 5-level depth ladders, and trade executions.
- Provide reliable reconnection mechanisms and REST polling fallback with exponential backoff.
- Feed live market data, model fair values, active bot positions, and PnL directly into the terminal interface.

### R4. Institutional Risk Management & Emergency Kill-Switch
- Monitor real-time portfolio metrics: max drawdown limits, gross/net capital exposure, and per-market concentration ceilings.
- Implement an instant Kill-Switch: halts automated trade execution and cancels outstanding orders whenever risk thresholds are breached.

## Acceptance Criteria

### Quantitative Model & Scoring
- [ ] Fair value pricing model generates valid probabilities strictly within the interval (0, 1) without runtime errors.
- [ ] The model achieves a demonstrably lower Brier Score than unadjusted raw market probabilities across benchmark test cases.
- [ ] Dynamic fee rates are accounted for in net edge calculations (net edge = gross edge - venue fees).

### Paper-Trading Engine & Safety
- [ ] Bot runs autonomously in paper-trading simulation without triggering real-money blockchain orders.
- [ ] All simulated executions record full metadata (timestamp, token ID, price, simulated slippage, sizing rationale) to `backtest.json`.
- [ ] Triggering the Kill-Switch halts execution within 1 second and cancels all active paper bids/asks.

### System Integration & Testing
- [ ] Terminal UI displays synchronized depth ladders, real-time Fair Value delta, paper bot status, and live PnL.
- [ ] Automated test suite verifies probability models, fee calculators, order fill simulations, and risk limit assertions with passing results.
