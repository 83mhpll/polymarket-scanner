// ══════════════════════════════════════════════════════════════════════
//  tests/test_adversarial_m2_arbitrage.js
//  Empirical Adversarial Challenge Suite for Milestone M2 Arbitrage Modules
//  Roles: Critic, Specialist (Empirical Challenger)
// ══════════════════════════════════════════════════════════════════════

import assert from 'node:assert/strict';
import { scanNegRiskOpps, KELLY_CEILING_PERCENT, MIN_NET_EDGE_USD } from '../negrisk_arbitrage.js';
import { scanCrossMarketOpps, MAX_CROSS_KELLY_PERCENT, MIN_CROSS_NET_EDGE } from '../cross_market_arbitrage.js';
import { scan1cOpps, MAX_DUST_KELLY_PERCENT } from '../dust_sniper_1c.js';
import { calculateDynamicFee, calculateTakerFeePerShare, getFeeRate } from '../engine/dynamic_fees.js';

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

console.log('===============================================================');
console.log('  CHALLENGER M2-1: EMPIRICAL ADVERSARIAL STRESS SUITE');
console.log('===============================================================\n');

// ─────────────────────────────────────────────────────────────────────
// 1. NEGRISK ARBITRAGE EMPIRICAL ADVERSARIAL VERIFICATION
// ─────────────────────────────────────────────────────────────────────
console.log('[Component 1] negrisk_arbitrage.js Stress Verification');

runTest('NegRisk-1: Strict filtering of non-negRisk markets across all falsy/null/missing schemas', () => {
  const testCases = [
    { name: 'negRisk: false', market: { negRisk: false } },
    { name: 'negRisk: null', market: { negRisk: null } },
    { name: 'negRisk: undefined', market: {} },
    { name: 'negRisk: 0', market: { negRisk: 0 } },
    { name: 'negRisk: "false"', market: { negRisk: "false" } },
    { name: 'negRisk: "0"', market: { negRisk: "0" } },
    { name: 'events[0].negRisk: false', market: { events: [{ negRisk: false }] } },
    { name: 'events[0].negRisk: "false"', market: { events: [{ negRisk: "false" }] } },
    { name: 'events[0].enableNegRisk: false', market: { events: [{ enableNegRisk: false }] } },
    { name: 'empty events array', market: { events: [] } },
    { name: 'events null', market: { events: null } }
  ];

  for (const tc of testCases) {
    const m1 = {
      ...tc.market,
      id: 'm1',
      question: 'Will Outcome A happen?',
      active: true,
      closed: false,
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.20", "0.80"]',
      clobTokenIds: '["tok1", "tok2"]'
    };
    const m2 = {
      ...tc.market,
      id: 'm2',
      question: 'Will Outcome B happen?',
      active: true,
      closed: false,
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.20", "0.80"]',
      clobTokenIds: '["tok3", "tok4"]'
    };
    const opps = scanNegRiskOpps([m1, m2]);
    assert.equal(opps.length, 0, `Failed for schema ${tc.name}: non-negRisk market was not rejected!`);
  }
});

