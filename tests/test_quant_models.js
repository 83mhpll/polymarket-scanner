/**
 * tests/test_quant_models.js
 * 
 * Comprehensive Unit and Acceptance Test Suite for Milestone M1:
 * - Domain Fair Value Quantitative Model (Weather & Ensemble NWP)
 * - Logit/Expit space numerical transformations
 * - Multiplicative, Power, and Shin (1993) de-vigging solvers
 * - Dynamic venue fee schedule and net edge calculations
 * - Proper Scoring Rules (Brier Score, Brier Skill Score, Log-Loss) and Benchmarks
 * 
 * Execution:
 * node tests/test_quant_models.js
 */

import assert from 'node:assert/strict';
import {
  logit,
  expit,
  erf,
  erfc,
  standardNormalCdf,
  computeSampleStats,
  calculateBandwidthSilverman,
  generateSyntheticEnsemble,
  fetchEnsembleForecast,
  extractDailyMaxTemperatures,
  isTempInBracket,
  calculateEcdfProbability,
  calculateKdeProbability,
  calculateSuperensembleProbability,
  calculateFairProbability,
  STATIONS
} from '../engine/weather_fair_value.js';

import {
  solveMultiplicativeDevig,
  solvePowerDevig,
  solveShinDevig,
  devig,
  devigMarket
} from '../engine/devigging.js';

import {
  CATEGORY_FEE_RATES,
  CATEGORY_MAKER_REBATES,
  getFeeRate,
  getMakerRebateRate,
  calculateTakerFeePerShare,
  calculateDynamicFee,
  calculateMakerFee,
  calculateMakerRebate,
  calculateNetEdge
} from '../engine/dynamic_fees.js';

import {
  softplus,
  brierScore,
  brierSkillScore,
  logLoss,
  evaluateScoringRules,
  WEATHER_BENCHMARK_CASES,
  runBenchmarkComparison
} from '../engine/proper_scoring.js';

// Simple lightweight test runner
let testCount = 0;
let passedCount = 0;
let failedCount = 0;

function test(name, fn) {
  testCount++;
  try {
    fn();
    passedCount++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failedCount++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }
  }
}

async function asyncTest(name, fn) {
  testCount++;
  try {
    await fn();
    passedCount++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failedCount++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    }
  }
}

console.log('===============================================================');
console.log('  RUNNING MILESTONE M1 QUANTITATIVE MODEL TEST SUITE');
console.log('===============================================================\n');

// -----------------------------------------------------------------------------
// Suite 1: Logit / Expit & Mathematical Functions
// -----------------------------------------------------------------------------
console.log('[Suite 1] Logit & Expit Numerical Transformations');

test('Logit and expit form an exact bijection: expit(logit(p)) === p', () => {
  const testProbs = [1e-6, 0.001, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.999, 1 - 1e-6];
  for (const p of testProbs) {
    const eta = logit(p);
    const recovered = expit(eta);
    assert(Math.abs(recovered - p) < 1e-9, `Failed bijection at p=${p}: recovered=${recovered}`);
  }
});

test('Expit is branch-safe and stable for extreme inputs (-1000, 0, +1000)', () => {
  const pNeg = expit(-1000);
  const pZero = expit(0);
  const pPos = expit(1000);

  assert.equal(pZero, 0.5);
  assert(pNeg >= 0.0 && pNeg < 1e-15, `pNeg out of bounds: ${pNeg}`);
  assert(pPos <= 1.0 && pPos > 1 - 1e-15, `pPos out of bounds: ${pPos}`);
  assert(!isNaN(pNeg) && !isNaN(pPos), 'NaN returned for extreme expit');
});

test('Expit satisfies symmetry: expit(-eta) + expit(eta) === 1.0', () => {
  const etas = [-50, -10, -2.5, -0.5, 0, 0.5, 2.5, 10, 50];
  for (const eta of etas) {
    const sum = expit(-eta) + expit(eta);
    assert(Math.abs(sum - 1.0) < 1e-12, `Symmetry failed at eta=${eta}: sum=${sum}`);
  }
});

