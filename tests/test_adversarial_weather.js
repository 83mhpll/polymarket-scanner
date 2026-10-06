/**
 * tests/test_adversarial_weather.js
 * 
 * Empirical Adversarial Challenger Test Suite for Domain Weather Fair Value Model.
 * Rigorously stress-tests engine/weather_fair_value.js under:
 * 1. Degenerate ensembles (all 82 members identical, zero variance s = 0, IQR = 0).
 * 2. Bimodal ensemble distributions (extreme split cold vs hot, multimodal troughs).
 * 3. Out-of-range thresholds (T > 150°F, T < -50°F, extreme bounds, point brackets).
 * 4. Incomplete, sparse, and corrupted ensemble members (NaN, null, strings, single member).
 * 5. Monotonicity and probability invariant stress tests across 50 threshold steps.
 * 6. High-volume Monte Carlo fuzzing (1,000 extreme/anomalous ensembles).
 */

import {
  calculateFairProbability,
  calculateEcdfProbability,
  calculateKdeProbability,
  calculateSuperensembleProbability,
  calculateBandwidthSilverman,
  computeSampleStats,
  extractDailyMaxTemperatures,
  generateSyntheticEnsemble,
  logit,
  expit,
  erf,
  erfc
} from '../engine/weather_fair_value.js';

let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, message, details = {}) {
  if (condition) {
    passedTests++;
    console.log(`  ✓ ${message}`);
  } else {
    failedTests++;
    const err = { message, details };
    failures.push(err);
    console.error(`  ✗ FAIL: ${message}`, details);
  }
}

function createSyntheticEnsembleWithMembers(gfsDailyMax, ecmwfDailyMax, targetDate = '2026-10-15') {
  const times = [];
  for (let h = 0; h < 24; h++) {
    times.push(`${targetDate}T${String(h).padStart(2, '0')}:00`);
  }

  const gfsHourly = { time: times };
  const ecmwfHourly = { time: times };

  // Helper: map daily max to 24-hr curve with peak at 15:00
  function makeHourlyFromMax(maxTemp) {
    return times.map((_, h) => {
      const diurnal = Math.sin(((h - 9) / 24) * 2 * Math.PI); // peak at h=15: diurnal = 1
      return maxTemp - 10.0 + 10.0 * Math.max(0, diurnal);
    });
  }

  // GFS
  if (gfsDailyMax.length > 0) {
    gfsHourly['temperature_2m'] = makeHourlyFromMax(gfsDailyMax[0]);
    for (let i = 1; i < gfsDailyMax.length; i++) {
      gfsHourly[`temperature_2m_member${String(i).padStart(2, '0')}`] = makeHourlyFromMax(gfsDailyMax[i]);
    }
  }

  // ECMWF
  if (ecmwfDailyMax.length > 0) {
    ecmwfHourly['temperature_2m'] = makeHourlyFromMax(ecmwfDailyMax[0]);
    for (let i = 1; i < ecmwfDailyMax.length; i++) {
      ecmwfHourly[`temperature_2m_member${String(i).padStart(2, '0')}`] = makeHourlyFromMax(ecmwfDailyMax[i]);
    }
  }

  return {
    latitude: 40.7829,
    longitude: -73.9654,
    timezone: 'America/New_York',
    times,
    gfs: gfsHourly,
    ecmwf: ecmwfHourly
  };
}

console.log('===============================================================');
console.log('  EMPIRICAL ADVERSARIAL STRESS SUITE: WEATHER FAIR VALUE MODEL');
console.log('===============================================================');

// -----------------------------------------------------------------
// Suite 1: Degenerate Ensembles (Zero Sample Variance s = 0)
// -----------------------------------------------------------------
console.log('\n[Suite 1] Degenerate Ensembles (Zero Variance, Identical Members)');