runTest('NegRisk-2: Taker venue fee deduction and fee-eroded pool rejection', () => {
  // Scenario A: 5 legs in crypto (feeRate = 0.07).
  // Each leg ask = 0.19. Gross sum = 0.95.
  // Gross profit = 1.00 - 0.95 = 0.05 (5%).
  // Fee per leg = 1 * 0.07 * 0.19 * (1 - 0.19) = 0.010773 -> 0.01077.
  // Total fees for 5 legs = 5 * 0.01077 = 0.05385.
  // Net cost = 0.95 + 0.05385 = 1.00385 > 1.00!
  // Gross profit is +$0.05, but Net profit is -$0.00385 (eroded by fees).
  const erodedPool = [];
  for (let i = 0; i < 5; i++) {
    erodedPool.push({
      id: `m_${i}`,
      question: `Crypto Coin ${i} Surge`,
      active: true,
      closed: false,
      negRisk: true,
      negRiskMarketID: 'crypto_pool_eroded',
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.19", "0.81"]',
      bestAsk: 0.19,
      clobTokenIds: [`t_${i}`, `t_no_${i}`],
      description: 'crypto token event'
    });
  }

  const oppsEroded = scanNegRiskOpps(erodedPool);
  assert.equal(oppsEroded.length, 0, 'Pool where taker fees erode gross profit to <= 0 must be rejected');

  // Scenario B: Margin just above MIN_NET_EDGE_USD ($0.005)
  // 5 legs in weather (feeRate = 0.05). Ask = 0.18. Gross sum = 0.90. Gross profit = 0.10.
  // Fee per leg = 1 * 0.05 * 0.18 * 0.82 = 0.00738.
  // Total fees = 5 * 0.00738 = 0.0369.
  // Net cost = 0.90 + 0.0369 = 0.9369. Net profit = 0.0631 >= 0.005.
  const viablePool = [];
  for (let i = 0; i < 5; i++) {
    viablePool.push({
      id: `w_${i}`,
      question: `Weather Station ${i} Rain`,
      active: true,
      closed: false,
      negRisk: true,
      negRiskMarketID: 'weather_pool_viable',
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.18", "0.82"]',
      bestAsk: 0.18,
      clobTokenIds: [`tw_${i}`, `tw_no_${i}`],
      description: 'weather precipitation'
    });
  }

  const oppsViable = scanNegRiskOpps(viablePool);
  assert.equal(oppsViable.length, 1, 'Viable pool with positive net edge must be accepted');
  assert(oppsViable[0].profitUsd > 0.06, 'Net profit must reflect exact fee deductions');
  assert(oppsViable[0].totalFeesUsd > 0.035, 'Total fees must be deducted');
  assert.equal(oppsViable[0].grossProfitUsd, 0.10);

  // Scenario C: Borderline net profit right below MIN_NET_EDGE_USD ($0.005)
  // Let's configure a pool where net profit is exactly $0.003
  // In politics (feeRate = 0.04). 2 legs at ask = 0.490. Sum ask = 0.980.
  // Fee per leg = 0.04 * 0.49 * 0.51 = 0.009996 -> 0.01000.
  // Total fees = 0.02000. Net cost = 0.980 + 0.02000 = 1.0000. Net profit = 0.0000 < 0.005.
  const borderlinePool = [
    {
      id: 'b1',
      question: 'Politics Choice 1',
      active: true,
      closed: false,
      negRisk: true,
      negRiskMarketID: 'pool_borderline',
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.49", "0.51"]',
      bestAsk: 0.49,
      clobTokenIds: ['tb1', 'tb2'],
      description: 'politics candidate'
    },
    {
      id: 'b2',
      question: 'Politics Choice 2',
      active: true,
      closed: false,
      negRisk: true,
      negRiskMarketID: 'pool_borderline',
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.49", "0.51"]',
      bestAsk: 0.49,
      clobTokenIds: ['tb3', 'tb4'],
      description: 'politics candidate'
    }
  ];
  const oppsBorderline = scanNegRiskOpps(borderlinePool);
  assert.equal(oppsBorderline.length, 0, 'Borderline pool with net profit < $0.005 must be rejected');
});

runTest('NegRisk-3: Kelly sizing invariant (never exceeds 10% under any circumstance)', () => {
  // Extreme discount pool: Sum ask = 0.12 (net profit ~ 0.86, raw Kelly ~ 95%+)
  const deepPool = [
    {
      id: 'dp1',
      question: 'Deep Discount 1',
      active: true,
      closed: false,
      negRisk: true,
      negRiskMarketID: 'pool_deep_discount',
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.06", "0.94"]',
      bestAsk: 0.06,
      clobTokenIds: ['td1', 'td2']
    },
    {
      id: 'dp2',
      question: 'Deep Discount 2',
      active: true,
      closed: false,
      negRisk: true,
      negRiskMarketID: 'pool_deep_discount',
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.06", "0.94"]',
      bestAsk: 0.06,
      clobTokenIds: ['td3', 'td4']
    }
  ];

  const oppsDeep = scanNegRiskOpps(deepPool);
  assert.equal(oppsDeep.length, 1);
  assert.equal(oppsDeep[0].kellyPositionPercent, 10.0, 'Kelly size must be capped at exactly 10.0%');

  // Monte Carlo Stress / Fuzzing across 200 random market pools
  for (let trial = 0; trial < 200; trial++) {
    const numLegs = 2 + Math.floor(Math.random() * 8); // 2 to 9 legs
    const pool = [];
    const targetSum = 0.15 + Math.random() * 0.80; // Sum ask between 0.15 and 0.95
    const baseAsk = targetSum / numLegs;

    for (let l = 0; l < numLegs; l++) {
      pool.push({
        id: `fuzz_${trial}_${l}`,
        question: `Fuzz Leg ${l}`,
        active: true,
        closed: false,
        negRisk: true,
        negRiskMarketID: `pool_fuzz_${trial}`,
        outcomes: '["Yes", "No"]',
        outcomePrices: [baseAsk.toFixed(3), (1 - baseAsk).toFixed(3)],
        bestAsk: baseAsk,
        clobTokenIds: [`f_${trial}_${l}_y`, `f_${trial}_${l}_n`]
      });
    }

    const opps = scanNegRiskOpps(pool);
    for (const opp of opps) {
      assert(
        opp.kellyPositionPercent <= KELLY_CEILING_PERCENT,
        `Kelly violated 10% ceiling in trial ${trial}: got ${opp.kellyPositionPercent}%`
      );
      assert(
        opp.kellyPositionPercent >= 0.0,
        `Kelly must not be negative: got ${opp.kellyPositionPercent}%`
      );
      assert(!isNaN(opp.kellyPositionPercent), 'Kelly must not be NaN');
    }
  }
});

