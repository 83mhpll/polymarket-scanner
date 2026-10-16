// ══════════════════════════════════════════════════════════════════════
//  tests/test_milestone_m2.js — Milestone M2 Institutional Quant Test Suite
//  NegRisk Arbitrage, Cross-Market Bounds, 1c Dust Sniper & De-vigging Stabilization
// ══════════════════════════════════════════════════════════════════════

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanNegRiskOpps, KELLY_CEILING_PERCENT } from '../negrisk_arbitrage.js';
import { scanCrossMarketOpps, MAX_CROSS_KELLY_PERCENT } from '../cross_market_arbitrage.js';
import { scan1cOpps, MAX_DUST_KELLY_PERCENT } from '../dust_sniper_1c.js';
import {
  solveShinDevig,
  solvePowerDevig,
  solveMultiplicativeDevig,
  devig,
  devigMarket
} from '../engine/devigging.js';
import { calculateDynamicFee, calculateTakerFeePerShare, getFeeRate } from '../engine/dynamic_fees.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleMarketsPath = path.join(__dirname, '..', 'sample_markets.json');

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

console.log('===============================================================');
console.log('  RUNNING MILESTONE M2 QUANTITATIVE & ARBITRAGE TEST SUITE');
console.log('===============================================================\n');

// ─────────────────────────────────────────────────────────────────────
// [Suite 1] Hardened Negative Risk Implied Sum Arbitrage
// ─────────────────────────────────────────────────────────────────────
console.log('[Suite 1] Hardened Negative Risk Arbitrage Engine');

runTest('NegRisk: Rejection of non-NegRisk events (negRisk: false or missing)', () => {
  const nonNegRiskMarkets = [
    {
      id: 'm1',
      question: 'Will Event A happen?',
      closed: false,
      active: true,
      negRisk: false,
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.20", "0.80"]',
      clobTokenIds: '["tok1", "tok2"]'
    },
    {
      id: 'm2',
      question: 'Will Event B happen?',
      closed: false,
      active: true,
      negRisk: false,
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.30", "0.70"]',
      clobTokenIds: '["tok3", "tok4"]'
    }
  ];
  const opps = scanNegRiskOpps(nonNegRiskMarkets);
  assert.equal(opps.length, 0, 'Must reject markets without negRisk: true');
});

runTest('NegRisk: Strict grouping by negRiskMarketID across identical titles', () => {
  const pools = [
    // Pool 1
    {
      id: 'm1',
      question: 'Candidate X',
      closed: false,
      active: true,
      negRisk: true,
      negRiskMarketID: 'pool_alpha',
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.40", "0.60"]',
      clobTokenIds: '["t1", "t2"]',
      events: [{ title: 'Presidential Race', slug: 'race-alpha' }]
    },
    {
      id: 'm2',
      question: 'Candidate Y',
      closed: false,
      active: true,
      negRisk: true,
      negRiskMarketID: 'pool_alpha',
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.40", "0.60"]',
      clobTokenIds: '["t3", "t4"]',
      events: [{ title: 'Presidential Race', slug: 'race-alpha' }]
    },
    // Pool 2 (same title, different pool ID)
    {
      id: 'm3',
      question: 'Candidate A',
      closed: false,
      active: true,
      negRisk: true,
      negRiskMarketID: 'pool_beta',
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.45", "0.55"]',
      clobTokenIds: '["t5", "t6"]',
      events: [{ title: 'Presidential Race', slug: 'race-beta' }]
    },
    {
      id: 'm4',
      question: 'Candidate B',
      closed: false,
      active: true,
      negRisk: true,
      negRiskMarketID: 'pool_beta',
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.45", "0.55"]',
      clobTokenIds: '["t7", "t8"]',
      events: [{ title: 'Presidential Race', slug: 'race-beta' }]
    }
  ];

  const opps = scanNegRiskOpps(pools);
  // Both pools are underpriced (0.80 and 0.90 net costs < 1.00)
  assert(opps.length >= 2, 'Should evaluate pools independently');
  const poolIds = opps.map(o => o.negRiskMarketID);
  assert(poolIds.includes('pool_alpha'));
  assert(poolIds.includes('pool_beta'));
});

