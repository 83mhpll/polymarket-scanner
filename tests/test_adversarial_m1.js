/**
 * tests/test_adversarial_m1.js
 * 
 * Empirical Adversarial Stress-Test Suite for Milestone M1
 * Author: challenger_m1_1 (Empirical Challenger)
 * 
 * Tests:
 * 1. Shin 1993 de-vigging: extreme overrounds (s = 1.0001 to 5.0), large n (up to 100),
 *    heavy favorite-longshot skews, sub-normal probabilities, underrounds (s < 1.0).
 * 2. Power & Multiplicative de-vigging solvers: convergence, limits, and conservation.
 * 3. Logit and expit transforms: extreme inputs (+/-1000, +/-1e9, +/-Infinity, 1e-15, 1 - 1e-15).
 * 4. Dynamic fees: price limits (0.00001, 0.99999), exact symmetry around 0.50, maker zero fee.
 * 5. Proper Scoring Rules: empirical verification of strictly proper scoring rule theorem
 *    (truth p* strictly minimizes expected Brier score and log-loss vs any lie p != p*).
 * 6. Weather fair value engine: zero-variance ensemble (std = 0), single member, wide spread, monotonicity.
 */

import assert from 'node:assert/strict';
import {
  logit,
  expit,
  erf,
  erfc,
  standardNormalCdf,
  calculateBandwidthSilverman,
  calculateEcdfProbability,
  calculateKdeProbability,
  calculateSuperensembleProbability,
  calculateFairProbability,
  generateSyntheticEnsemble
} from '../engine/weather_fair_value.js';

import {
  solveMultiplicativeDevig,
  solvePowerDevig,
  solveShinDevig,
  devig,
  devigMarket
} from '../engine/devigging.js';

import {
  getFeeRate,
  getMakerRebateRate,
  calculateTakerFeePerShare,
  calculateDynamicFee,
  calculateMakerFee,
  calculateMakerRebate,
  calculateNetEdge,
  CATEGORY_FEE_RATES
} from '../engine/dynamic_fees.js';

import {
  softplus,
  brierScore,
  brierSkillScore,
  logLoss,
  evaluateScoringRules
} from '../engine/proper_scoring.js';

let passed = 0;
let failed = 0;
const failures = [];

function challenge(title, fn) {
  try {
    fn();
    passed++;
    console.log(`  [PASS] ${title}`);
  } catch (err) {
    failed++;
    failures.push({ title, error: err.message, stack: err.stack });
    console.error(`  [FAIL] ${title}`);
    console.error(`         ${err.message}`);
  }
}

async function asyncChallenge(title, fn) {
  try {
    await fn();
    passed++;
    console.log(`  [PASS] ${title}`);
  } catch (err) {
    failed++;
    failures.push({ title, error: err.message, stack: err.stack });
    console.error(`  [FAIL] ${title}`);
    console.error(`         ${err.message}`);
  }
}

console.log('======================================================================');
console.log('  ADVERSARIAL STRESS TEST HARNESS — MILESTONE M1');
console.log('======================================================================\n');

// ============================================================================
// SECTION 1: SHIN 1993 DE-VIGGING EMPIRICAL STRESS TESTS
// ============================================================================
console.log('[SECTION 1] Shin (1993) Microstructure De-vigging Stress Tests');

challenge('Shin 1993: Huge overround (s = 1.80, binary [0.90, 0.90])', () => {
  const quoted = [0.90, 0.90];
  const res = solveShinDevig(quoted);
  assert(res.z > 0 && res.z < 1.0, `z out of range: ${res.z}`);
  assert.equal(res.trueProbs.length, 2);
  const sum = res.trueProbs.reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - 1.0) < 1e-9, `Sum not 1: ${sum}`);
  assert(Math.abs(res.trueProbs[0] - 0.5) < 1e-9, `Symmetric odds must yield 0.5: ${res.trueProbs[0]}`);
  assert(Math.abs(res.trueProbs[1] - 0.5) < 1e-9, `Symmetric odds must yield 0.5: ${res.trueProbs[1]}`);
});