runTest('NegRisk-4: CLOB orderbook priority and non-viable book rejection', () => {
  // If midpoint says sum = 0.80 (profitable), but orderbook bestAsk says sum = 1.05 (unprofitable)
  const orderbookMap = new Map();
  orderbookMap.set('tok_clob_1', { bestAsk: 0.55, bestBid: 0.40 });
  orderbookMap.set('tok_clob_2', { bestAsk: 0.50, bestBid: 0.40 });

  const poolWithBooks = [
    {
      id: 'cb1',
      question: 'CLOB Leg 1',
      active: true,
      closed: false,
      negRisk: true,
      negRiskMarketID: 'pool_clob_override',
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.40", "0.60"]', // midpoint sum = 0.80
      clobTokenIds: '["tok_clob_1", "tok_clob_1_no"]'
    },
    {
      id: 'cb2',
      question: 'CLOB Leg 2',
      active: true,
      closed: false,
      negRisk: true,
      negRiskMarketID: 'pool_clob_override',
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.40", "0.60"]', // midpoint sum = 0.80
      clobTokenIds: '["tok_clob_2", "tok_clob_2_no"]'
    }
  ];

  const opps = scanNegRiskOpps(poolWithBooks, {
    orderbookLookup: (tokenID) => orderbookMap.get(tokenID)
  });

  // Since orderbook bestAsks sum to 0.55 + 0.50 = 1.05 > 1.00, it MUST be rejected!
  assert.equal(opps.length, 0, 'Must use live CLOB ask (1.05) and reject opportunity, ignoring midpoints (0.80)');
});

// ─────────────────────────────────────────────────────────────────────
// 2. CROSS-MARKET ARBITRAGE EMPIRICAL ADVERSARIAL VERIFICATION
// ─────────────────────────────────────────────────────────────────────
console.log('\n[Component 2] cross_market_arbitrage.js Stress Verification');