test('Logit handles boundary clamping gracefully at 0.0 and 1.0', () => {
  const eta0 = logit(0.0);
  const eta1 = logit(1.0);
  assert(isFinite(eta0) && eta0 < -10, `eta0 not clamped: ${eta0}`);
  assert(isFinite(eta1) && eta1 > 10, `eta1 not clamped: ${eta1}`);
});

test('Error function erf(x) and erfc(x) identities', () => {
  assert.equal(erf(0), 0.0);
  assert.equal(erfc(0), 1.0);
  
  const testXs = [-3.0, -1.5, -0.5, 0.5, 1.5, 3.0];
  for (const x of testXs) {
    const sum = erf(x) + erfc(x);
    assert(Math.abs(sum - 1.0) < 1e-6, `erf + erfc != 1 at x=${x}: sum=${sum}`);
  }

  // standard normal CDF at 0 is 0.5, at 1.96 is ~0.975
  assert(Math.abs(standardNormalCdf(0) - 0.5) < 1e-6);
  assert(Math.abs(standardNormalCdf(1.96) - 0.975) < 0.001);
});

// -----------------------------------------------------------------------------
// Suite 2: Open-Meteo Ensemble Ingestion & Parsing
// -----------------------------------------------------------------------------
console.log('\n[Suite 2] Open-Meteo NWP Ensemble Ingestion & Extraction');

test('Station coordinates resolution contains KNYC Central Park', () => {
  assert(STATIONS.KNYC !== undefined);
  assert.equal(STATIONS.KNYC.lat, 40.7829);
  assert.equal(STATIONS.KNYC.lon, -73.9654);
  assert.equal(STATIONS.KNYC.unit, 'fahrenheit');
});

test('Synthetic ensemble generates 31 GFS and 51 ECMWF members', () => {
  const ensemble = generateSyntheticEnsemble(['2026-10-07'], 72.0);
  assert.equal(ensemble.times.length, 24);

  // Count GFS members
  const gfsKeys = Object.keys(ensemble.gfs).filter(k => k.startsWith('temperature_2m'));
  assert.equal(gfsKeys.length, 31, `Expected 31 GFS members, got ${gfsKeys.length}`);

  // Count ECMWF members
  const ecmwfKeys = Object.keys(ensemble.ecmwf).filter(k => k.startsWith('temperature_2m'));
  assert.equal(ecmwfKeys.length, 51, `Expected 51 ECMWF members, got ${ecmwfKeys.length}`);
});

test('Daily maximum temperature extraction finds daytime peaks across members', () => {
  const ensemble = generateSyntheticEnsemble(['2026-10-07', '2026-10-08'], 70.0);
  const { gfsMaxTemps, ecmwfMaxTemps, allMaxTemps } = extractDailyMaxTemperatures(ensemble, '2026-10-07');

  assert.equal(gfsMaxTemps.length, 31);
  assert.equal(ecmwfMaxTemps.length, 51);
  assert.equal(allMaxTemps.length, 82);

  // All daily max temperatures should be plausible (between 50°F and 90°F)
  for (const t of allMaxTemps) {
    assert(t >= 50 && t <= 90, `Unreasonable max temp: ${t}`);
  }

  const stats = computeSampleStats(allMaxTemps);
  assert(stats.mean >= 65 && stats.mean <= 75, `Mean max temp out of range: ${stats.mean}`);
  assert(stats.std > 0, 'Ensemble spread std should be > 0');
});

await asyncTest('fetchEnsembleForecast succeeds with fixture or graceful fallback', async () => {
  const fixture = generateSyntheticEnsemble(['2026-10-07'], 68.0);
  const result = await fetchEnsembleForecast(40.7829, -73.9654, 2, { fixture });
  assert.equal(result.times.length, 24);
  assert(result.gfs !== undefined);
  assert(result.ecmwf !== undefined);
});

// -----------------------------------------------------------------------------
// Suite 3: Fair Value Probability Calibration (ECDF, KDE, Superensemble)
// -----------------------------------------------------------------------------
console.log('\n[Suite 3] Probability Calibration Models (ECDF / KDE / Superensemble)');