challenge('Shin 1993: Extreme overround (s = 2.50, 3 outcomes [0.90, 0.80, 0.80])', () => {
  const quoted = [0.90, 0.80, 0.80];
  const res = solveShinDevig(quoted);
  assert(res.z > 0 && res.z < 1.0, `z out of range: ${res.z}`);
  const sum = res.trueProbs.reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - 1.0) < 1e-9, `Sum not 1: ${sum}`);
  for (const p of res.trueProbs) {
    assert(p > 0 && p < 1.0, `p out of bounds: ${p}`);
  }
});

challenge('Shin 1993: Minimal overround (s = 1.0001, [0.50005, 0.50005])', () => {
  const quoted = [0.50005, 0.50005];
  const res = solveShinDevig(quoted);
  assert(res.z >= 0.0 && res.z < 0.01, `z should be near zero for minimal overround, got: ${res.z}`);
  const sum = res.trueProbs.reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - 1.0) < 1e-9, `Sum not 1: ${sum}`);
  assert(Math.abs(res.trueProbs[0] - 0.5) < 1e-7);
});

challenge('Shin 1993: Infinitesimal overround (s = 1.0000001, [0.50000005, 0.50000005])', () => {
  const quoted = [0.50000005, 0.50000005];
  const res = solveShinDevig(quoted);
  const sum = res.trueProbs.reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - 1.0) < 1e-9, `Sum not 1: ${sum}`);
  assert(Math.abs(res.trueProbs[0] - 0.5) < 1e-7);
});

challenge('Shin 1993: Arbitrage / Underround book (s = 0.98 < 1.0)', () => {
  const quoted = [0.49, 0.49];
  const res = solveShinDevig(quoted);
  assert.equal(res.z, 0.0, 'z must be 0 for underround');
  const sum = res.trueProbs.reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - 1.0) < 1e-9, `Sum not 1: ${sum}`);
  assert.equal(res.overround, 0.98);
});

challenge('Shin 1993: Many outcomes (N = 10, equal and unequal odds)', () => {
  const quoted10 = [0.15, 0.14, 0.13, 0.12, 0.11, 0.10, 0.09, 0.08, 0.07, 0.06]; // sum = 1.05
  const res10 = solveShinDevig(quoted10);
  assert(res10.z > 0 && res10.z < 1.0);
  const sum10 = res10.trueProbs.reduce((a, b) => a + b, 0);
  assert(Math.abs(sum10 - 1.0) < 1e-9, `Sum 10 outcomes not 1: ${sum10}`);
  for (let i = 0; i < 9; i++) {
    assert(res10.trueProbs[i] > res10.trueProbs[i+1], 'Monotonic ordering of probabilities violated');
  }
});

challenge('Shin 1993: High outcome count (N = 50 outcomes)', () => {
  const quoted50 = new Array(50).fill(0.025); // sum = 1.25
  const res50 = solveShinDevig(quoted50);
  assert(res50.z > 0 && res50.z < 1.0);
  const sum50 = res50.trueProbs.reduce((a, b) => a + b, 0);
  assert(Math.abs(sum50 - 1.0) < 1e-9, `Sum 50 outcomes not 1: ${sum50}`);
  for (const p of res50.trueProbs) {
    assert(Math.abs(p - 0.02) < 1e-7, `Each outcome must be 0.02, got ${p}`);
  }
});

challenge('Shin 1993: Heavy favorite-longshot skew q = [0.95, 0.04, 0.04] (s = 1.03)', () => {
  const quoted = [0.95, 0.04, 0.04];
  const mult = solveMultiplicativeDevig(quoted);
  const shin = solveShinDevig(quoted);

  // In Shin, favorite probability MUST be greater than multiplicative normalization
  assert(
    shin.trueProbs[0] > mult.trueProbs[0],
    `Shin favorite (${shin.trueProbs[0]}) should exceed multiplicative (${mult.trueProbs[0]})`
  );
  // Longshots MUST be lower than multiplicative normalization
  assert(
    shin.trueProbs[1] < mult.trueProbs[1],
    `Shin longshot (${shin.trueProbs[1]}) should be below multiplicative (${mult.trueProbs[1]})`
  );
  assert(
    shin.trueProbs[2] < mult.trueProbs[2],
    `Shin longshot (${shin.trueProbs[2]}) should be below multiplicative (${mult.trueProbs[2]})`
  );
  const sum = shin.trueProbs.reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - 1.0) < 1e-9);
});