runTest('CrossMarket-1: Normal subset conditions P(Child) <= P(Parent) NEVER trigger signals', () => {
  // Legitimate subset cases across all domains
  const legitimateCases = [
    // Domain 1: Rates
    {
      p: { q: 'Will the Fed decrease rates in December?', price: 0.75 },
      c: { q: 'Will the Fed decrease rates by 50+ bps in December?', price: 0.25 }
    },
    {
      p: { q: 'Will the Fed decrease rates in December?', price: 0.50 },
      c: { q: 'Will the Fed decrease rates by 25+ bps in December?', price: 0.50 } // Equality
    },
    // Domain 2: Politics Seats
    {
      p: { q: 'Will Republican control the Senate in 2024?', price: 0.70 },
      c: { q: 'Will Republican win 53+ Senate seats in 2024?', price: 0.35 }
    },
    // Domain 3: Politics Nomination
    {
      p: { q: 'Will Kamala Harris win the 2024 Democratic presidential nomination?', price: 0.95 },
      c: { q: 'Will Kamala Harris win the 2024 presidential election?', price: 0.48 }
    },
    // Domain 4: Crypto Strike
    {
      p: { q: 'Will Bitcoin reach $100k in 2024?', price: 0.80 },
      c: { q: 'Will Bitcoin reach $120k in 2024?', price: 0.30 }
    },
    {
      p: { q: 'Will Ethereum reach $3,000 in 2024?', price: 0.65 },
      c: { q: 'Will Ethereum reach $4,000 in 2024?', price: 0.20 }
    }
  ];

  for (let idx = 0; idx < legitimateCases.length; idx++) {
    const tc = legitimateCases[idx];
    const markets = [
      {
        id: `legit_p_${idx}`,
        question: tc.p.q,
        active: true,
        closed: false,
        outcomes: '["Yes", "No"]',
        outcomePrices: [tc.p.price.toFixed(3), (1 - tc.p.price).toFixed(3)],
        clobTokenIds: ['tp1', 'tp2']
      },
      {
        id: `legit_c_${idx}`,
        question: tc.c.q,
        active: true,
        closed: false,
        outcomes: '["Yes", "No"]',
        outcomePrices: [tc.c.price.toFixed(3), (1 - tc.c.price).toFixed(3)],
        clobTokenIds: ['tc1', 'tc2']
      }
    ];

    const opps = scanCrossMarketOpps(markets);
    assert.equal(
      opps.length, 0,
      `False BUY/SELL signal triggered for legitimate subset "${tc.c.q}" (price ${tc.c.price}) <= "${tc.p.q}" (price ${tc.p.price})`
    );
  }
});

runTest('CrossMarket-2: True Kolmogorov violations P(Child) > P(Parent) are cleanly detected', () => {
  const violationCases = [
    // Rates violation: 50+ bps cut priced HIGHER than any cut
    {
      parent: { q: 'Will the Fed decrease rates in December?', price: 0.35, category: 'finance' },
      child: { q: 'Will the Fed decrease rates by 50+ bps in December?', price: 0.55, category: 'finance' },
      expectedDomain: 'rates'
    },
    // Senate seats violation: 53+ seats priced HIGHER than 51+ seats
    {
      parent: { q: 'Will Republican control the Senate in 2024?', price: 0.40, category: 'politics' },
      child: { q: 'Will Republican win 53+ Senate seats in 2024?', price: 0.60, category: 'politics' },
      expectedDomain: 'politics_seats'
    },
    // Nomination violation: Winning general priced HIGHER than nomination
    {
      parent: { q: 'Will JD Vance win the 2028 Republican presidential nomination?', price: 0.25, category: 'politics' },
      child: { q: 'Will JD Vance win the 2028 presidential election?', price: 0.45, category: 'politics' },
      expectedDomain: 'politics_nomination'
    },
    // Crypto strike violation: BTC 120k priced HIGHER than BTC 100k
    {
      parent: { q: 'Will Bitcoin reach $100k in 2024?', price: 0.40, category: 'crypto' },
      child: { q: 'Will Bitcoin reach $120k in 2024?', price: 0.65, category: 'crypto' },
      expectedDomain: 'crypto_strike'
    }
  ];

  for (let idx = 0; idx < violationCases.length; idx++) {
    const vc = violationCases[idx];
    const markets = [
      {
        id: `v_p_${idx}`,
        question: vc.parent.q,
        active: true,
        closed: false,
        outcomes: '["Yes", "No"]',
        outcomePrices: [vc.parent.price.toFixed(3), (1 - vc.parent.price).toFixed(3)],
        clobTokenIds: ['vp1', 'vp2'],
        description: vc.parent.category
      },
      {
        id: `v_c_${idx}`,
        question: vc.child.q,
        active: true,
        closed: false,
        outcomes: '["Yes", "No"]',
        outcomePrices: [vc.child.price.toFixed(3), (1 - vc.child.price).toFixed(3)],
        clobTokenIds: ['vc1', 'vc2'],
        description: vc.child.category
      }
    ];

    const opps = scanCrossMarketOpps(markets);
    assert.equal(opps.length, 1, `Failed to detect true violation for ${vc.child.q}`);
    const opp = opps[0];
    assert.equal(opp.expectedAdjustment, 'SELL CHILD (Violates P(Child) <= P(Parent))');
    assert.equal(opp.domain, vc.expectedDomain);
    assert(opp.grossSpread > 0);
    assert(opp.netEdge > 0);
    assert(opp.totalFeesUsd > 0, 'Dynamic taker fees must be accounted for');
    assert(opp.kellyPositionPercent <= MAX_CROSS_KELLY_PERCENT);
    assert(opp.kellyPositionPercent > 0);
  }
});

