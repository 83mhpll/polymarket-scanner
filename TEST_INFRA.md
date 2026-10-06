# Polymarket Pro — Institutional Test Infrastructure & E2E Verification Guide

## 1. System Overview & Testing Architecture

This document establishes the authoritative test infrastructure, design methodology, and execution protocol for the institutional prediction market quantitative research and autonomous execution system.

The test infrastructure enforces strict **opaque-box requirement verification** across the four core system pillars:
1. **R1: Domain Fair Value Quantitative Model (Weather & Ensemble NWP)** — GFS/ECMWF numerical weather prediction ingestion, logit/expit transforms, Laplace-smoothed ECDF and Gaussian KDE calibration, Shin (1993) / Power / Multiplicative de-vigging, Polymarket dynamic venue fee curves, and Brier Score / Log-Loss Proper Scoring Rules.
2. **R2: 24/7 Autonomous Paper-Trading Engine & Fill Simulator** — Strictly simulated paper execution, regional compliance hard guard, 5-level orderbook VWAP depth walking, slippage modeling, passive maker queue priority, liquidity consumption, and Fractional Kelly sizing with James-Stein shrinkage.
3. **R3: Low-Latency Market Data & Orderbook Streaming** — Polymarket CLOB WebSocket streaming, BBO and 5-level depth ladders, 10-second PING/PONG heartbeats, auto-reconnection with exponential backoff, and REST polling fallback.
4. **R4: Institutional Risk Management & Emergency Kill-Switch** — High Water Mark tracking, max drawdown limit, gross/net capital exposure caps, per-market concentration ceiling, and sub-second (<150ms SLA) atomic emergency kill-switch.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        E2E Test Architecture                           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
    ┌───────────────────────────────┴───────────────────────────────┐
    ▼                                                               ▼