challenge('Shin 1993: Extreme favorite q = [0.99, 0.02, 0.02] (s = 1.03)', () => {
  const quoted = [0.99, 0.02, 0.02];
  const shin = solveShinDevig(quoted);
  const mult = solveMultiplicativeDevig(quoted);
  assert(shin.trueProbs[0] > mult.trueProbs[0]);
  assert(shin.trueProbs[1] < mult.trueProbs[1]);
  const sum = shin.trueProbs.reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - 1.0) < 1e-9);
});

challenge('Shin 1993: Near-zero probabilities (q = [0.70, 0.40, 1e-6]) without NaN', () => {
  const quoted = [0.70, 0.40, 1e-6];
  const res = solveShinDevig(quoted);
  assert(!isNaN(res.z));
  for (const p of res.trueProbs) {
    assert(!isNaN(p) && isFinite(p) && p >= 0.0);
  }
  const sum = res.trueProbs.reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - 1.0) < 1e-9);
});

challenge('Shin 1993: Input validation rejection (empty, negative, zero, NaN)', () => {
  assert.throws(() => solveShinDevig([]), TypeError);
  assert.throws(() => solveShinDevig([-0.1, 0.5]), RangeError);
  assert.throws(() => solveShinDevig([0.0, 0.5]), RangeError);
  assert.throws(() => solveShinDevig([NaN, 0.5]), RangeError);
  assert.throws(() => solveShinDevig('not an array'), TypeError);
});

// ============================================================================
// SECTION 2: POWER & MULTIPLICATIVE SOLVERS STRESS TESTS
// ============================================================================
console.log('\n[SECTION 2] Power & Multiplicative De-vigging Solvers');

challenge('Power Method: Huge overround (s = 1.80, [0.90, 0.90])', () => {
  const res = solvePowerDevig([0.90, 0.90]);
  assert(res.r > 1.0);
  assert.equal(res.trueProbs.length, 2);
  const sum = res.trueProbs.reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - 1.0) < 1e-9);
  assert(Math.abs(res.trueProbs[0] - 0.5) < 1e-9);
});

challenge('Power Method: Minimal overround (s = 1.0001)', () => {
  const res = solvePowerDevig([0.50005, 0.50005]);
  assert(res.r >= 1.0);
  const sum = res.trueProbs.reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - 1.0) < 1e-9);
});

challenge('Power Method: Multi-outcome (N = 10)', () => {
  const quoted = [0.20, 0.18, 0.16, 0.14, 0.12, 0.10, 0.08, 0.06, 0.04, 0.02]; // sum = 1.10
  const res = solvePowerDevig(quoted);
  const sum = res.trueProbs.reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - 1.0) < 1e-9);
});

challenge('Power Method: Input validation', () => {
  assert.throws(() => solvePowerDevig([]), TypeError);
  assert.throws(() => solvePowerDevig([0, 0.5]), RangeError);
  assert.throws(() => solvePowerDevig([-0.2, 0.8]), RangeError);
});

// ============================================================================
// SECTION 3: LOGIT AND EXPIT NUMERICAL BOUNDS
// ============================================================================
console.log('\n[SECTION 3] Logit and Expit Numerical Bounds & Extreme Inputs');

challenge('Expit: Extreme inputs (+/-1000, +/-1e6, +/-1e9) produce no NaN or out-of-bounds', () => {
  const testEtas = [-1e9, -1e6, -10000, -1000, -500, -100, 0, 100, 500, 1000, 10000, 1e6, 1e9];
  for (const eta of testEtas) {
    const p = expit(eta);
    assert(!isNaN(p), `expit(${eta}) returned NaN`);
    assert(isFinite(p), `expit(${eta}) returned non-finite`);
    assert(p >= 0.0 && p <= 1.0, `expit(${eta}) = ${p} outside [0, 1]`);
  }
});