runTest('CrossMarket-3: Rejection of fee-eroded cross-market spreads', () => {
  // Gross spread is 0.015, but taker fees in crypto (7%) total ~0.035
  const cryptoTightMarkets = [
    {
      id: 'cr_p',
      question: 'Will Bitcoin reach $100k in 2024?',
      active: true,
      closed: false,
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.50", "0.50"]',
      clobTokenIds: ['cp1', 'cp2'],
      description: 'crypto bitcoin'
    },
    {
      id: 'cr_c',
      question: 'Will Bitcoin reach $120k in 2024?',
      active: true,
      closed: false,
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.515", "0.485"]', // gross spread = 0.015
      clobTokenIds: ['cc1', 'cc2'],
      description: 'crypto bitcoin'
    }
  ];

  // Fee child: 0.07 * 0.515 * 0.485 = 0.01748
  // Fee parent: 0.07 * 0.50 * 0.50 = 0.01750
  // Total fees = 0.03498. Gross spread = 0.015. Net edge = -0.01998 < 0
  const opps = scanCrossMarketOpps(cryptoTightMarkets);
  assert.equal(opps.length, 0, 'Must reject cross-market violation where taker fees exceed gross spread');
});

runTest('CrossMarket-4: Strict entity disambiguation rejects spurious keyword overlap', () => {
  const spuriousPairs = [
    // Case A: Trump prison vs Trump presidency
    {
      q1: 'Will Donald Trump be sentenced to prison before the presidential election?',
      q2: 'Will Donald Trump win the 2024 presidential election?'
    },
    // Case B: Cross-candidate presidential nomination
    {
      q1: 'Will Nikki Haley win the 2024 Republican presidential nomination?',
      q2: 'Will Donald Trump win the 2024 presidential election?'
    },
    // Case C: Different election years
    {
      q1: 'Will Donald Trump win the 2024 Republican presidential nomination?',
      q2: 'Will Donald Trump win the 2028 presidential election?'
    },
    // Case D: Different crypto assets
    {
      q1: 'Will Bitcoin reach $100k in 2024?',
      q2: 'Will Ethereum reach $100k in 2024?'
    },
    // Case E: Different FOMC meeting scopes
    {
      q1: 'Will the Fed decrease rates in November?',
      q2: 'Will the Fed decrease rates by 50+ bps in December?'
    },
    // Case F: Different parties in senate control
    {
      q1: 'Will Democrat control the Senate in 2024?',
      q2: 'Will Republican win 53+ Senate seats in 2024?'
    }
  ];

  for (let idx = 0; idx < spuriousPairs.length; idx++) {
    const pair = spuriousPairs[idx];
    const markets = [
      {
        id: `spur_1_${idx}`,
        question: pair.q1,
        active: true,
        closed: false,
        outcomes: '["Yes", "No"]',
        outcomePrices: '["0.60", "0.40"]',
        clobTokenIds: ['s1', 's2']
      },
      {
        id: `spur_2_${idx}`,
        question: pair.q2,
        active: true,
        closed: false,
        outcomes: '["Yes", "No"]',
        outcomePrices: '["0.75", "0.25"]',
        clobTokenIds: ['s3', 's4']
      }
    ];

    const opps = scanCrossMarketOpps(markets);
    assert.equal(
      opps.length, 0,
      `Spurious link matched between unrelated markets: "${pair.q1}" and "${pair.q2}"`
    );
  }
});

// ─────────────────────────────────────────────────────────────────────
// 3. DUST SNIPER 1¢ EMPIRICAL ADVERSARIAL VERIFICATION
// ─────────────────────────────────────────────────────────────────────
console.log('\n[Component 3] dust_sniper_1c.js Stress Verification');