┌──────────────────────────────────────┐  ┌──────────────────────────────────────┐
│  Authoritative Reference Oracle      │  │  Production Engine Implementations  │
│  tests/fixtures/reference_engine.js  │  │  engine/*.js                         │
└──────────────────┬───────────────────┘  └──────────────────┬───────────────────┘
                   │                                         │
                   └───────────────────┬─────────────────────┘
                                       │
                                       ▼
    ┌──────────────────────────────────────────────────────────────┐
    │          4-Tier Comprehensive Test Runner                    │
    │          tests/e2e_test_suite.js                             │
    ├──────────────────────────────────────────────────────────────┤
    │ Tier 1: Feature Coverage (Isolated Happy Path) [>=20 tests]  │
    │ Tier 2: Boundary & Corner Cases (Extreme Inputs) [>=20 tests]│
    │ Tier 3: Cross-Feature Interactions (Pairwise) [>=5 tests]     │
    │ Tier 4: Real-World Application Scenarios [>=5 scenarios]     │
    └──────────────────────────────────────────────────────────────┘
```

---

## 2. Four-Tier Testing Methodology

The E2E test suite adheres to a 4-tier progressive verification hierarchy:

### Tier 1 — Feature Coverage (Isolated Happy Path)
- **Objective**: Verify that each core feature operates according to its specification in isolation under standard conditions.
- **Scope**: Minimum 5 tests per requirement area (R1, R2, R3, R4) for a total of at least 20 tests.
- **Characteristics**: Deterministic inputs, nominal market states, standard liquidity, valid probability distributions.

### Tier 2 — Boundary & Corner Cases (Extreme & Degenerate Conditions)
- **Objective**: Verify numerical stability, fail-safe exception handling, and invariant preservation under edge conditions.
- **Scope**: Minimum 5 tests per requirement area (R1, R2, R3, R4) for a total of at least 20 tests.
- **Characteristics**: Extreme probabilities ($10^{-6}$, $1 - 10^{-6}$), brackets with infinite bounds, zero-member ensemble matches, zero-fee vs high-fee categories, inverted orderbooks ($b \ge a$), empty books, order sizes exceeding cumulative depth, drawdown/exposure exactly at boundary thresholds, and zero-latency kill-switch activations.

### Tier 3 — Cross-Feature Interactions (Pairwise Multi-Module Workflows)
- **Objective**: Validate end-to-end integration across module boundaries where the output of one engine directly drives another.
- **Scope**: Comprehensive multi-module pipelines covering:
  1. *NWP Forecast -> Shin De-vigging -> Kelly Sizing -> VWAP Taker Fill -> Audit Trail*
  2. *Market Tick -> Fair Value Inversion -> Passive Queue Order Cancellation*
  3. *Adverse Execution Cascade -> Drawdown Breach -> Instant Kill-Switch Trigger & Order Purge*
  4. *Dynamic Fee Schedule Switch -> Net Edge Erosion -> Kelly Sizing Dampening*
  5. *WebSocket Orderbook Depth Ingestion -> Slippage Recalculation -> Portfolio Risk Cap Recalculation*

### Tier 4 — Real-World Application Scenarios (Realistic Market Simulations)
- **Objective**: Simulate full-day institutional trading desks and macro market events with realistic multi-step dynamics.
- **Scope**: 5 complete operational scenarios:
  1. *NYC Central Park Temperature Trading Day (Oct 15)*: Multi-bracket superensemble pricing (Under 70°F, 70-71.9°F, 72-73.9°F, 74°F+), edge discovery, Kelly execution, and trade audit logging.
  2. *Sudden Blizzard / Odds Inversion*: Rapid forecast revision flipping odds from YES to NO; cancellation of stale maker orders and taker execution of the new dominant outcome.
  3. *Volatile Market Making with Partial Queue Execution*: Continuous orderbook ladder updates, partial queue fills, and adverse selection avoidance.
  4. *Flash Crash Drawdown & Sub-Second Kill-Switch SLA*: Asset value collapse triggering portfolio breach; validation of atomic halt (<1ms), order cancellation (<50ms), and total state flush within the <150ms institutional SLA.
  5. *Regional Regulatory Compliance Hard Guard*: Verification that passing mainnet private keys or RPC configuration halts initialization immediately without mutating memory or sending network packets.

---

## 3. Feature Traceability Matrix

| Feature ID | Feature Name | Requirement | Primary Test ID | Secondary / Interaction Test |
|---|---|---|---|---|
| F01 | Open-Meteo GFS Ensemble Ingestion | R1 | `T1_R1_01`, `T1_R1_02` | `T3_INT_01`, `T4_SCN_01` |
| F02 | Open-Meteo ECMWF Ensemble Ingestion | R1 | `T1_R1_01` | `T3_INT_01`, `T4_SCN_01` |
| F03 | Station Coordinate Resolution | R1 | `T1_R1_01` | `T4_SCN_01` |
| F04 | Empirical CDF with Laplace Correction | R1 | `T1_R1_01`, `T2_R1_02` | `T3_INT_01` |
| F05 | Gaussian Kernel Density Smoothing | R1 | `T1_R1_01` | `T4_SCN_01` |
| F06 | Superensemble Reliability Blending | R1 | `T1_R1_01` | `T3_INT_01`, `T4_SCN_01` |
| F07 | Logit / Expit Transformation | R1 | `T1_R1_02`, `T2_R1_01` | `T1_R1_05` |
| F08 | Multiplicative De-vigging | R1 | `T1_R1_06` | `T2_R1_06` |
| F09 | Power Method De-vigging | R1 | `T1_R1_06`, `T2_R1_06` | `T3_INT_01` |
| F10 | Shin (1993) Microstructure De-vigging | R1 | `T1_R1_03`, `T2_R1_05` | `T3_INT_01`, `T4_SCN_01` |
| F11 | Dynamic Venue Fee Model | R1 | `T1_R1_04`, `T2_R1_04` | `T3_INT_04` |
| F12 | Net Edge Calculation | R1 | `T1_R1_04` | `T3_INT_01`, `T3_INT_04` |
| F13 | Brier Score & BSS Benchmarking | R1 | `T1_R1_05` | `T4_SCN_01` |
| F14 | Stable Log-Loss Evaluation | R1 | `T1_R1_05`, `T2_R1_01` | `T4_SCN_01` |
| F15 | Fractional Kelly Criterion | R2 | `T1_R2_02`, `T2_R2_03` | `T3_INT_01`, `T3_INT_04` |
| F16 | James-Stein Ensemble Shrinkage | R2 | `T1_R2_02` | `T3_INT_01` |
| F17 | Passive Maker Queue Priority | R2 | `T1_R2_06`, `T2_R2_05` | `T3_INT_02`, `T4_SCN_03` |
| F18 | Spread-Crossing VWAP Walk | R2 | `T1_R2_03`, `T2_R2_01` | `T3_INT_01`, `T4_SCN_01` |
| F19 | Orderbook Slippage Modeling | R2 | `T1_R2_04`, `T2_R2_01` | `T3_INT_01`, `T3_INT_05` |
| F20 | Local Liquidity Consumption | R2 | `T1_R2_05`, `T2_R2_01` | `T4_SCN_03` |
| F21 | backtest.json Audit Logging | R2 | `T1_R2_03` | `T3_INT_01`, `T4_SCN_01` |
| F22 | Regional Compliance Hard Guard | R2 | `T1_R2_01` | `T4_SCN_05` |
| F23 | CLOB WebSocket Market Feed | R3 | `T1_R3_01` | `T3_INT_05` |
| F24 | Application Heartbeat (PING/PONG) | R3 | `T1_R3_03`, `T2_R3_04` | `T4_SCN_03` |
| F25 | BBO & 5-Level Depth Streaming | R3 | `T1_R3_01`, `T1_R3_02` | `T3_INT_05` |
| F26 | Executed Trades Streaming | R3 | `T1_R3_01` | `T4_SCN_03` |
| F27 | Exponential Reconnect & REST Fallback | R3 | `T1_R3_04`, `T1_R3_05` | `T2_R3_04` |
| F28 | Terminal UI & Telemetry Sync | R3 | `T1_R3_02` | `T4_SCN_01` |
| F29 | Real-Time Peak-to-Trough Drawdown | R4 | `T1_R4_01`, `T2_R4_01`, `T2_R4_02` | `T3_INT_03`, `T4_SCN_04` |
| F30 | Gross & Net Exposure Ceilings | R4 | `T1_R4_02`, `T2_R4_03` | `T3_INT_05` |
| F31 | Per-Market Concentration Limits | R4 | `T1_R4_03`, `T2_R4_04` | `T3_INT_05` |
| F32 | Instant Emergency Kill-Switch | R4 | `T1_R4_04`, `T1_R4_05`, `T2_R4_05` | `T3_INT_03`, `T4_SCN_04` |

---

## 4. Expected Output Derivation & Reference Oracle

Every test assertion in `tests/e2e_test_suite.js` is derived from:
1. **Authoritative Reference Oracle (`tests/fixtures/reference_engine.js`)**:
   - Implements closed-form mathematical equations and bisection solvers derived from `PROJECT.md`.
   - Used to generate reference values against which actual outputs are tested.
2. **Deterministic Test Fixtures**:
   - `tests/fixtures/weather_knyc_superensemble.json`: 31 GFS + 51 ECMWF temperature observations for KNYC Central Park.
   - `tests/fixtures/clob_depth_snapshots.json`: Institutional 5-level orderbook ladders and category fee rates.
3. **Mathematical Properties & Specification Invariants**:
   - Probability conservation: $\sum_{i=1}^n p_i = 1.0 \pm 10^{-7}$.
   - Bound strictness: $0.0 < p < 1.0$ (never underflow to 0 or overflow to 1).
   - Bijective mapping: $\text{expit}(\text{logit}(p)) \equiv p$.
   - Shin insider parameter: $z \in [0, 1)$.
   - Monotonicity: Higher target temperature brackets produce monotonically non-increasing exceedance probabilities.
   - Sub-second Kill-Switch: Total elapsed duration $t < 150\text{ms}$ ($<1000\text{ms}$ SLA).

---

## 5. Execution Instructions

### Run the Full E2E Test Suite
```bash
node tests/e2e_test_suite.js
```

### Run Existing Quant Model Acceptance Tests
```bash
node tests/test_quant_models.js
```

### Verification Criteria
- Exit Code: `0`
- Zero failed assertions (`0 FAILED`).
- Complete logging of all test tiers with execution duration and detailed diagnostic messages.