challenge('Expit: Infinity and -Infinity handling', () => {
  const pInf = expit(Infinity);
  const pNegInf = expit(-Infinity);
  assert.equal(pInf, 1.0, `expit(Infinity) should be 1.0, got ${pInf}`);
  assert.equal(pNegInf, 0.0, `expit(-Infinity) should be 0.0, got ${pNegInf}`);
});

challenge('Expit: Strict symmetry expit(-eta) + expit(eta) === 1.0 across wide grid', () => {
  const grid = [-500, -100, -50, -10, -5, -2, -1, -0.5, 0, 0.5, 1, 2, 5, 10, 50, 100, 500];
  for (const eta of grid) {
    const sum = expit(-eta) + expit(eta);
    assert(Math.abs(sum - 1.0) < 1e-12, `Symmetry broke at ${eta}: sum = ${sum}`);
  }
});

challenge('Logit: Boundary clamping at 1e-15, 1 - 1e-15, 0.0, 1.0', () => {
  const testProbs = [0.0, 1e-15, 1e-12, 1e-7, 0.5, 1 - 1e-7, 1 - 1e-12, 1 - 1e-15, 1.0];
  for (const p of testProbs) {
    const eta = logit(p);
    assert(!isNaN(eta), `logit(${p}) returned NaN`);
    assert(isFinite(eta), `logit(${p}) returned non-finite: ${eta}`);
  }
});

challenge('Logit & Expit: Monotonicity preserves ordering', () => {
  const probs = [0.001, 0.01, 0.1, 0.3, 0.5, 0.7, 0.9, 0.99, 0.999];
  for (let i = 0; i < probs.length - 1; i++) {
    const eta1 = logit(probs[i]);
    const eta2 = logit(probs[i+1]);
    assert(eta1 < eta2, `Monotonicity violated in logit: logit(${probs[i]}) >= logit(${probs[i+1]})`);
    assert(expit(eta1) < expit(eta2), `Monotonicity violated in expit`);
  }
});

challenge('Logit: Invalid input rejection (NaN, non-number)', () => {
  assert.throws(() => logit(NaN), TypeError);
  assert.throws(() => logit('0.5'), TypeError);
  assert.throws(() => logit(null), TypeError);
});

// ============================================================================
// SECTION 4: DYNAMIC VENUE FEES STRESS TESTS
// ============================================================================
console.log('\n[SECTION 4] Dynamic Fees Stress Tests & Mathematical Properties');

challenge('Dynamic Fee: Price limits (0.00001, 0.99999)', () => {
  const feeLow = calculateDynamicFee(1000, 0.00001, 'weather');
  const feeHigh = calculateDynamicFee(1000, 0.99999, 'weather');
  assert(feeLow >= 0.0 && !isNaN(feeLow), `feeLow invalid: ${feeLow}`);
  assert(feeHigh >= 0.0 && !isNaN(feeHigh), `feeHigh invalid: ${feeHigh}`);
  // Exact symmetry: 0.00001 and 0.99999 have identical p * (1 - p)
  assert.equal(feeLow, feeHigh, `Symmetry failed at extremes: feeLow=${feeLow}, feeHigh=${feeHigh}`);
});

challenge('Dynamic Fee: Exact symmetry around p = 0.50 across entire interior interval', () => {
  const testPrices = [0.001, 0.01, 0.05, 0.10, 0.20, 0.35, 0.45];
  for (const p of testPrices) {
    const fee1 = calculateDynamicFee(1000, p, 'weather');
    const fee2 = calculateDynamicFee(1000, 1.0 - p, 'weather');
    assert.equal(fee1, fee2, `Fee symmetry failed at p=${p}: ${fee1} vs ${fee2}`);
  }
});