runTest('DustSniper-1: Stephen A. Smith / binary 1c shares generate realistic win rate and negative EV', () => {
  const binary1cMarkets = [
    {
      name: 'Stephen A. Smith 2028',
      question: 'Will Stephen A. Smith win the 2028 Democratic presidential nomination?',
      outcomePrices: '["0.0105", "0.9895"]',
      category: 'politics'
    },
    {
      name: 'Dwayne The Rock Johnson 2028',
      question: 'Will Dwayne Johnson win the 2028 presidential election?',
      outcomePrices: '["0.01", "0.99"]',
      category: 'politics'
    },
    {
      name: 'Extreme Sports Longshot',
      question: 'Will San Jose Sharks win the Stanley Cup in 2025?',
      outcomePrices: '["0.02", "0.98"]',
      category: 'sports'
    }
  ];

  for (const item of binary1cMarkets) {
    const m = {
      id: 'bin_dust',
      question: item.question,
      active: true,
      closed: false,
      outcomes: '["Yes", "No"]',
      outcomePrices: item.outcomePrices,
      clobTokenIds: ['t1', 't2'],
      description: item.category
    };

    // Filtered mode (default): Must return 0 opportunities (no false positive free lunch)
    const filteredOpps = scan1cOpps([m]);
    assert.equal(
      filteredOpps.length, 0,
      `Binary longshot "${item.name}" produced synthetic positive EV opportunity!`
    );

    // Unfiltered inspection mode: Verify calibrated numbers
    const inspected = scan1cOpps([m], { filterPositiveEv: false });
    assert.equal(inspected.length, 1);
    const opp = inspected[0];

    // Must NOT have synthetic 25% win rate
    assert(
      opp.estWinProb <= 0.025,
      `Estimated win prob for "${item.name}" was inflated: got ${opp.estWinProb} (expected <= 0.025)`
    );

    // Must NOT have synthetic +2000% ROI
    assert(
      opp.expectedRoi <= 0,
      `Expected ROI for "${item.name}" was positive: got +${opp.expectedRoi}% (expected <= 0)`
    );

    // EV must be negative after venue fees
    assert(opp.ev <= 0, `EV for "${item.name}" was positive: got ${opp.ev}`);

    // Kelly position must be 0% on negative EV
    assert.equal(opp.kellyPositionPercent, 0.0, `Kelly size on non-positive EV must be 0%: got ${opp.kellyPositionPercent}`);
  }
});

runTest('DustSniper-2: Bankroll risk strictly capped at <= 0.5% under extreme synthetic edge', () => {
  // Construct extreme synthetic underround market where mathematical EV is enormous
  // Book sum = 0.20 (outrageous underround), price = 0.01.
  // Normalized prob = 0.01 / 0.20 = 0.05.
  // Payout = 100x. Theoretical unconstrained Kelly = ~4%.
  const extremeUnderround = {
    id: 'deep_underround',
    question: 'Extreme Fuzzed Multi-outcome Book',
    active: true,
    closed: false,
    outcomes: '["Pennyshare", "Leg2", "Leg3"]',
    outcomePrices: '["0.01", "0.10", "0.09"]', // Sum = 0.20
    clobTokenIds: ['t1', 't2', 't3']
  };

  const opps = scan1cOpps([extremeUnderround]);
  assert.equal(opps.length, 1);
  const opp = opps[0];
  assert(opp.ev > 0, 'Opportunity has genuine positive EV in underround book');
  assert(
    opp.kellyPositionPercent <= MAX_DUST_KELLY_PERCENT,
    `Kelly position percent exceeded 0.50% risk cap: got ${opp.kellyPositionPercent}%`
  );
  assert(opp.kellyPositionPercent > 0.0);

  // Monte Carlo Fuzzing across 300 random dust market configurations
  for (let trial = 0; trial < 300; trial++) {
    const numOutcomes = 3 + Math.floor(Math.random() * 20); // 3 to 22 outcomes
    const dustPrice = 0.01 + Math.random() * 0.02; // 0.01 to 0.03
    const otherPrices = Array.from({ length: numOutcomes - 1 }, () => 0.01 + Math.random() * 0.20);
    const allPrices = [dustPrice, ...otherPrices];

    const fuzzedMarket = {
      id: `fuzz_dust_${trial}`,
      question: `Fuzzed Multi-outcome ${trial}`,
      active: true,
      closed: false,
      outcomes: JSON.stringify(Array.from({ length: numOutcomes }, (_, i) => `Option ${i}`)),
      outcomePrices: JSON.stringify(allPrices),
      clobTokenIds: JSON.stringify(Array.from({ length: numOutcomes }, (_, i) => `tok_${i}`))
    };

    const evaluated = scan1cOpps([fuzzedMarket], { filterPositiveEv: false });
    for (const item of evaluated) {
      assert(
        item.kellyPositionPercent <= MAX_DUST_KELLY_PERCENT,
        `Fuzzed Kelly exceeded 0.50% in trial ${trial}: got ${item.kellyPositionPercent}%`
      );
      assert(
        item.kellyPositionPercent >= 0.0,
        `Fuzzed Kelly negative in trial ${trial}: got ${item.kellyPositionPercent}%`
      );
      assert(!isNaN(item.kellyPositionPercent), 'Kelly must not be NaN');
    }
  }
});