runTest('NegRisk: Executable CLOB Best Ask prioritization over midpoint', () => {
  const pool = [
    {
      id: 'm1',
      question: 'Choice 1',
      closed: false,
      active: true,
      negRisk: true,
      negRiskMarketID: 'pool_clob_test',
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.20", "0.80"]', // midpoint 0.20
      bestAsk: 0.25,                     // executable ask 0.25
      bestAsks: [0.25, 0.77],
      clobTokenIds: '["t1", "t2"]',
      events: [{ title: 'CLOB Test Event', slug: 'clob-test' }]
    },
    {
      id: 'm2',
      question: 'Choice 2',
      closed: false,
      active: true,
      negRisk: true,
      negRiskMarketID: 'pool_clob_test',
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.20", "0.80"]', // midpoint 0.20
      bestAsk: 0.25,                     // executable ask 0.25
      bestAsks: [0.25, 0.77],
      clobTokenIds: '["t3", "t4"]',
      events: [{ title: 'CLOB Test Event', slug: 'clob-test' }]
    }
  ];

  const opps = scanNegRiskOpps(pool);
  assert.equal(opps.length, 1);
  assert.equal(opps[0].sumYesPrice, 0.50, 'Must sum best asks (0.25 + 0.25 = 0.50), not midpoints (0.40)');
  assert.equal(opps[0].outcomes[0].bestAsk, 0.25);
  assert.equal(opps[0].outcomes[0].pricingSource, 'market_best_ask');
});

runTest('NegRisk: Dynamic venue fee deduction and fee threshold elimination', () => {
  // 5 legs in crypto category (7% fee rate) at ask 0.18 (sum ask = 0.90)
  // Leg fee = 1 * 0.07 * 0.18 * 0.82 = 0.010332
  // Total fees = 5 * 0.010332 = 0.05166
  // Net cost = 0.90 + 0.05166 = 0.95166
  // Net profit = 1.00 - 0.95166 = 0.04834
  const cryptoPool = [];
  for (let i = 0; i < 5; i++) {
    cryptoPool.push({
      id: `c_${i}`,
      question: `Crypto Option ${i}`,
      closed: false,
      active: true,
      negRisk: true,
      negRiskMarketID: 'pool_crypto_fees',
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.18", "0.82"]',
      bestAsk: 0.18,
      clobTokenIds: [`tok_c_${i}`, `tok_c_no_${i}`],
      description: 'bitcoin crypto token',
      events: [{ title: 'Bitcoin Multi Choice', slug: 'btc-multi' }]
    });
  }

  const opps = scanNegRiskOpps(cryptoPool);
  assert.equal(opps.length, 1);
  assert.equal(opps[0].grossProfitUsd, 0.10); // 1.00 - 0.90
  assert(Math.abs(opps[0].totalFeesUsd - 0.0517) < 0.001);
  assert(Math.abs(opps[0].profitUsd - 0.048) < 0.002, `Net profit should reflect fees: got ${opps[0].profitUsd}`);

  // Test Fee Threshold Elimination: sum ask = 0.97. Fees = ~0.045 => net cost = 1.015 > 1.00
  const tightPool = [];
  for (let i = 0; i < 5; i++) {
    tightPool.push({
      id: `t_${i}`,
      question: `Tight Option ${i}`,
      closed: false,
      active: true,
      negRisk: true,
      negRiskMarketID: 'pool_tight_fees',
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.194", "0.806"]',
      bestAsk: 0.194, // 5 * 0.194 = 0.97
      clobTokenIds: [`tok_t_${i}`, `tok_t_no_${i}`],
      events: [{ title: 'Tight Pool', slug: 'tight-pool' }]
    });
  }
  const tightOpps = scanNegRiskOpps(tightPool);
  assert.equal(tightOpps.length, 0, 'Opportunity where taker fees erase gross edge must be rejected');
});