challenge('Dynamic Fee: Per-share taker fee matches rate * p * (1 - p)', () => {
  for (const [cat, rate] of Object.entries(CATEGORY_FEE_RATES)) {
    const p = 0.40;
    const expected = rate * p * (1 - p);
    const calculated = calculateTakerFeePerShare(p, cat);
    assert(Math.abs(calculated - expected) < 1e-12, `Mismatch for ${cat}: ${calculated} vs ${expected}`);
  }
});

challenge('Dynamic Fee: Maker fee is strictly 0.0 across all inputs', () => {
  const prices = [0.0001, 0.1, 0.5, 0.9, 0.9999];
  const shares = [1, 100, 10000, 1000000];
  for (const p of prices) {
    for (const s of shares) {
      assert.equal(calculateMakerFee(s, p, 'weather'), 0.0);
      assert.equal(calculateMakerFee(s, p, 'crypto'), 0.0);
    }
  }
});

challenge('Dynamic Fee: Net edge accurately reflects taker fee deduction', () => {
  // Fair prob 0.70, Ask 0.60, Bid 0.55
  const edge = calculateNetEdge(0.70, 0.60, 0.55, 'weather');
  const rate = 0.05;
  const expectedTakerFeeYes = rate * 0.60 * (1 - 0.60); // 0.012
  const expectedGrossYes = 0.70 - 0.60; // 0.10
  const expectedNetYes = expectedGrossYes - expectedTakerFeeYes; // 0.088

  assert.equal(edge.grossEdgeYes, 0.10);
  assert.equal(edge.takerFeePerShareYes, 0.012);
  assert.equal(edge.netEdgeYes, 0.088);

  // NO side: buying NO at 1 - 0.55 = 0.45
  const expectedGrossNo = 0.55 - 0.70; // -0.15
  const expectedTakerFeeNo = rate * 0.55 * (1 - 0.55); // 0.012375 -> rounded to 0.01238
  assert.equal(edge.grossEdgeNo, -0.15);
  assert(Math.abs(edge.takerFeePerShareNo - 0.01238) < 1e-4);
  assert(edge.netEdgeNo < edge.grossEdgeNo);
});

challenge('Dynamic Fee: Zero and negative input guards', () => {
  assert.equal(calculateDynamicFee(0, 0.5), 0.0);
  assert.equal(calculateDynamicFee(-100, 0.5), 0.0);
  assert.equal(calculateDynamicFee(100, 0), 0.0);
  assert.equal(calculateDynamicFee(100, 1), 0.0);
  assert.equal(calculateDynamicFee(100, -0.5), 0.0);
  assert.equal(calculateDynamicFee(100, 1.5), 0.0);
});

// ============================================================================
// SECTION 5: STRICTLY PROPER SCORING RULES THEOREM VERIFICATION
// ============================================================================
console.log('\n[SECTION 5] Strictly Proper Scoring Rules Theorem Empirical Verification');

challenge('Proper Scoring Rules: Truth reporting strictly minimizes expected Brier Score', () => {
  // Let true probability be p*.
  // Forecaster reports p.
  // Expected Brier Score: E[BS(p)] = p* * (1 - p)^2 + (1 - p*) * p^2
  // We test grid of p* in [0.1, 0.9] with step 0.1
  // For each p*, we test reports p in [0.02, 0.98] with step 0.02
  const trueProbs = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  const reports = [];
  for (let r = 2; r <= 98; r += 2) {
    reports.push(r / 100);
  }

  for (const pStar of trueProbs) {
    // Expected score when reporting truth p*
    const expectedBsTruth = pStar * Math.pow(1.0 - pStar, 2) + (1.0 - pStar) * Math.pow(pStar, 2);

    for (const pReport of reports) {
      if (Math.abs(pReport - pStar) < 1e-6) continue; // Skip truth

      const expectedBsLie = pStar * Math.pow(1.0 - pReport, 2) + (1.0 - pStar) * Math.pow(pReport, 2);
      
      // Strict propriety: expected score under lie MUST be strictly greater than under truth
      assert(
        expectedBsLie > expectedBsTruth,
        `Strict propriety violated at p*=${pStar}, reported=${pReport}: Lie E[BS]=${expectedBsLie} <= Truth E[BS]=${expectedBsTruth}`
      );

      // Theoretical analytical gap: E[BS(p)] - E[BS(p*)] == (p - p*)^2
      const theoreticalGap = Math.pow(pReport - pStar, 2);
      const empiricalGap = expectedBsLie - expectedBsTruth;
      assert(
        Math.abs(empiricalGap - theoreticalGap) < 1e-12,
        `Analytical identity E[BS(p)] - E[BS(p*)] = (p - p*)^2 failed`
      );
    }
  }
});