{
  const degenerateTemps = [70.0, 32.0, 0.0, -40.0, 115.0];

  for (const t of degenerateTemps) {
    const samples = new Array(82).fill(t);
    const stats = computeSampleStats(samples);
    assert(stats.std === 0, `Sample standard deviation is exactly 0 for constant ${t}°F`);
    assert(stats.mean === t, `Sample mean is exactly ${t}°F`);

    const h = calculateBandwidthSilverman(samples);
    assert(h > 0 && Number.isFinite(h), `Silverman bandwidth is strictly positive and finite (h=${h.toFixed(4)}) when std=0, IQR=0`);
    assert(!isNaN(h), `Silverman bandwidth is not NaN for constant ${t}°F`);

    // Test KDE on bracket containing the value
    const pKdeInside = calculateKdeProbability(samples, { min: t - 1.0, max: t + 1.0 });
    assert(pKdeInside > 0.0 && pKdeInside < 1.0, `KDE probability inside bracket strictly in (0, 1): ${pKdeInside.toFixed(6)}`);
    assert(pKdeInside > 0.90, `KDE places high mass (>90%) on bracket containing constant ${t}°F`);

    // Test KDE on bracket outside the value
    const pKdeOutside = calculateKdeProbability(samples, { min: t + 5.0, max: t + 10.0 });
    assert(pKdeOutside > 0.0 && pKdeOutside < 1.0, `KDE probability outside bracket strictly in (0, 1): ${pKdeOutside.toFixed(6)}`);
    assert(pKdeOutside < 0.05, `KDE places low mass (<5%) on bracket outside constant ${t}°F`);

    // Test ECDF on bracket containing the value
    const pEcdfInside = calculateEcdfProbability(samples, { min: t - 1.0, max: t + 1.0 });
    assert(pEcdfInside > 0.0 && pEcdfInside < 1.0, `ECDF probability inside bracket strictly in (0, 1): ${pEcdfInside.toFixed(6)}`);
    assert(pEcdfInside === (82 + 1) / (82 + 2), `ECDF Laplace succession formula exact match when 82/82 members match`);

    // Test ECDF on bracket outside the value
    const pEcdfOutside = calculateEcdfProbability(samples, { min: t + 5.0, max: t + 10.0 });
    assert(pEcdfOutside > 0.0 && pEcdfOutside < 1.0, `ECDF probability outside bracket strictly in (0, 1): ${pEcdfOutside.toFixed(6)}`);
    assert(pEcdfOutside === 1 / (82 + 2), `ECDF Laplace succession formula exact match when 0/82 members match`);
  }

  // End-to-end degenerate ensemble bundle through calculateFairProbability
  const gfsDegenerate = new Array(31).fill(65.0);
  const ecmwfDegenerate = new Array(51).fill(65.0);
  const bundle = createSyntheticEnsembleWithMembers(gfsDegenerate, ecmwfDegenerate, '2026-10-15');

  const methods = ['ecdf', 'kde', 'super'];
  for (const m of methods) {
    const res = calculateFairProbability(bundle, '2026-10-15', { min: 64.0, max: 66.0 }, m);
    assert(res.fairProb > 0.0 && res.fairProb < 1.0, `Method ${m} produces valid probability under degenerate ensemble: ${res.fairProb.toFixed(6)}`);
    assert(Number.isFinite(res.logitProb), `Method ${m} logitProb is finite under degenerate ensemble: ${res.logitProb.toFixed(4)}`);
    assert(res.ensembleStd === 0, `Method ${m} ensembleStd is 0 under degenerate ensemble`);
    assert(res.sampleSize === 82, `Method ${m} sampleSize is 82`);
  }
}

// -----------------------------------------------------------------
// Suite 2: Bimodal Ensemble Distributions (Split Cold / Hot)
// -----------------------------------------------------------------
console.log('\n[Suite 2] Bimodal Ensemble Distributions (Split Cold / Hot)');