runTest('NegRisk: Institutional 10% Kelly allocation ceiling', () => {
  // Pool with huge gross ROI
  const deepDiscountPool = [
    {
      id: 'd1',
      question: 'Discount A',
      closed: false,
      active: true,
      negRisk: true,
      negRiskMarketID: 'pool_discount',
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.15", "0.85"]',
      bestAsk: 0.15,
      clobTokenIds: ['td1', 'td2'],
      events: [{ title: 'Discount Event', slug: 'discount' }]
    },
    {
      id: 'd2',
      question: 'Discount B',
      closed: false,
      active: true,
      negRisk: true,
      negRiskMarketID: 'pool_discount',
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.15", "0.85"]',
      bestAsk: 0.15,
      clobTokenIds: ['td3', 'td4'],
      events: [{ title: 'Discount Event', slug: 'discount' }]
    }
  ];

  const opps = scanNegRiskOpps(deepDiscountPool);
  assert.equal(opps.length, 1);
  assert(opps[0].kellyPositionPercent <= KELLY_CEILING_PERCENT, `Kelly must be <= 10.0%, got ${opps[0].kellyPositionPercent}`);
  assert.equal(opps[0].kellyPositionPercent, 10.0);
});

runTest('NegRisk: Real sample dataset execution', () => {
  if (fs.existsSync(sampleMarketsPath)) {
    const rawMarkets = JSON.parse(fs.readFileSync(sampleMarketsPath, 'utf8'));
    const opps = scanNegRiskOpps(rawMarkets);
    assert.equal(opps.length, 1, 'Should find exactly 1 NegRisk opportunity in sample dataset');
    assert.equal(opps[0].title, 'Democratic Presidential Nominee 2028');
    assert.equal(opps[0].outcomeCount, 20);
    assert(opps[0].profitUsd > 0.15 && opps[0].profitUsd < 0.20, `Net profit should be ~0.174, got ${opps[0].profitUsd}`);
    assert(opps[0].profitPercent > 20.0 && opps[0].profitPercent < 25.0);
    assert.equal(opps[0].kellyPositionPercent, 10.0);
  }
});

runTest('NegRisk: Overpriced basket conversion/merge arbitrage with bid venue fees', () => {
  const overpricedPool = [
    {
      id: 'op1',
      question: 'Outcome 1',
      closed: false,
      active: true,
      negRisk: true,
      negRiskMarketID: 'pool_overpriced',
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.60", "0.40"]',
      bestBid: 0.58,
      bestAsk: 0.62,
      clobTokenIds: ['top1', 'top2'],
      events: [{ title: 'Overpriced Event', slug: 'overpriced' }]
    },
    {
      id: 'op2',
      question: 'Outcome 2',
      closed: false,
      active: true,
      negRisk: true,
      negRiskMarketID: 'pool_overpriced',
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.60", "0.40"]',
      bestBid: 0.58,
      bestAsk: 0.62,
      clobTokenIds: ['top3', 'top4'],
      events: [{ title: 'Overpriced Event', slug: 'overpriced' }]
    }
  ];

  // Sum best bid = 0.58 + 0.58 = 1.16 > 1.00
  const opps = scanNegRiskOpps(overpricedPool);
  assert.equal(opps.length, 1);
  assert.equal(opps[0].type, 'negrisk_overpriced');
  assert.equal(opps[0].strategy, 'NegRisk Adapter Convert / Merge');
  assert(opps[0].profitUsd > 0.10);
  assert(opps[0].kellyPositionPercent <= KELLY_CEILING_PERCENT);
});

// ─────────────────────────────────────────────────────────────────────
// [Suite 2] Hardened Kolmogorov Cross-Market Arbitrage
// ─────────────────────────────────────────────────────────────────────
console.log('\n[Suite 2] Kolmogorov Cross-Market Arbitrage Engine');