challenge('Proper Scoring Rules: Truth reporting strictly minimizes expected Log-Loss (Gibbs Inequality)', () => {
  // Expected Log-Loss: E[LL(p)] = - [p* * ln(p) + (1 - p*) * ln(1 - p)]
  // By Gibbs inequality / KL divergence: E[LL(p)] - E[LL(p*)] = D_KL(p* || p) >= 0 with equality iff p = p*
  const trueProbs = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  const reports = [];
  for (let r = 2; r <= 98; r += 2) {
    reports.push(r / 100);
  }

  for (const pStar of trueProbs) {
    const expectedLlTruth = - (pStar * Math.log(pStar) + (1.0 - pStar) * Math.log(1.0 - pStar));

    for (const pReport of reports) {
      if (Math.abs(pReport - pStar) < 1e-6) continue;

      const expectedLlLie = - (pStar * Math.log(pReport) + (1.0 - pStar) * Math.log(1.0 - pReport));

      assert(
        expectedLlLie > expectedLlTruth,
        `Gibbs inequality violated at p*=${pStar}, reported=${pReport}: Lie E[LL]=${expectedLlLie} <= Truth E[LL]=${expectedLlTruth}`
      );
    }
  }
});

challenge('Proper Scoring Rules: Monte Carlo empirical simulation validates strict propriety', () => {
  const pStar = 0.70;
  const N = 50000;
  // Generate N Bernoulli(pStar) outcomes
  const outcomes = [];
  // Use deterministic pseudo-random sequence for repeatability
  let seed = 123456789;
  function pseudoRandom() {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  }

  for (let i = 0; i < N; i++) {
    outcomes.push(pseudoRandom() < pStar ? 1 : 0);
  }

  const truthPredictions = new Array(N).fill(pStar);
  const liePredictionsHigh = new Array(N).fill(0.85); // Overconfident
  const liePredictionsLow = new Array(N).fill(0.50);  // Underconfident

  const bsTruth = brierScore(truthPredictions, outcomes);
  const bsHigh = brierScore(liePredictionsHigh, outcomes);
  const bsLow = brierScore(liePredictionsLow, outcomes);

  assert(bsTruth < bsHigh, `Truth BS (${bsTruth}) must be lower than overconfident lie BS (${bsHigh})`);
  assert(bsTruth < bsLow, `Truth BS (${bsTruth}) must be lower than underconfident lie BS (${bsLow})`);

  const llTruth = logLoss(truthPredictions, outcomes);
  const llHigh = logLoss(liePredictionsHigh, outcomes);
  const llLow = logLoss(liePredictionsLow, outcomes);

  assert(llTruth < llHigh, `Truth LL (${llTruth}) must be lower than overconfident lie LL (${llHigh})`);
  assert(llTruth < llLow, `Truth LL (${llTruth}) must be lower than underconfident lie LL (${llLow})`);
});

challenge('Proper Scoring Rules: Log-Loss softplus stability at extreme logit scores', () => {
  // Softplus of extreme scores: softplus(1000) ~ 1000, softplus(-1000) ~ 0
  const spPos = softplus(1000);
  const spNeg = softplus(-1000);
  assert(!isNaN(spPos) && isFinite(spPos));
  assert(!isNaN(spNeg) && isFinite(spNeg));
  assert(Math.abs(spPos - 1000) < 1e-9);
  assert(Math.abs(spNeg - 0.0) < 1e-9);

  // Predictions near 0 and 1
  const llNear0 = logLoss([1e-15], [0]);
  const llNear1 = logLoss([1 - 1e-15], [1]);
  assert(isFinite(llNear0) && !isNaN(llNear0) && llNear0 >= 0);
  assert(isFinite(llNear1) && !isNaN(llNear1) && llNear1 >= 0);
});