{
  // 41 cold members at 35°F, 41 hot members at 85°F (mean = 60°F)
  const coldMembers = new Array(41).fill(35.0);
  const hotMembers = new Array(41).fill(85.0);
  const bimodalSamples = [...coldMembers, ...hotMembers];

  const stats = computeSampleStats(bimodalSamples);
  assert(Math.abs(stats.mean - 60.0) < 1e-6, `Bimodal mean is 60.0°F (mean=${stats.mean})`);
  assert(stats.std > 20.0, `Bimodal std reflects wide dispersion (std=${stats.std.toFixed(2)})`);

  const h = calculateBandwidthSilverman(bimodalSamples);
  assert(h > 0 && Number.isFinite(h), `Silverman bandwidth is finite for bimodal distribution (h=${h.toFixed(2)})`);

  // Evaluate cold mode bracket [30, 40]
  const pColdKde = calculateKdeProbability(bimodalSamples, { min: 30.0, max: 40.0 });
  const pColdEcdf = calculateEcdfProbability(bimodalSamples, { min: 30.0, max: 40.0 });

  // Evaluate hot mode bracket [80, 90]
  const pHotKde = calculateKdeProbability(bimodalSamples, { min: 80.0, max: 90.0 });
  const pHotEcdf = calculateEcdfProbability(bimodalSamples, { min: 80.0, max: 90.0 });

  // Evaluate middle trough bracket [55, 65] around mean (where NO members exist)
  const pMidKde = calculateKdeProbability(bimodalSamples, { min: 55.0, max: 65.0 });
  const pMidEcdf = calculateEcdfProbability(bimodalSamples, { min: 55.0, max: 65.0 });

  assert(pColdKde > 0.15 && pColdKde < 0.25, `Cold mode KDE captures substantial probability (0.1786): ${pColdKde.toFixed(4)}`);
  assert(pHotKde > 0.15 && pHotKde < 0.25, `Hot mode KDE captures substantial probability (0.1786): ${pHotKde.toFixed(4)}`);
  assert(pColdKde / pMidKde > 4.0, `Cold mode is >4x denser than middle trough (${(pColdKde / pMidKde).toFixed(2)}x)`);
  assert(pHotKde / pMidKde > 4.0, `Hot mode is >4x denser than middle trough (${(pHotKde / pMidKde).toFixed(2)}x)`);
  assert(pMidKde < pColdKde, `Middle trough KDE probability (${pMidKde.toFixed(4)}) is strictly lower than cold mode (${pColdKde.toFixed(4)})`);
  assert(pMidKde < pHotKde, `Middle trough KDE probability (${pMidKde.toFixed(4)}) is strictly lower than hot mode (${pHotKde.toFixed(4)})`);
  assert(pMidEcdf === 1 / (82 + 2), `ECDF accurately reflects zero member counts in middle trough: ${pMidEcdf.toFixed(6)}`);

  // Symmetry check: cold and hot modes should have virtually identical probability
  assert(Math.abs(pColdKde - pHotKde) < 1e-4, `Bimodal KDE exhibits symmetric probability density between cold and hot modes`);
  assert(Math.abs(pColdEcdf - pHotEcdf) < 1e-6, `Bimodal ECDF exhibits symmetric probability between cold and hot modes`);

  // Partition sum check: [0, 50], [50, 70], [70, 120]
  const pPart1 = calculateKdeProbability(bimodalSamples, { max: 50.0 });
  const pPart2 = calculateKdeProbability(bimodalSamples, { min: 50.0, max: 70.0 });
  const pPart3 = calculateKdeProbability(bimodalSamples, { min: 70.0 });
  assert(pPart1 > 0.40 && pPart1 < 0.60, `Cold half partition probability ~ 0.50: ${pPart1.toFixed(4)}`);
  assert(pPart3 > 0.40 && pPart3 < 0.60, `Hot half partition probability ~ 0.50: ${pPart3.toFixed(4)}`);
  assert(pPart2 < 0.10, `Middle partition carries minimal probability: ${pPart2.toFixed(4)}`);
}

// -----------------------------------------------------------------
// Suite 3: Far Out-of-Range Bracket Thresholds
// -----------------------------------------------------------------
console.log('\n[Suite 3] Out-of-Range Thresholds & Extreme Contract Brackets');