runTest('Cross-Market: Flags bound violation when P(Child) > P(Parent)', () => {
  const markets = [
    // Parent: Fed rate cut in December (any cut) @ 0.40
    {
      id: 'parent_cut',
      question: 'Will the Fed decrease rates in December?',
      closed: false,
      active: true,
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.40", "0.60"]',
      clobTokenIds: ['p1', 'p2'],
      volume24hr: 25000,
      slug: 'fed-cut-december'
    },
    // Child: Fed rate cut by 50+ bps in December @ 0.55
    // Kolmogorov violation: P(cut >= 50 bps) > P(any cut)!
    {
      id: 'child_cut',
      question: 'Will the Fed decrease rates by 50+ bps in December?',
      closed: false,
      active: true,
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.55", "0.45"]',
      clobTokenIds: ['c1', 'c2'],
      volume24hr: 5000,
      slug: 'fed-cut-50bps-december'
    }
  ];

  const opps = scanCrossMarketOpps(markets);
  assert.equal(opps.length, 1, 'Should flag 1 Kolmogorov bound violation');
  assert.equal(opps[0].expectedAdjustment, 'SELL CHILD (Violates P(Child) <= P(Parent))');
  assert(opps[0].netEdge > 0, 'Net edge must be positive after fees');
  assert(opps[0].kellyPositionPercent <= MAX_CROSS_KELLY_PERCENT);
  assert(opps[0].kellyPositionPercent > 0);
});

runTest('Cross-Market: Discards mathematically normal subsets when P(Child) <= P(Parent)', () => {
  const normalMarkets = [
    {
      id: 'parent_cut',
      question: 'Will the Fed decrease rates in December?',
      closed: false,
      active: true,
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.85", "0.15"]',
      clobTokenIds: ['p1', 'p2'],
      slug: 'fed-cut-december'
    },
    {
      id: 'child_cut',
      question: 'Will the Fed decrease rates by 50+ bps in December?',
      closed: false,
      active: true,
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.15", "0.85"]',
      clobTokenIds: ['c1', 'c2'],
      slug: 'fed-cut-50bps-december'
    }
  ];

  const opps = scanCrossMarketOpps(normalMarkets);
  assert.equal(opps.length, 0, 'Must NOT flag normal subsets (0.15 <= 0.85 is valid Kolmogorov ordering)');
});

runTest('Cross-Market: Strict entity resolution rejects spurious keyword overlap', () => {
  const spuriousMarkets = [
    {
      id: 'trump_prison',
      question: 'Will Donald Trump be sentenced to prison before the presidential election?',
      closed: false,
      active: true,
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.65", "0.35"]',
      clobTokenIds: ['sp1', 'sp2'],
      slug: 'trump-sentencing'
    },
    {
      id: 'trump_win',
      question: 'Will Donald Trump win the 2024 presidential election?',
      closed: false,
      active: true,
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.50", "0.50"]',
      clobTokenIds: ['sp3', 'sp4'],
      slug: 'trump-election'
    }
  ];

  const opps = scanCrossMarketOpps(spuriousMarkets);
  assert.equal(opps.length, 0, 'Must NOT link prison sentencing and election victory');
});

runTest('Cross-Market: Rates and Senate seats hierarchy validation', () => {
  // Test Senate seats: GOP win 53+ seats (0.60) vs GOP control Senate (0.50)
  const senateMarkets = [
    {
      id: 'gop_control',
      question: 'Will Republican control the Senate in 2024?',
      closed: false,
      active: true,
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.50", "0.50"]',
      clobTokenIds: ['s1', 's2'],
      slug: 'gop-control-senate'
    },
    {
      id: 'gop_53',
      question: 'Will Republican win 53+ Senate seats in 2024?',
      closed: false,
      active: true,
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.60", "0.40"]',
      clobTokenIds: ['s3', 's4'],
      slug: 'gop-53-seats'
    }
  ];

  const opps = scanCrossMarketOpps(senateMarkets);
  assert.equal(opps.length, 1);
  assert.equal(opps[0].domain, 'politics_seats');
  assert(opps[0].grossSpread > 0);
  assert(opps[0].netEdge > 0);
});