test('Acceptance Criterion: Fair probability is strictly bounded in (0, 1)', () => {
  const ensemble = generateSyntheticEnsemble(['2026-10-07'], 70.0);

  // Case A: Exceedance bracket far above distribution (e.g. >= 120°F)
  const resExtremeHigh = calculateFairProbability(ensemble, '2026-10-07', { min: 120 }, 'ecdf');
  assert(resExtremeHigh.fairProb > 0.0, `Extreme high probability must be > 0: ${resExtremeHigh.fairProb}`);
  assert(resExtremeHigh.fairProb < 0.1, `Extreme high probability should be small: ${resExtremeHigh.fairProb}`);
  assert(isFinite(resExtremeHigh.logitProb));

  // Case B: Bracket far below distribution (e.g. <= 20°F)
  const resExtremeLow = calculateFairProbability(ensemble, '2026-10-07', { max: 20 }, 'ecdf');
  assert(resExtremeLow.fairProb > 0.0, `Extreme low probability must be > 0: ${resExtremeLow.fairProb}`);
  assert(resExtremeLow.fairProb < 0.1, `Extreme low probability should be small: ${resExtremeLow.fairProb}`);
  assert(isFinite(resExtremeLow.logitProb));

  // Case C: Wide bracket covering all (e.g. 30°F to 110°F)
  const resAll = calculateFairProbability(ensemble, '2026-10-07', { min: 30, max: 110 }, 'ecdf');
  assert(resAll.fairProb < 1.0, `Encompassing bracket must be < 1.0 due to Laplace smoothing: ${resAll.fairProb}`);
  assert(resAll.fairProb > 0.9, `Encompassing bracket should be high: ${resAll.fairProb}`);
  assert(isFinite(resAll.logitProb));
});

test('ECDF Laplace correction preserves valid probabilities when 0 members match', () => {
  const samples = [70, 71, 72, 73]; // 0 members >= 100
  const prob = calculateEcdfProbability(samples, { min: 100 }, 1.0);
  // (0 + 1) / (4 + 2) = 1/6 = 0.1667
  assert(prob > 0.0 && prob < 1.0);
  assert(Math.abs(prob - (1.0 / 6.0)) < 1e-4);
});

test('Gaussian KDE evaluates smooth probability and respects bracket bounds', () => {
  const ensemble = generateSyntheticEnsemble(['2026-10-07'], 75.0);
  const resKde = calculateFairProbability(ensemble, '2026-10-07', { min: 70, max: 80 }, 'kde');

  assert(resKde.fairProb > 0.0 && resKde.fairProb < 1.0);
  assert.equal(resKde.method, 'kde');
  assert.equal(resKde.sampleSize, 82);
  assert(resKde.ensembleMean >= 70 && resKde.ensembleMean <= 80);
});

test('Silverman bandwidth rule computes valid positive bandwidth', () => {
  const samples = [65, 67, 68, 69, 70, 71, 72, 74, 75, 78];
  const h = calculateBandwidthSilverman(samples);
  assert(h > 0.5 && h < 5.0, `Bandwidth h out of expected range: ${h}`);
});

test('Exceedance probability is monotonic: P(X >= K1) >= P(X >= K2) for K1 < K2', () => {
  const ensemble = generateSyntheticEnsemble(['2026-10-07'], 70.0);
  const p65 = calculateFairProbability(ensemble, '2026-10-07', { min: 65 }, 'kde').fairProb;
  const p70 = calculateFairProbability(ensemble, '2026-10-07', { min: 70 }, 'kde').fairProb;
  const p75 = calculateFairProbability(ensemble, '2026-10-07', { min: 75 }, 'kde').fairProb;

  assert(p65 >= p70, `Monotonicity violated: p65=${p65} < p70=${p70}`);
  assert(p70 >= p75, `Monotonicity violated: p70=${p70} < p75=${p75}`);
});

test('Superensemble blending combines ECMWF and GFS with horizon weighting', () => {
  const ensemble = generateSyntheticEnsemble(['2026-10-07'], 70.0);
  const resSuper = calculateFairProbability(ensemble, '2026-10-07', { min: 68, max: 74 }, 'super');

  assert(resSuper.fairProb > 0.0 && resSuper.fairProb < 1.0);
  assert.equal(resSuper.method, 'super');
});