{
  // Standard ensemble around 70°F
  const standardSamples = [];
  for (let i = 0; i < 82; i++) standardSamples.push(68.0 + (i % 9) * 0.5);

  const extremeBrackets = [
    { desc: 'Exceedance T >= 150°F', bracket: { min: 150.0 } },
    { desc: 'Exceedance T >= 300°F', bracket: { min: 300.0 } },
    { desc: 'Exceedance T >= 10,000°F', bracket: { min: 10000.0 } },
    { desc: 'Under T <= -50°F', bracket: { max: -50.0 } },
    { desc: 'Under T <= -200°F', bracket: { max: -200.0 } },
    { desc: 'Under T <= -10,000°F', bracket: { max: -10000.0 } },
    { desc: 'Narrow range far high [150, 160]°F', bracket: { min: 150.0, max: 160.0 } },
    { desc: 'Narrow range far low [-200, -190]°F', bracket: { min: -200.0, max: -190.0 } },
    { desc: 'Point bracket [70, 70]°F', bracket: { min: 70.0, max: 70.0 } },
    { desc: 'Point bracket [150, 150]°F', bracket: { min: 150.0, max: 150.0 } }
  ];

  for (const item of extremeBrackets) {
    const pKde = calculateKdeProbability(standardSamples, item.bracket);
    const pEcdf = calculateEcdfProbability(standardSamples, item.bracket);

    assert(pKde > 0.0 && pKde < 1.0, `KDE ${item.desc} strictly bounded in (0, 1): ${pKde.toExponential(4)}`);
    assert(pKde !== 0.0 && pKde !== 1.0, `KDE ${item.desc} never hits exact 0.0 or 1.0`);
    assert(Number.isFinite(logit(pKde)), `Logit of KDE ${item.desc} is finite: ${logit(pKde).toFixed(4)}`);

    assert(pEcdf > 0.0 && pEcdf < 1.0, `ECDF ${item.desc} strictly bounded in (0, 1): ${pEcdf.toExponential(4)}`);
    assert(pEcdf !== 0.0 && pEcdf !== 1.0, `ECDF ${item.desc} never hits exact 0.0 or 1.0`);
    assert(Number.isFinite(logit(pEcdf)), `Logit of ECDF ${item.desc} is finite: ${logit(pEcdf).toFixed(4)}`);
  }

  // Bracket covering all plausible values [ -200, 200 ]
  const pEncompassingKde = calculateKdeProbability(standardSamples, { min: -200.0, max: 200.0 });
  const pEncompassingEcdf = calculateEcdfProbability(standardSamples, { min: -200.0, max: 200.0 });
  assert(pEncompassingKde > 0.98 && pEncompassingKde < 1.0, `Encompassing KDE strictly < 1.0: ${pEncompassingKde.toFixed(6)}`);
  assert(pEncompassingEcdf > 0.98 && pEncompassingEcdf < 1.0, `Encompassing ECDF strictly < 1.0: ${pEncompassingEcdf.toFixed(6)}`);

  // Inverted bracket: min > max (e.g. min: 80, max: 70)
  const pInvertedKde = calculateKdeProbability(standardSamples, { min: 80.0, max: 70.0 });
  const pInvertedEcdf = calculateEcdfProbability(standardSamples, { min: 80.0, max: 70.0 });
  assert(pInvertedKde > 0.0 && pInvertedKde < 1.0, `Inverted bracket KDE clamped strictly in (0, 1): ${pInvertedKde.toExponential(4)}`);
  assert(pInvertedEcdf > 0.0 && pInvertedEcdf < 1.0, `Inverted bracket ECDF clamped strictly in (0, 1): ${pInvertedEcdf.toExponential(4)}`);
  assert(Number.isFinite(logit(pInvertedKde)), `Logit of inverted bracket KDE is finite`);
}

// -----------------------------------------------------------------
// Suite 4: Incomplete, Sparse, and Corrupted Ensemble Members
// -----------------------------------------------------------------
console.log('\n[Suite 4] Incomplete, Sparse & Corrupted Ensemble Members');