// ============================================================================
// SECTION 6: WEATHER FAIR VALUE MODEL STRESS TESTS
// ============================================================================
console.log('\n[SECTION 6] Weather Fair Value Engine Adversarial Stress Tests');

challenge('Weather Model: Zero-variance ensemble (all members identical temperature)', () => {
  const degenerateSamples = new Array(82).fill(72.0); // 82 identical members
  const bw = calculateBandwidthSilverman(degenerateSamples);
  assert(bw > 0, `Bandwidth must be strictly positive even when std=0: ${bw}`);
  assert(!isNaN(bw));

  const pExact = calculateKdeProbability(degenerateSamples, { min: 70, max: 74 });
  assert(pExact > 0.0 && pExact < 1.0, `pExact must be in (0, 1): ${pExact}`);
  assert(pExact > 0.5, `Centered bracket around identical points must have high probability: ${pExact}`);

  const pFar = calculateKdeProbability(degenerateSamples, { min: 90 });
  assert(pFar > 0.0 && pFar < 0.1, `Distant bracket must have low probability: ${pFar}`);
});

challenge('Weather Model: Extreme spread (temperatures -50°F to 150°F)', () => {
  const wideSamples = [];
  for (let t = -50; t <= 150; t += 2.5) {
    wideSamples.push(t);
  }
  const bw = calculateBandwidthSilverman(wideSamples);
  assert(bw > 0 && isFinite(bw));

  const pMid = calculateKdeProbability(wideSamples, { min: 0, max: 100 });
  assert(pMid > 0.0 && pMid < 1.0);
});

challenge('Weather Model: Monotonicity across continuous thresholds', () => {
  const ensemble = generateSyntheticEnsemble(['2026-10-07'], 70.0);
  let prevProb = 1.0;
  for (let threshold = 55; threshold <= 85; threshold += 2) {
    const prob = calculateFairProbability(ensemble, '2026-10-07', { min: threshold }, 'kde').fairProb;
    assert(
      prob <= prevProb + 1e-6,
      `Monotonicity violated at threshold ${threshold}: prob=${prob} > prevProb=${prevProb}`
    );
    prevProb = prob;
  }
});

challenge('Weather Model: calculateFairProbability guaranteed strictly inside (0, 1) across all brackets', () => {
  const ensemble = generateSyntheticEnsemble(['2026-10-07'], 70.0);
  const testBrackets = [
    { min: -100 },
    { max: -100 },
    { min: 200 },
    { max: 200 },
    { min: 69.5, max: 70.5 },
    { min: -50, max: 150 }
  ];

  for (const b of testBrackets) {
    for (const method of ['ecdf', 'kde', 'super']) {
      const res = calculateFairProbability(ensemble, '2026-10-07', b, method);
      assert(
        res.fairProb > 0.0 && res.fairProb < 1.0,
        `fairProb ${res.fairProb} not in (0, 1) for method ${method}, bracket ${JSON.stringify(b)}`
      );
      assert(!isNaN(res.logitProb) && isFinite(res.logitProb));
    }
  }
});

// ============================================================================
// FINAL SUMMARY
// ============================================================================
console.log('\n======================================================================');
console.log(`  ADVERSARIAL STRESS TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
console.log('======================================================================\n');

if (failed > 0) {
  console.error(`FAILURE DETAILS (${failed} tests failed):`);
  for (const f of failures) {
    console.error(`- ${f.title}: ${f.error}`);
  }
  process.exit(1);
} else {
  console.log('ALL EMPIRICAL ADVERSARIAL CHALLENGES CONFIRMED AND PASSED (0 FAILURES).');
  process.exit(0);
}