runTest('Cross-Market: Politics nomination vs election hierarchy', () => {
  const nomMarkets = [
    {
      id: 'jd_nom',
      question: 'Will JD Vance win the 2028 Republican presidential nomination?',
      closed: false,
      active: true,
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.20", "0.80"]',
      clobTokenIds: ['jd1', 'jd2'],
      slug: 'jd-vance-nomination'
    },
    {
      id: 'jd_pres',
      question: 'Will JD Vance win the 2028 presidential election?',
      closed: false,
      active: true,
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.35", "0.65"]', // 0.35 > 0.20 violates P(presidency) <= P(nomination)
      clobTokenIds: ['jd3', 'jd4'],
      slug: 'jd-vance-election'
    }
  ];

  const opps = scanCrossMarketOpps(nomMarkets);
  assert.equal(opps.length, 1);
  assert.equal(opps[0].domain, 'politics_nomination');
  assert.equal(opps[0].expectedAdjustment, 'SELL CHILD (Violates P(Child) <= P(Parent))');
});

runTest('Cross-Market: Crypto strike price hierarchy P(BTC >= 120k) <= P(BTC >= 100k)', () => {
  const btcMarkets = [
    {
      id: 'btc_100',
      question: 'Will Bitcoin reach $100k in 2024?',
      closed: false,
      active: true,
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.45", "0.55"]',
      clobTokenIds: ['b1', 'b2'],
      slug: 'btc-100k'
    },
    {
      id: 'btc_120',
      question: 'Will Bitcoin reach $120k in 2024?',
      closed: false,
      active: true,
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.60", "0.40"]', // 0.60 > 0.45 violates monotonicity!
      clobTokenIds: ['b3', 'b4'],
      slug: 'btc-120k'
    }
  ];

  const opps = scanCrossMarketOpps(btcMarkets);
  assert.equal(opps.length, 1);
  assert.equal(opps[0].domain, 'crypto_strike');
  assert(opps[0].netEdge > 0);
});

// ─────────────────────────────────────────────────────────────────────
// [Suite 3] Calibrated 1¢ Dust Sweeper Engine
// ─────────────────────────────────────────────────────────────────────
console.log('\n[Suite 3] Calibrated 1¢ Dust Sweeper Engine');

runTest('Dust Sniper: Eliminates fabricated win rate floor on binary markets', () => {
  // Binary market like Stephen A. Smith (0.0105 / 0.9895)
  const stephenMarket = {
    id: 'stephen_a',
    question: 'Will Stephen A. Smith win the 2028 Democratic presidential nomination?',
    closed: false,
    active: true,
    outcomes: '["Yes", "No"]',
    outcomePrices: '["0.0105", "0.9895"]',
    clobTokenIds: ['tok1', 'tok2'],
    description: 'democratic politics election'
  };

  // Default opportunity scanner filters for positive EV
  const opps = scan1cOpps([stephenMarket]);
  assert.equal(opps.length, 0, 'Fair binary 1c share must not produce positive EV opportunity');

  // Inspection mode without filter verifies calibrated negative EV and 0% Kelly
  const evaluated = scan1cOpps([stephenMarket], { filterPositiveEv: false });
  assert.equal(evaluated.length, 1);
  assert(evaluated[0].estWinProb <= 0.0105, `Probability must not be inflated to 0.25: got ${evaluated[0].estWinProb}`);
  assert(evaluated[0].ev < 0, `EV must be negative after taker fees: got ${evaluated[0].ev}`);
  assert.equal(evaluated[0].kellyPositionPercent, 0.0, 'Kelly size on negative EV must be 0%');
});

