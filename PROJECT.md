# Project: Polymarket Scanner Institutional Audit, Usability Validation & Continuous Enhancement

## Architecture
- **Scanner & Arbitrage Track**: `scanner.js`, `negrisk_arbitrage.js`, `cross_market_arbitrage.js`, `dust_sniper_1c.js`, `engine/net_arbitrage.js`, `engine/market_matcher.js`
- **Pricing & Orderbook Track**: `engine/weather_fair_value.js`, `engine/devigging.js`, `engine/dynamic_fees.js`, `engine/clob_depth.js`, `engine/clob_streamer.js`, `engine/proper_scoring.js`
- **Autonomous Execution Track**: `engine/paper_bot.js`, `engine/risk_manager.js`, `engine/portfolio_analytics.js`, `backtest.json`
- **Presentation & Telemetry Track**: `public/index.html`, `server.js`, WebSocket CLOB streamer `/live-depth`

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Weather Ensemble NWP Model Integration | Fix bracket schema `{min, max}` and property name `.fairProb` in `paper_bot.js` to enable weather model execution in autonomous trading. | M1 | Survey (audit_p1_p2) |
| 2 | Risk Engine Pre-Trade Integration | Wire `AutonomousPaperBot` with `InstitutionalRiskManager.checkPreTradeRisk()` and enforce kill-switch halt guard before placing paper orders. | M1 | Survey (audit_p3_p4) |
| 3 | Single Market Concentration Fix | Correct `newSingleExposure` calculation in `risk_manager.js` to check target market concentration instead of global max. | M1 | Survey (audit_p3_p4) |
| 4 | Chronological Drawdown Calculation | Sort closed trades chronologically before computing peak equity and peak-to-trough drawdown in `risk_manager.js`. | M1 | Survey (audit_p3_p4) |
| 5 | Ledger Concurrency & Atomic Persistence | Implement atomic file writes and re-read disk ledger before state transitions in `paper_bot.js` to prevent erasing Kill-Switch cancellations. | M1 | Survey (audit_p3_p4) |
| 6 | NegRisk Arbitrage Mathematical Hardening | Enforce `negRisk: true` check, live CLOB ask pricing, dynamic fee subtraction, and 10% Kelly cap in `negrisk_arbitrage.js`. | M2 | Survey (audit_p1_p2) |
| 7 | Cross-Market Conditional Probability Correction | Bound child market probabilities ($P(\text{Child}) \le P(\text{Parent})$) and require exact semantic entities in `cross_market_arbitrage.js`. | M2 | Survey (audit_p1_p2) |
| 8 | 1¢ Dust Sweeper Calibration | Remove artificial 25% win rate floor, implement calibrated base rates, and enforce strict bankroll caps ($\le 0.5\%$) in `dust_sniper_1c.js`. | M2 | Survey (audit_p1_p2) |
| 9 | Numerical Stability in De-vigging Solvers | Validate $q_i < 1.0$ in Power solver; implement rationalized Shin formula $\frac{2(q_i^2/s)}{\sqrt{z^2 + \dots} + z}$ to eliminate cancellation as $z \to 1$. | M2 | Survey (audit_p1_p2) |
| 10| Centralized Dynamic Venue Fee Architecture | Centralize all taker fee and net edge calculations through `engine/dynamic_fees.js` ($C \cdot \text{feeRate} \cdot p(1-p)$), eliminating hardcoded 0% and 2%. | M2 | Survey (audit_p1_p2) |
| 11| Orderbook Sorting & Streamer Fallback | Sort bids/asks in `clob_depth.js`; fix property lookup `ladderBids` in `clob_streamer.js` REST fallback to eliminate fake dummy quotes. | M3 | Survey (audit_p1_p2, audit_ui_stream) |
| 12| WebSocket CLOB Streamer Auto-Start & UI Integration | Auto-connect `clobStreamerInstance.connect()` in `server.js`; wire UI DOM depth ladder to `/api/v1/clob/live-depth` and display live connection badge. | M3 | Survey (audit_ui_stream) |
| 13| L2 Depth Ladder DOM Schema Alignment | Align streamer output schema with UI expectation (`ladderBids`/`ladderAsks` with `depthUsd`). | M3 | Survey (audit_ui_stream) |
| 14| UI State Desynchronization Fixes | Fix Alerts Modal indexing bug, synchronize YES/NO toggle token IDs, and resolve `opp.mispricing` property collision. | M3 | Survey (audit_ui_stream) |
| 15| Parallel Asynchronous Portfolio Resolution | Replace sequential Gamma API queries in `/api/backtest/check` with bounded concurrent fetches to eliminate event loop blocking. | M3 | Survey (audit_ui_stream) |
| 16| UI Responsiveness & UX Polish | Debounce search inputs, eliminate duplicate ⌘K listener, replace blocking `window.alert()` with toast alerts. | M3 | Survey (audit_ui_stream) |
| 17| 100% Test Pass Rate & Full Regression Suite | Maintain 231/231 passing baseline tests and add comprehensive unit/integration regression tests for all audited areas. | M4 | Survey (all explorers) |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M0 | Survey & 4-Pillar Comprehensive Forensic Audit | Full forensic inspection across all 4 pillars, UI, streaming, and test suite. | None | DONE |
| M1 | Core Execution & Risk Safety Remediation | Fix Weather NWP bracket schema, wire Paper Bot with Risk Manager, fix market concentration & drawdown chronology, harden ledger persistence. | M0 | IN_PROGRESS |
| M2 | Quantitative & Mathematical Pricing Hardening | Harden NegRisk arbitrage, fix cross-market conditional probabilities, calibrate dust sweeper, stabilize de-vigging solvers, unify dynamic fees. | M1 | PLANNED |
| M3 | High-Resilience Streaming & Terminal UI Polish | Fix CLOB sorting & REST fallback, autostart WebSocket streamer, align DOM depth schema, fix UI desyncs, optimize portfolio resolution. | M2 | PLANNED |
| M4 | Regression Verification & Adversarial Stress Testing | Validate 100% test pass rate across existing 231 tests + new regression tests; stress test Kill-Switch <1,000ms latency. | M3 | PLANNED |

## Interface Contracts
### `engine/paper_bot.js` ↔ `engine/risk_manager.js`
- `AutonomousPaperBot` maintains reference to `InstitutionalRiskManager`.
- Before placing paper trade: `const riskCheck = this.riskManager.checkPreTradeRisk(tradeSizeUsd, marketKey, bankroll)`. If `!riskCheck.allowed`, skip trade and log reason.
- If `this.riskManager.isKilled === true`, skip cycle entirely.

### `engine/paper_bot.js` ↔ `engine/weather_fair_value.js`
- `calculateFairProbability(ensemble, targetDate, bracket, method)` expects `bracket: { min?: number, max?: number }`.
- Returns `{ fairProb: number, logitProb: number, ... }`.

### `engine/clob_streamer.js` ↔ `engine/clob_depth.js`
- `calculateOrderbookSlippage(tokenId, targetUsd)` returns `{ success: boolean, ladderBids: Array, ladderAsks: Array, ... }`.
- `clob_streamer.js` REST fallback consumes `res.ladderBids` and `res.ladderAsks`.

### `engine/clob_streamer.js` ↔ `public/index.html`
- Live WebSocket endpoint or `/api/v1/clob/live-depth?token_id=...` serves `{ bids: [...], asks: [...], ladderBids: [...], ladderAsks: [...], source: 'websocket'|'rest' }`.