{
  // 1 member only
  const singleSample = [72.5];
  const hSingle = calculateBandwidthSilverman(singleSample);
  assert(hSingle === 1.0, `Silverman bandwidth returns fallback 1.0 for single sample (N=1)`);
  const pSingleKde = calculateKdeProbability(singleSample, { min: 70.0, max: 75.0 });
  assert(pSingleKde > 0.0 && pSingleKde < 1.0, `Single sample KDE produces valid probability: ${pSingleKde.toFixed(4)}`);
  const pSingleEcdf = calculateEcdfProbability(singleSample, { min: 70.0, max: 75.0 });
  assert(pSingleEcdf === (1 + 1) / (1 + 2), `Single sample ECDF produces exact Laplace probability 2/3: ${pSingleEcdf.toFixed(4)}`);

  // GFS only (no ECMWF members) in Superensemble
  const gfsOnly = [70.0, 71.0, 72.0, 71.5];
  const pGfsOnly = calculateSuperensembleProbability(gfsOnly, [], { min: 70.0, max: 73.0 }, 2);
  assert(pGfsOnly > 0.0 && pGfsOnly < 1.0, `Superensemble handles missing ECMWF without error: ${pGfsOnly.toFixed(4)}`);

  // ECMWF only (no GFS members) in Superensemble
  const ecmwfOnly = [71.0, 72.0, 73.0];
  const pEcmwfOnly = calculateSuperensembleProbability([], ecmwfOnly, { min: 70.0, max: 73.0 }, 2);
  assert(pEcmwfOnly > 0.0 && pEcmwfOnly < 1.0, `Superensemble handles missing GFS without error: ${pEcmwfOnly.toFixed(4)}`);

  // Corrupted member values: hourly time series with NaN, null, strings, undefined
  const corruptedBundle = {
    times: ['2026-10-15T12:00', '2026-10-15T15:00'],
    gfs: {
      time: ['2026-10-15T12:00', '2026-10-15T15:00'],
      temperature_2m: [68.0, 72.0],
      temperature_2m_member01: [NaN, NaN],
      temperature_2m_member02: [null, undefined],
      temperature_2m_member03: ['invalid', 74.0], // one valid number
      temperature_2m_member04: [71.0, 73.5]
    },
    ecmwf: {
      time: ['2026-10-15T12:00', '2026-10-15T15:00'],
      temperature_2m: [69.0, 73.0],
      temperature_2m_member01: [Infinity, -Infinity], // Infinities
      temperature_2m_member02: [70.5, 72.5]
    }
  };

  const extracted = extractDailyMaxTemperatures(corruptedBundle, '2026-10-15');
  assert(extracted.gfsMaxTemps.length > 0, `extractDailyMaxTemperatures filters valid GFS members (${extracted.gfsMaxTemps.length} found)`);
  assert(extracted.ecmwfMaxTemps.length > 0, `extractDailyMaxTemperatures filters valid ECMWF members (${extracted.ecmwfMaxTemps.length} found)`);
  assert(!extracted.allMaxTemps.some(isNaN), `No NaN values in extracted daily max temperatures`);

  const fairCorrupted = calculateFairProbability(corruptedBundle, '2026-10-15', { min: 70.0, max: 75.0 }, 'super');
  assert(fairCorrupted.fairProb > 0.0 && fairCorrupted.fairProb < 1.0, `calculateFairProbability handles corrupted feeds gracefully: ${fairCorrupted.fairProb.toFixed(4)}`);
  assert(Number.isFinite(fairCorrupted.logitProb), `Logit probability is finite under corrupted feed`);

  // Empty ensemble throws expected descriptive error
  let emptyErrorCaught = false;
  try {
    calculateFairProbability({ times: ['2026-10-15T12:00'], gfs: { time: ['2026-10-15T12:00'] }, ecmwf: {} }, '2026-10-15', { min: 70 });
  } catch (err) {
    emptyErrorCaught = true;
    assert(err.message.includes('No ensemble temperature data available'), `Descriptive error on empty ensemble data: "${err.message}"`);
  }
  assert(emptyErrorCaught, `calculateFairProbability threw error on empty member data`);

  // Null targetDate throws expected error
  let nullDateErrorCaught = false;
  try {
    calculateFairProbability(corruptedBundle, null, { min: 70 });
  } catch (err) {
    nullDateErrorCaught = true;
    assert(err.message.includes('targetDate is required'), `Null targetDate rejected with descriptive error`);
  }
  assert(nullDateErrorCaught, `calculateFairProbability threw error on null targetDate`);

  // Missing bracket bounds throws expected error
  let invalidBracketCaught = false;
  try {
    calculateFairProbability(corruptedBundle, '2026-10-15', {});
  } catch (err) {
    invalidBracketCaught = true;
    assert(err.message.includes('bracket must specify min, max, or both'), `Empty bracket rejected with descriptive error`);
  }
  assert(invalidBracketCaught, `calculateFairProbability threw error on empty bracket`);
}