// -----------------------------------------------------------------------------
// Suite 4: De-vigging Algorithms (Multiplicative, Power, Shin 1993)
// -----------------------------------------------------------------------------
console.log('\n[Suite 4] De-vigging Models (Multiplicative, Power, Shin 1993)');

test('Multiplicative De-vigging sums to 1.0 exactly', () => {
  const quoted = [0.60, 0.50]; // Overround s = 1.10
  const result = solveMultiplicativeDevig(quoted);

  assert.equal(result.overround, 1.10);
  const sum = result.trueProbs.reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - 1.0) < 1e-12, `Sum != 1: ${sum}`);
  assert(Math.abs(result.trueProbs[0] - (0.60 / 1.10)) < 1e-12);
  assert(Math.abs(result.trueProbs[1] - (0.50 / 1.10)) < 1e-12);
});

test('Power Method converges and sums to 1.0', () => {
  const quoted = [0.65, 0.45]; // Overround s = 1.10
  const result = solvePowerDevig(quoted);

  assert(result.iterations > 0 && result.iterations < 20);
  assert(result.r > 1.0, `Exponent r should be > 1: ${result.r}`);
  const sum = result.trueProbs.reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - 1.0) < 1e-12, `Sum != 1: ${sum}`);
});

test('Shin (1993) Model: Bisection convergence and probability conservation', () => {
  const quoted = [0.65, 0.45]; // s = 1.10
  const result = solveShinDevig(quoted);

  assert(result.z >= 0.0 && result.z < 1.0, `Shin z parameter out of bounds: ${result.z}`);
  assert(result.iterations > 0 && result.iterations < 60);
  
  const sum = result.trueProbs.reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - 1.0) < 1e-9, `Shin probabilities do not sum to 1.0: ${sum}`);
});

test('Shin (1993) corrects favorite-longshot bias compared to multiplicative normalization', () => {
  // Favorite: 0.70, Longshot: 0.40 (s = 1.10)
  const quoted = [0.70, 0.40];
  const mult = solveMultiplicativeDevig(quoted);
  const shin = solveShinDevig(quoted);

  // In Shin, the favorite gets higher probability than multiplicative, longshot gets lower
  assert(
    shin.trueProbs[0] > mult.trueProbs[0],
    `Shin favorite (${shin.trueProbs[0]}) should exceed multiplicative (${mult.trueProbs[0]})`
  );
  assert(
    shin.trueProbs[1] < mult.trueProbs[1],
    `Shin longshot (${shin.trueProbs[1]}) should be below multiplicative (${mult.trueProbs[1]})`
  );
});

test('Shin handles already-normalized and multi-outcome markets (N=3 and N=5)', () => {
  // Already normalized (s = 1.0)
  const norm = solveShinDevig([0.5, 0.5]);
  assert.equal(norm.z, 0.0);
  assert.equal(norm.trueProbs[0], 0.5);

  // 3 outcomes
  const quoted3 = [0.45, 0.35, 0.30]; // s = 1.10
  const res3 = solveShinDevig(quoted3);
  const sum3 = res3.trueProbs.reduce((a, b) => a + b, 0);
  assert(Math.abs(sum3 - 1.0) < 1e-9);

  // 5 outcomes
  const quoted5 = [0.30, 0.25, 0.25, 0.20, 0.15]; // s = 1.15
  const res5 = solveShinDevig(quoted5);
  const sum5 = res5.trueProbs.reduce((a, b) => a + b, 0);
  assert(Math.abs(sum5 - 1.0) < 1e-9);
});

test('Universal devig and devigMarket wrapper helpers', () => {
  const binary = devigMarket(0.40, 0.45); // bid=0.40, ask=0.45 -> implied askYes=0.45, askNo=0.60
  assert(binary.trueProbYes > 0 && binary.trueProbNo > 0);
  assert(Math.abs(binary.trueProbYes + binary.trueProbNo - 1.0) < 1e-9);

  const resUniversal = devig([0.55, 0.55], 'power');
  assert.equal(resUniversal.method, 'power');
  assert(Math.abs(resUniversal.trueProbs.reduce((a, b) => a + b, 0) - 1.0) < 1e-9);
});