runTest('Dust Sniper: Strict <= 0.5% bankroll risk cap under synthetic high edge', () => {
  // Synthetic fuzzed candidate in deep underround multi-outcome book
  const multiCandidateUnderround = {
    id: 'fuzzed_underround',
    question: 'Who will win the 2028 election?',
    closed: false,
    active: true,
    outcomes: '["Longshot", "Leader", "Third"]',
    outcomePrices: '["0.01", "0.50", "0.05"]', // sum = 0.56 (underround)
    clobTokenIds: ['t1', 't2', 't3']
  };

  const opps = scan1cOpps([multiCandidateUnderround]);
  assert.equal(opps.length, 1);
  assert(opps[0].ev > 0, 'Underround longshot has positive EV');
  assert(opps[0].kellyPositionPercent <= MAX_DUST_KELLY_PERCENT, `Kelly must be <= 0.50%: got ${opps[0].kellyPositionPercent}`);
  assert(opps[0].kellyPositionPercent > 0.0);
});

runTest('Dust Sniper: Multi-outcome residual allocation invariant', () => {
  // In a 20-candidate race with leader at 0.70, residual is 0.30
  // Fair share per non-leader candidate is 0.30 / 19 = 0.01578
  const outcomes = ['Leader', ...Array.from({ length: 19 }, (_, i) => `Candidate ${i + 1}`)];
  const prices = [0.70, ...Array.from({ length: 19 }, () => 0.02)]; // sum = 1.08
  const market = {
    id: 'race_20',
    question: '2028 Multi-Candidate Field',
    closed: false,
    active: true,
    outcomes: JSON.stringify(outcomes),
    outcomePrices: JSON.stringify(prices),
    clobTokenIds: JSON.stringify(Array.from({ length: 20 }, (_, i) => `tok_${i}`))
  };

  const evaluated = scan1cOpps([market], { filterPositiveEv: false });
  assert.equal(evaluated.length, 19);
  for (const item of evaluated) {
    assert(item.estWinProb <= (0.30 / 19) + 1e-4, `Longshot win prob ${item.estWinProb} exceeds residual share`);
    assert(item.kellyPositionPercent <= MAX_DUST_KELLY_PERCENT);
  }
});

// ─────────────────────────────────────────────────────────────────────
// [Suite 4] Stabilized De-vigging Solvers (Shin & Power)
// ─────────────────────────────────────────────────────────────────────
console.log('\n[Suite 4] Stabilized De-vigging Solvers');

runTest('Devig: Shin (1993) eliminates floating-point cancellation for z -> 1', () => {
  const extremeNear1 = [
    [0.99, 0.99],
    [0.999, 0.999],
    [0.9999, 0.9999],
    [0.99999, 0.99999],
    [0.999999, 0.999999]
  ];
  for (const tc of extremeNear1) {
    const res = solveShinDevig(tc);
    assert(!isNaN(res.z), 'z must not be NaN');
    assert(isFinite(res.z), 'z must be finite');
    assert(res.z > 0.95 && res.z <= 1.0, `z out of range: ${res.z}`);
    const sum = res.trueProbs.reduce((a, b) => a + b, 0);
    assert(Math.abs(sum - 1.0) < 1e-12, `Sum != 1.0: ${sum}`);
    assert(Math.abs(res.trueProbs[0] - 0.5) < 1e-10);
  }
});

runTest('Devig: Analytical theorem z* = s - 1 for symmetric binary books across [0.0001, 0.999]', () => {
  const targetZs = [0.0001, 0.001, 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99, 0.999];
  for (const targetZ of targetZs) {
    const s = 1.0 + targetZ;
    const q0 = s / 2.0;
    const res = solveShinDevig([q0, q0]);
    assert(Math.abs(res.z - targetZ) < 1e-9, `Target z*=${targetZ} failed: got ${res.z}`);
    assert(res.iterations > 0 && res.iterations <= 60);
  }
});