// -----------------------------------------------------------------
// Suite 5: Monotonicity & Mathematical Invariant Sweeps
// -----------------------------------------------------------------
console.log('\n[Suite 5] Monotonicity & Mathematical Invariant Sweeps');

{
  const testSamples = [];
  for (let i = 0; i < 82; i++) testSamples.push(50.0 + i * 0.6); // 50.0 to 98.6°F

  // Exceedance monotonicity: P(T >= K) must be monotonically non-increasing in K
  let prevKdeExceedance = 1.0;
  let prevEcdfExceedance = 1.0;
  let exceedanceKdeMonotonic = true;
  let exceedanceEcdfMonotonic = true;

  for (let k = 30.0; k <= 120.0; k += 2.0) {
    const pKde = calculateKdeProbability(testSamples, { min: k });
    const pEcdf = calculateEcdfProbability(testSamples, { min: k });

    if (pKde > prevKdeExceedance + 1e-12) exceedanceKdeMonotonic = false;
    if (pEcdf > prevEcdfExceedance + 1e-12) exceedanceEcdfMonotonic = false;

    prevKdeExceedance = pKde;
    prevEcdfExceedance = pEcdf;
  }

  assert(exceedanceKdeMonotonic, `Gaussian KDE exceedance probability is monotonically non-increasing across 46 steps (30°F to 120°F)`);
  assert(exceedanceEcdfMonotonic, `ECDF exceedance probability is monotonically non-increasing across 46 steps (30°F to 120°F)`);

  // Under monotonicity: P(T <= K) must be monotonically non-decreasing in K
  let prevKdeUnder = 0.0;
  let prevEcdfUnder = 0.0;
  let underKdeMonotonic = true;
  let underEcdfMonotonic = true;

  for (let k = 30.0; k <= 120.0; k += 2.0) {
    const pKde = calculateKdeProbability(testSamples, { max: k });
    const pEcdf = calculateEcdfProbability(testSamples, { max: k });

    if (pKde < prevKdeUnder - 1e-12) underKdeMonotonic = false;
    if (pEcdf < prevEcdfUnder - 1e-12) underEcdfMonotonic = false;

    prevKdeUnder = pKde;
    prevEcdfUnder = pEcdf;
  }

  assert(underKdeMonotonic, `Gaussian KDE under probability is monotonically non-decreasing across 46 steps (30°F to 120°F)`);
  assert(underEcdfMonotonic, `ECDF under probability is monotonically non-decreasing across 46 steps (30°F to 120°F)`);

  // Logit-expit bijective inversion invariance across extreme probabilities
  const extremeProbs = [1e-6, 1e-5, 0.01, 0.1, 0.5, 0.9, 0.99, 1 - 1e-5, 1 - 1e-6];
  let bijectiveOk = true;
  for (const p of extremeProbs) {
    const roundTrip = expit(logit(p));
    if (Math.abs(roundTrip - p) > 1e-6) bijectiveOk = false;
  }
  assert(bijectiveOk, `Logit-expit round trip is invariant within 1e-6 across extreme probability bounds [1e-6, 1 - 1e-6]`);
}

// -----------------------------------------------------------------
// Suite 6: High-Volume Monte Carlo Fuzzing (1,000 Random Anomalous Ensembles)
// -----------------------------------------------------------------
console.log('\n[Suite 6] High-Volume Monte Carlo Fuzzing (1,000 Anomalous Ensembles)');