// -----------------------------------------------------------------------------
// Suite 5: Dynamic Venue Fee Model & Net Edge
// -----------------------------------------------------------------------------
console.log('\n[Suite 5] Dynamic Venue Fee Model & Net Edge Calculations');

test('Category fee rates match Polymarket schedule', () => {
  assert.equal(getFeeRate('weather'), 0.05);
  assert.equal(getFeeRate('crypto'), 0.07);
  assert.equal(getFeeRate('sports'), 0.05);
  assert.equal(getFeeRate('politics'), 0.04);
  assert.equal(getFeeRate('finance'), 0.04);
  assert.equal(getFeeRate('geopolitics'), 0.00);
});

test('Exact Dynamic Taker Fee Formula: Fee = C * feeRate * p * (1 - p)', () => {
  // 100 shares at p = 0.50 in Weather (feeRate = 0.05):
  // 100 * 0.05 * 0.50 * 0.50 = 1.25 USDC
  const fee50 = calculateDynamicFee(100, 0.50, 'weather');
  assert.equal(fee50, 1.25);

  // 100 shares at p = 0.10: 100 * 0.05 * 0.10 * 0.90 = 0.45 USDC
  const fee10 = calculateDynamicFee(100, 0.10, 'weather');
  assert.equal(fee10, 0.45);

  // 100 shares at p = 0.90: 100 * 0.05 * 0.90 * 0.10 = 0.45 USDC (Symmetric!)
  const fee90 = calculateDynamicFee(100, 0.90, 'weather');
  assert.equal(fee90, 0.45);
});

test('Maker orders incur zero fees and earn 25% maker rebate in Weather', () => {
  const makerFee = calculateMakerFee(100, 0.50, 'weather');
  assert.equal(makerFee, 0.0);

  // 100 shares at 0.50: taker fee = 1.25 USDC. 25% rebate = 0.3125 USDC
  const rebate = calculateMakerRebate(100, 0.50, 'weather');
  assert.equal(rebate, 0.3125);
  assert.equal(getMakerRebateRate('weather'), 0.25);
});

test('Sub-threshold fee rounding (< 0.00001 USDC rounds down to 0.0)', () => {
  // 1 share at 0.0001: 1 * 0.05 * 0.0001 * 0.9999 = 0.0000049995 < 0.00001
  const dustFee = calculateDynamicFee(1, 0.0001, 'weather');
  assert.equal(dustFee, 0.0);
});

test('Acceptance Criterion: Net edge accurately subtracts venue fees from gross edge', () => {
  const fairProb = 0.65;
  const askPrice = 0.55;
  const bidPrice = 0.50;

  const edge = calculateNetEdge(fairProb, askPrice, bidPrice, 'weather');

  // YES outcome:
  // grossEdgeYes = 0.65 - 0.55 = 0.10
  // takerFeePerShare = 0.05 * 0.55 * (1 - 0.55) = 0.05 * 0.55 * 0.45 = 0.012375
  // netEdgeYes = 0.10 - 0.012375 = 0.087625 -> rounded to 0.08763
  assert.equal(edge.grossEdgeYes, 0.10);
  assert(Math.abs(edge.takerFeePerShareYes - 0.01238) < 1e-4);
  assert(Math.abs(edge.netEdgeYes - 0.08763) < 1e-4);
  assert(edge.netEdgeYes < edge.grossEdgeYes, 'Net edge must be lower than gross edge due to fee');

  // Break-even ask price: 0.55 + 0.012375 = 0.56238
  assert(Math.abs(edge.breakEvenAskYes - 0.56238) < 1e-4);
});

// -----------------------------------------------------------------------------
// Suite 6: Proper Scoring Rules & Weather Benchmark Acceptance
// -----------------------------------------------------------------------------
console.log('\n[Suite 6] Proper Scoring Rules & Benchmark Verification');