runTest('DustSniper-3: Multi-outcome residual allocation invariant', () => {
  // Test with field of 30 candidates where leader is at 0.60
  // Residual unallocated probability is 1.0 - 0.60 = 0.40
  // Residual share ceiling per non-leader candidate is 0.40 / 29 = 0.01379
  const n = 30;
  const outcomes = ['Leader', ...Array.from({ length: n - 1 }, (_, i) => `Longshot ${i + 1}`)];
  const prices = [0.60, ...Array.from({ length: n - 1 }, () => 0.02)];
  const market = {
    id: 'field_30',
    question: 'Field of 30 Presidential Contenders',
    active: true,
    closed: false,
    outcomes: JSON.stringify(outcomes),
    outcomePrices: JSON.stringify(prices),
    clobTokenIds: JSON.stringify(Array.from({ length: n }, (_, i) => `tok_${i}`))
  };

  const inspected = scan1cOpps([market], { filterPositiveEv: false });
  assert.equal(inspected.length, n - 1);
  const maxAllowableProb = (0.40 / (n - 1)) + 1e-5;

  for (const item of inspected) {
    assert(
      item.estWinProb <= maxAllowableProb,
      `Candidate probability ${item.estWinProb} exceeded residual share bound ${maxAllowableProb}`
    );
    assert(item.kellyPositionPercent <= MAX_DUST_KELLY_PERCENT);
  }
});

runTest('DustSniper-4: Time decay discounts longshots nearing expiration', () => {
  const baseMarket = {
    id: 'time_test',
    question: 'Time Decay Contender',
    active: true,
    closed: false,
    outcomes: '["Leader", "Longshot"]',
    outcomePrices: '["0.98", "0.02"]',
    clobTokenIds: ['t1', 't2']
  };

  const now = Date.now();

  // Case A: 12 hours left (timeFactor = 0.2)
  const market12h = {
    ...baseMarket,
    endDateIso: new Date(now + 12 * 3600 * 1000).toISOString()
  };
  const opp12h = scan1cOpps([market12h], { filterPositiveEv: false })[0];

  // Case B: 72 hours left (timeFactor = 0.6)
  const market72h = {
    ...baseMarket,
    endDateIso: new Date(now + 72 * 3600 * 1000).toISOString()
  };
  const opp72h = scan1cOpps([market72h], { filterPositiveEv: false })[0];

  // Case C: 30 days left (timeFactor = 1.0)
  const market30d = {
    ...baseMarket,
    endDateIso: new Date(now + 30 * 24 * 3600 * 1000).toISOString()
  };
  const opp30d = scan1cOpps([market30d], { filterPositiveEv: false })[0];

  assert(
    opp12h.estWinProb < opp72h.estWinProb,
    `Probability at 12h (${opp12h.estWinProb}) should be lower than at 72h (${opp72h.estWinProb})`
  );
  assert(
    opp72h.estWinProb < opp30d.estWinProb,
    `Probability at 72h (${opp72h.estWinProb}) should be lower than at 30d (${opp30d.estWinProb})`
  );

  // Case D: Ended 2 hours ago -> Must be skipped entirely
  const marketExpired = {
    ...baseMarket,
    endDateIso: new Date(now - 2 * 3600 * 1000).toISOString()
  };
  const oppExpired = scan1cOpps([marketExpired], { filterPositiveEv: false });
  assert.equal(oppExpired.length, 0, 'Markets ended > 1 hour ago must be completely ignored');
});

console.log('\n===============================================================');
console.log(`  ADVERSARIAL STRESS SUITE: ${passedTests}/${totalTests} PASSED (0 FAILED)`);
console.log('===============================================================\n');