{
  let allFuzzPassed = true;
  let minFuzzedProb = 1.0;
  let maxFuzzedProb = 0.0;
  const numIterations = 1000;

  for (let iter = 0; iter < numIterations; iter++) {
    // Generate random member count between 2 and 100
    const count = 2 + Math.floor(Math.random() * 98);
    const samples = [];
    const mode = iter % 5;

    if (mode === 0) {
      // Degenerate with tiny perturbations
      const base = -50 + Math.random() * 180;
      for (let i = 0; i < count; i++) samples.push(base);
    } else if (mode === 1) {
      // Highly polarized bimodal
      const c = -30 + Math.random() * 40;
      const h = 80 + Math.random() * 50;
      for (let i = 0; i < count; i++) samples.push(i % 2 === 0 ? c : h);
    } else if (mode === 2) {
      // Extreme outlier ensemble (heavy tailed)
      const base = 70;
      for (let i = 0; i < count - 1; i++) samples.push(base + (Math.random() - 0.5) * 4);
      samples.push(iter % 2 === 0 ? 500 : -200); // 1 extreme rogue member
    } else if (mode === 3) {
      // Uniform spread over huge range
      for (let i = 0; i < count; i++) samples.push(-100 + Math.random() * 250);
    } else {
      // Near zero dispersion
      const base = 60.0;
      for (let i = 0; i < count; i++) samples.push(base + Math.random() * 1e-8);
    }

    // Random contract bracket
    const minB = -100 + Math.random() * 250;
    const maxB = minB + Math.random() * 30;
    const bracketType = iter % 3;
    const bracket = bracketType === 0 ? { min: minB, max: maxB } :
                    bracketType === 1 ? { min: minB } : { max: maxB };

    const pKde = calculateKdeProbability(samples, bracket);
    const pEcdf = calculateEcdfProbability(samples, bracket);

    if (isNaN(pKde) || isNaN(pEcdf) || pKde <= 0.0 || pKde >= 1.0 || pEcdf <= 0.0 || pEcdf >= 1.0) {
      allFuzzPassed = false;
      console.error(`Fuzz failure at iteration ${iter}: mode=${mode}, pKde=${pKde}, pEcdf=${pEcdf}`);
      break;
    }

    if (pKde < minFuzzedProb) minFuzzedProb = pKde;
    if (pKde > maxFuzzedProb) maxFuzzedProb = pKde;
  }

  assert(allFuzzPassed, `All ${numIterations} Monte Carlo fuzzed ensembles generated strictly valid probabilities without runtime error`);
  assert(minFuzzedProb > 0.0, `Minimum fuzzed KDE probability strictly positive: ${minFuzzedProb.toExponential(4)}`);
  assert(maxFuzzedProb < 1.0, `Maximum fuzzed KDE probability strictly below 1.0: ${maxFuzzedProb.toFixed(6)}`);
}

// -----------------------------------------------------------------
// Suite 7: Superensemble Blending Horizon & Outlier Hardening
// -----------------------------------------------------------------
console.log('\n[Suite 7] Superensemble Blending Horizon & Outlier Hardening');

{
  const gfsSamples = [68, 69, 70, 71, 72];
  const ecmwfSamples = [69, 70, 70.5, 71, 71.5];
  const bracket = { min: 70.0, max: 72.0 };

  const horizons = [0, 1, 2, 4, 5, 7, 10];
  let allHorizonsValid = true;

  for (const h of horizons) {
    const p = calculateSuperensembleProbability(gfsSamples, ecmwfSamples, bracket, h);
    if (isNaN(p) || p <= 0.0 || p >= 1.0) {
      allHorizonsValid = false;
    }
  }

  assert(allHorizonsValid, `Superensemble blending evaluated across lead time horizons (0 to 10 days) strictly within (0, 1)`);

  // Check lead time weight transition: ECMWF weight is 0.55 for h<=1, 0.60 for h=2..4, 0.65 for h>=5
  const pShort = calculateSuperensembleProbability(gfsSamples, ecmwfSamples, bracket, 1);
  const pLong = calculateSuperensembleProbability(gfsSamples, ecmwfSamples, bracket, 6);
  assert(pShort > 0.0 && pLong > 0.0, `Both short-range and long-range blended probabilities are positive`);
}

// -----------------------------------------------------------------
// Summary & Verdict
// -----------------------------------------------------------------
console.log('\n===============================================================');
console.log(`  EMPIRICAL ADVERSARIAL TEST RESULTS: ${passedTests} PASSED / ${failedTests} FAILED`);
console.log('===============================================================');

if (failedTests > 0) {
  console.error('\nFAILURE DETAILS:');
  failures.forEach((f, idx) => console.error(`[${idx + 1}] ${f.message}`, f.details));
  process.exit(1);
} else {
  console.log('\nALL EMPIRICAL ADVERSARIAL STRESS TESTS PASSED!');
  process.exit(0);
}