runTest('Devig: Extreme asymmetric quotes converge smoothly in Shin', () => {
  const asymBooks = [
    [0.999, 0.05],
    [0.9999, 0.001],
    [0.99999, 0.0001],
    [0.70, 0.40, 1e-6],
    [0.95, 0.04, 0.04]
  ];
  for (const book of asymBooks) {
    const res = solveShinDevig(book);
    assert(res.z >= 0.0 && res.z <= 1.0);
    const sum = res.trueProbs.reduce((a, b) => a + b, 0);
    assert(Math.abs(sum - 1.0) < 1e-9);
    for (const p of res.trueProbs) {
      assert(p > 0 && p < 1.0 && isFinite(p) && !isNaN(p));
    }
  }
});

runTest('Devig: Power Method input validation rejects qi >= 1.0 with RangeError', () => {
  assert.throws(
    () => solvePowerDevig([1.0, 0.2]),
    { name: 'RangeError', message: /strictly less than 1\.0/ }
  );
  assert.throws(
    () => solvePowerDevig([1.05, 0.2]),
    { name: 'RangeError', message: /strictly less than 1\.0/ }
  );
  assert.throws(
    () => solvePowerDevig([0.5, 1.0]),
    { name: 'RangeError', message: /strictly less than 1\.0/ }
  );
});

runTest('Devig: Power Method Safeguarded Newton-Raphson across extreme overrounds and underrounds', () => {
  const extremeOverrounds = [
    [0.500005, 0.500005], // s = 1.00001
    [0.55, 0.55],         // s = 1.10
    [0.75, 0.75],         // s = 1.50
    [0.90, 0.90],         // s = 1.80
    [0.90, 0.80, 0.80]    // s = 2.50
  ];
  for (const book of extremeOverrounds) {
    const res = solvePowerDevig(book);
    assert(res.r >= 1.0);
    const sum = res.trueProbs.reduce((a, b) => a + b, 0);
    assert(Math.abs(sum - 1.0) < 1e-12);
  }

  // Underround book
  const under = solvePowerDevig([0.48, 0.48]);
  assert(under.r > 0.0 && under.r < 1.0);
  const sumUnder = under.trueProbs.reduce((a, b) => a + b, 0);
  assert(Math.abs(sumUnder - 1.0) < 1e-12);
});

runTest('Devig: Power Method high outcome count (N = 50) converges reliably', () => {
  const book50 = new Array(50).fill(0.025); // sum = 1.25
  const res50 = solvePowerDevig(book50);
  assert(res50.r > 1.0);
  const sum50 = res50.trueProbs.reduce((a, b) => a + b, 0);
  assert(Math.abs(sum50 - 1.0) < 1e-12);
  for (const p of res50.trueProbs) {
    assert(Math.abs(p - 0.02) < 1e-5);
  }
});

runTest('Devig: devigMarket boundary and zero-bid sanitization (bidYes = 0.0)', () => {
  const resZeroBidShin = devigMarket(0.0, 0.50, 'shin');
  assert(resZeroBidShin.trueProbYes > 0 && resZeroBidShin.trueProbNo > 0);
  assert(Math.abs(resZeroBidShin.trueProbYes + resZeroBidShin.trueProbNo - 1.0) < 1e-9);

  const resZeroBidPower = devigMarket(0.0, 0.50, 'power');
  assert(resZeroBidPower.trueProbYes > 0 && resZeroBidPower.trueProbNo > 0);
  assert(Math.abs(resZeroBidPower.trueProbYes + resZeroBidPower.trueProbNo - 1.0) < 1e-9);

  const resCrossed = devigMarket(0.60, 0.50, 'shin');
  assert(Math.abs(resCrossed.trueProbYes - 0.55) < 1e-12);
  assert(Math.abs(resCrossed.trueProbNo - 0.45) < 1e-12);
});

console.log('\n===============================================================');
console.log(`  MILESTONE M2 TEST RESULTS: ${passedTests}/${totalTests} PASSED (0 FAILED)`);
console.log('===============================================================\n');