test('Brier Score: Evaluates mean squared error correctly', () => {
  // Perfect predictions: BS = 0.0
  const perfectBs = brierScore([1.0, 0.0, 1.0], [1, 0, 1]);
  assert.equal(perfectBs, 0.0);

  // Worst predictions: BS = 1.0
  const worstBs = brierScore([0.0, 1.0, 0.0], [1, 0, 1]);
  assert.equal(worstBs, 1.0);

  // Uninformative 0.5 predictions: BS = 0.25
  const coinFlipBs = brierScore([0.5, 0.5, 0.5, 0.5], [1, 0, 1, 0]);
  assert.equal(coinFlipBs, 0.25);
});

test('Numerically stable Log-Loss in logit space handles boundary probabilities', () => {
  const softplusVal = softplus(2.0);
  assert(Math.abs(softplusVal - (2.0 + Math.log(1 + Math.exp(-2.0)))) < 1e-12);

  // Test log-loss on near-boundary probabilities (1e-6 and 1 - 1e-6)
  const loss = logLoss([0.999999, 0.000001], [1, 0]);
  assert(isFinite(loss));
  assert(loss > 0.0 && loss < 1e-4, `Expected near-zero loss, got ${loss}`);

  // Test that wrong high-confidence predictions yield high penalty without NaN
  const wrongLoss = logLoss([0.999999], [0]);
  assert(isFinite(wrongLoss));
  assert(wrongLoss > 10.0, `Expected severe log-loss penalty, got ${wrongLoss}`);
});

test('Brier Skill Score measures percentage skill improvement', () => {
  // Model has BS = 0.10, reference market has BS = 0.20 -> BSS = 1 - (0.10 / 0.20) = +0.50 (50% skill)
  const bss = brierSkillScore([0.8, 0.2], [0.6, 0.4], [1, 0]);
  assert(bss > 0.0, `Expected positive BSS, got ${bss}`);
});

test('Acceptance Criterion: Model achieves demonstrably lower Brier Score than raw market probabilities across benchmark cases', () => {
  const benchmarkResult = runBenchmarkComparison();

  console.log(`\n    --- Benchmark Performance Summary ---`);
  console.log(`    Cases Evaluated:           ${benchmarkResult.caseCount}`);
  console.log(`    Ensemble Model Brier Score: ${benchmarkResult.brierScore.toFixed(5)}`);
  console.log(`    Raw Market Brier Score:     ${benchmarkResult.referenceBrierScore.toFixed(5)}`);
  console.log(`    Brier Score Reduction:     ${benchmarkResult.brierScoreReductionPercent}%`);
  console.log(`    Brier Skill Score (BSS):   ${benchmarkResult.brierSkillScore.toFixed(5)}`);
  console.log(`    Model Log-Loss:            ${benchmarkResult.logLoss.toFixed(5)}`);
  console.log(`    Market Log-Loss:           ${benchmarkResult.referenceLogLoss.toFixed(5)}`);
  console.log(`    Model Outperforms Market:  ${benchmarkResult.modelOutperforms}`);

  // Assertions from Acceptance Criteria
  assert.equal(benchmarkResult.modelSuperior, true, 'Model must achieve lower Brier Score than market');
  assert(
    benchmarkResult.brierScore < benchmarkResult.referenceBrierScore,
    `Model BS (${benchmarkResult.brierScore}) must be strictly lower than Market BS (${benchmarkResult.referenceBrierScore})`
  );
  assert(
    benchmarkResult.brierSkillScore > 0.15,
    `Model BSS must demonstrate significant edge (> 0.15), got ${benchmarkResult.brierSkillScore}`
  );
  assert(
    benchmarkResult.logLoss < benchmarkResult.referenceLogLoss,
    `Model Log-Loss must be lower than Market Log-Loss`
  );
});

// -----------------------------------------------------------------------------
// Test Summary & Process Exit
// -----------------------------------------------------------------------------
console.log('\n===============================================================');
console.log(`  TEST RESULTS: ${passedCount}/${testCount} PASSED (${failedCount} FAILED)`);
console.log('===============================================================\n');

if (failedCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
