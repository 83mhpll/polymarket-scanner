// ══════════════════════════════════════════════════════════════════════
//  tests/test_adversarial_devigging.js
//  Empirical Challenger Suite: Numerical Stability & Boundary Stress Testing
//  De-vigging Solvers (Shin 1993, Power Solver, devigMarket)
// ══════════════════════════════════════════════════════════════════════

import assert from 'node:assert/strict';
import {
  solveShinDevig,
  solvePowerDevig,
  solveMultiplicativeDevig,
  devig,
  devigMarket
} from '../engine/devigging.js';

let totalTests = 0;
let passedTests = 0;

function runEmpiricalTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ PASS: ${name}`);
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.stack || err.message}`);
    throw err;
  }
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  EMPIRICAL CHALLENGER: DE-VIGGING NUMERICAL STABILITY SUITE');
console.log('═══════════════════════════════════════════════════════════════\n');

// ─────────────────────────────────────────────────────────────────────
// [Pillar 1] Shin (1993) Solver Extreme Stress & Microstructure Testing
// ─────────────────────────────────────────────────────────────────────
console.log('[Pillar 1] Shin (1993) Solver Extreme Stress & Boundary Analysis');

runEmpiricalTest('Shin: Extreme insider fractions z approaching 1 in symmetric books', () => {
  const targetZs = [0.99, 0.999, 0.9999, 0.99999, 0.999999, 0.9999999];
  for (const targetZ of targetZs) {
    const s = 1.0 + targetZ;
    const q = s / 2.0;
    const res = solveShinDevig([q, q]);

    assert(!isNaN(res.z), `z must not be NaN for targetZ=${targetZ}`);
    assert(isFinite(res.z), `z must be finite for targetZ=${targetZ}`);
    assert(Math.abs(res.z - targetZ) < 1e-9, `Target z=${targetZ} vs calculated z=${res.z}`);
    
    // Check probabilities
    const sumP = res.trueProbs.reduce((a, b) => a + b, 0);
    assert(Math.abs(sumP - 1.0) < 1e-12, `Sum of probabilities must equal 1.0 within 1e-12, got ${sumP}`);
    assert(res.trueProbs[0] > 0 && res.trueProbs[1] > 0, 'Probabilities must be strictly positive');
    assert(!isNaN(res.trueProbs[0]) && !isNaN(res.trueProbs[1]), 'Probabilities must not be NaN');
    assert(Math.abs(res.trueProbs[0] - 0.5) < 1e-10, `Symmetric book should yield 0.5, got ${res.trueProbs[0]}`);
    assert(Math.abs(res.trueProbs[1] - 0.5) < 1e-10, `Symmetric book should yield 0.5, got ${res.trueProbs[1]}`);
  }
});

runEmpiricalTest('Shin: Symmetric books across diverse price levels [0.55, 0.55], [0.8, 0.8], [0.999, 0.999]', () => {
  const symmetricCases = [
    [0.505, 0.505], // s = 1.01, z* = 0.01
    [0.55, 0.55],   // s = 1.10, z* = 0.10
    [0.60, 0.60],   // s = 1.20, z* = 0.20
    [0.75, 0.75],   // s = 1.50, z* = 0.50
    [0.80, 0.80],   // s = 1.60, z* = 0.60
    [0.90, 0.90],   // s = 1.80, z* = 0.80
    [0.95, 0.95],   // s = 1.90, z* = 0.90
    [0.999, 0.999]  // s = 1.998, z* = 0.998
  ];

  for (const book of symmetricCases) {
    const res = solveShinDevig(book);
    const expectedZ = (book[0] * 2) - 1.0;
    assert(Math.abs(res.z - expectedZ) < 1e-9, `Expected z=${expectedZ}, got ${res.z}`);
    const sum = res.trueProbs.reduce((a, b) => a + b, 0);
    assert(Math.abs(sum - 1.0) < 1e-12, `Sum != 1.0: ${sum}`);
    assert.equal(res.trueProbs.length, 2);
    assert(Math.abs(res.trueProbs[0] - 0.5) < 1e-10);
    assert(Math.abs(res.trueProbs[1] - 0.5) < 1e-10);
    assert(res.iterations >= 1);
  }
});

runEmpiricalTest('Shin: Extreme asymmetric books without symmetric shortcut', () => {
  const asymmetricCases = [
    [0.99, 0.90],           // Highly overrounded asymmetric
    [0.999, 0.990],         // Very high quotes near 1
    [0.9999, 0.0001],       // Extreme favorite-longshot
    [0.99999, 0.00001],     // Extreme disparity
    [0.90, 0.15],           // Mild overround
    [0.85, 0.25],           // Moderate overround
    [0.999999, 0.999990]    // Asymmetric near 1.0
  ];

  for (const book of asymmetricCases) {
    const res = solveShinDevig(book);
    assert(!isNaN(res.z), `z is NaN for ${JSON.stringify(book)}`);
    assert(isFinite(res.z), `z is not finite for ${JSON.stringify(book)}`);
    assert(res.z >= 0.0 && res.z <= 1.0, `z=${res.z} out of [0, 1]`);

    const sum = res.trueProbs.reduce((a, b) => a + b, 0);
    assert(Math.abs(sum - 1.0) < 1e-9, `Sum of probabilities must be 1.0 within 1e-9, got ${sum}`);

    for (let i = 0; i < res.trueProbs.length; i++) {
      const p = res.trueProbs[i];
      assert(!isNaN(p), `trueProbs[${i}] is NaN`);
      assert(isFinite(p), `trueProbs[${i}] is not finite`);
      assert(p > 0.0 && p < 1.0, `trueProbs[${i}]=${p} out of (0, 1)`);
    }

    // Monotonicity preservation: if q[0] > q[1], then p[0] > p[1]
    if (book[0] > book[1]) {
      assert(res.trueProbs[0] > res.trueProbs[1], 'Shin should preserve probability order');
    }
  }
});

runEmpiricalTest('Shin: Multi-outcome books (N = 3, 5, 10, 20, 50)', () => {
  const outcomeCounts = [3, 5, 10, 20, 50];
  for (const n of outcomeCounts) {
    // Generate overround of ~1.20
    const qVal = 1.20 / n;
    const book = new Array(n).fill(qVal);
    const res = solveShinDevig(book);

    assert(res.z >= 0.0 && res.z < 1.0, `z=${res.z} out of bounds for N=${n}`);
    const sum = res.trueProbs.reduce((a, b) => a + b, 0);
    assert(Math.abs(sum - 1.0) < 1e-9, `Sum != 1.0 for N=${n}: ${sum}`);

    for (const p of res.trueProbs) {
      assert(Math.abs(p - (1.0 / n)) < 1e-6, `Probability ${p} != expected ${1.0 / n} for N=${n}`);
    }
  }
});

runEmpiricalTest('Shin: Edge cases: negative or zero overround (s <= 1.0)', () => {
  const fairBook = [0.5, 0.5];
  const fairRes = solveShinDevig(fairBook);
  assert.equal(fairRes.z, 0.0);
  assert(Math.abs(fairRes.trueProbs[0] - 0.5) < 1e-12);
  assert(Math.abs(fairRes.trueProbs[1] - 0.5) < 1e-12);

  const underroundBook = [0.45, 0.45]; // s = 0.90
  const underRes = solveShinDevig(underroundBook);
  assert.equal(underRes.z, 0.0);
  assert(Math.abs(underRes.trueProbs[0] - 0.5) < 1e-12);
  assert(Math.abs(underRes.trueProbs[1] - 0.5) < 1e-12);
});

// ─────────────────────────────────────────────────────────────────────
// [Pillar 2] Power Solver Numerical Stability & Boundary Stress Testing
// ─────────────────────────────────────────────────────────────────────
console.log('\n[Pillar 2] Power Solver Numerical Stability & Boundary Stress Testing');

runEmpiricalTest('Power: Boundary inputs q_i >= 1.0 throw RangeError gracefully', () => {
  const invalidBooks = [
    [1.0, 0.5],
    [1.0000001, 0.2],
    [0.5, 1.0],
    [1.5, 0.2],
    [2.0, 0.5],
    [0.9, 1.0, 0.1]
  ];

  for (const book of invalidBooks) {
    assert.throws(
      () => solvePowerDevig(book),
      (err) => {
        assert(err instanceof RangeError, `Expected RangeError for book ${JSON.stringify(book)}, got ${err}`);
        assert(err.message.includes('strictly less than 1.0'));
        return true;
      }
    );
  }
});

runEmpiricalTest('Power: Non-positive or invalid inputs throw RangeError / TypeError', () => {
  const invalidInputs = [
    [0.0, 0.5],
    [-0.1, 0.5],
    [NaN, 0.5],
    ['0.5', 0.5],
    []
  ];

  for (const input of invalidInputs) {
    assert.throws(
      () => solvePowerDevig(input),
      (err) => {
        assert(err instanceof RangeError || err instanceof TypeError);
        return true;
      }
    );
  }
});

runEmpiricalTest('Power: N-outcome books (N=2, 5, 20, 50) across varied overrounds', () => {
  const testConfigurations = [
    { n: 2, overround: 1.01 },
    { n: 2, overround: 1.10 },
    { n: 2, overround: 1.50 },
    { n: 2, overround: 1.95 },
    { n: 5, overround: 1.05 },
    { n: 5, overround: 1.25 },
    { n: 5, overround: 1.80 },
    { n: 20, overround: 1.10 },
    { n: 20, overround: 1.40 },
    { n: 20, overround: 2.50 },
    { n: 50, overround: 1.05 },
    { n: 50, overround: 1.30 },
    { n: 50, overround: 3.00 }
  ];

  for (const config of testConfigurations) {
    const qVal = config.overround / config.n;
    // ensure all q_i < 1.0
    assert(qVal < 1.0, `qVal ${qVal} must be < 1.0 for valid test`);
    const book = new Array(config.n).fill(qVal);
    const res = solvePowerDevig(book);

    assert(res.r >= 1.0, `Overround ${config.overround} should give r >= 1.0, got ${res.r}`);
    assert(res.iterations > 0 && res.iterations <= 60, `Iterations out of bounds: ${res.iterations}`);

    const sum = res.trueProbs.reduce((a, b) => a + b, 0);
    assert(Math.abs(sum - 1.0) < 1e-12, `Sum != 1.0 for config ${JSON.stringify(config)}: ${sum}`);

    for (const p of res.trueProbs) {
      assert(Math.abs(p - (1.0 / config.n)) < 1e-6, `Prob mismatch for N=${config.n}`);
    }
  }
});

runEmpiricalTest('Power: Monotonic root convergence and bracket containment', () => {
  // Trace root convergence behavior across iterations
  // Using an asymmetric high-overround book
  const asymmetricBook = [0.80, 0.40, 0.30, 0.20]; // sum = 1.70
  const n = asymmetricBook.length;
  const s = asymmetricBook.reduce((a, b) => a + b, 0);
  const qMax = Math.max(...asymmetricBook);

  // Theoretical upper bracket from code:
  const theoreticalUpper = Math.log(n) / (-Math.log(qMax));
  let rHigh = Math.max(theoreticalUpper * 1.5, theoreticalUpper + 1.0);
  let rLow = 1.0;

  function evalG(r) {
    let g = -1.0;
    for (let i = 0; i < n; i++) {
      g += Math.pow(asymmetricBook[i], r);
    }
    return g;
  }

  // Bracket check: g(rLow) > 0 and g(rHigh) < 0
  assert(evalG(rLow) > 0, `g(rLow=${rLow}) must be positive`);
  
  while (evalG(rHigh) > 0 && rHigh < 1e8) {
    rHigh *= 2.0;
  }
  assert(evalG(rHigh) < 0, `g(rHigh=${rHigh}) must be negative`);

  const res = solvePowerDevig(asymmetricBook);
  assert(res.r > rLow && res.r < rHigh, `Root ${res.r} must lie strictly within [${rLow}, ${rHigh}]`);
  
  // Power method adjusts for favorite-longshot: relative ratio of favorite to longshot increases
  const rawRatio = asymmetricBook[0] / asymmetricBook[3]; // 0.80 / 0.20 = 4.0
  const devigRatio = res.trueProbs[0] / res.trueProbs[3];
  assert(devigRatio > rawRatio, `Power devigging must penalize longshots more: raw ratio ${rawRatio} vs devig ${devigRatio}`);
});

runEmpiricalTest('Power: Extreme underround book (s < 1.0) converges with r in (0, 1)', () => {
  const underroundCases = [
    [0.45, 0.45],       // sum = 0.90
    [0.30, 0.30, 0.30], // sum = 0.90
    [0.10, 0.10]        // sum = 0.20 (deep underround)
  ];

  for (const book of underroundCases) {
    const res = solvePowerDevig(book);
    assert(res.r > 0.0 && res.r < 1.0, `Underround r should be in (0, 1), got ${res.r}`);
    const sum = res.trueProbs.reduce((a, b) => a + b, 0);
    assert(Math.abs(sum - 1.0) < 1e-12, `Sum != 1.0 for underround: ${sum}`);
  }
});

// ─────────────────────────────────────────────────────────────────────
// [Pillar 3] devigMarket() Boundary & Sanitization Stress Testing
// ─────────────────────────────────────────────────────────────────────
console.log('\n[Pillar 3] devigMarket() Boundary & Sanitization Stress Testing');

runEmpiricalTest('devigMarket: Extreme zero-bid quotes (bidYes = 0.0)', () => {
  const methods = ['shin', 'power', 'multiplicative'];
  const testAsks = [0.01, 0.10, 0.50, 0.90, 0.99, 0.999999];

  for (const method of methods) {
    for (const askYes of testAsks) {
      const res = devigMarket(0.0, askYes, method);
      assert(!isNaN(res.trueProbYes), `trueProbYes is NaN for method=${method}, ask=${askYes}`);
      assert(!isNaN(res.trueProbNo), `trueProbNo is NaN for method=${method}, ask=${askYes}`);
      assert(isFinite(res.trueProbYes), `trueProbYes not finite`);
      assert(isFinite(res.trueProbNo), `trueProbNo not finite`);
      assert(res.trueProbYes > 0.0 && res.trueProbYes < 1.0, `trueProbYes=${res.trueProbYes} out of (0, 1)`);
      assert(res.trueProbNo > 0.0 && res.trueProbNo < 1.0, `trueProbNo=${res.trueProbNo} out of (0, 1)`);
      
      const sum = res.trueProbYes + res.trueProbNo;
      assert(Math.abs(sum - 1.0) < 1e-9, `Sum != 1.0: ${sum}`);
    }
  }
});

runEmpiricalTest('devigMarket: Identical bid and ask (bidYes == askYes, zero spread)', () => {
  const zeroSpreadCases = [0.0, 0.01, 0.25, 0.50, 0.75, 0.99, 1.0];

  for (const price of zeroSpreadCases) {
    const res = devigMarket(price, price, 'shin');
    assert.equal(res.trueProbYes, price);
    assert.equal(res.trueProbNo, 1 - price);
    assert.equal(res.overround, 1.0);
    assert.equal(res.z, 0);
  }
});

runEmpiricalTest('devigMarket: Crossed book quotes (bidYes > askYes)', () => {
  const crossedCases = [
    { bid: 0.60, ask: 0.50, expectedMid: 0.55 },
    { bid: 0.80, ask: 0.40, expectedMid: 0.60 },
    { bid: 0.99, ask: 0.01, expectedMid: 0.50 }
  ];

  for (const c of crossedCases) {
    const res = devigMarket(c.bid, c.ask, 'shin');
    assert(Math.abs(res.trueProbYes - c.expectedMid) < 1e-12, `Expected mid ${c.expectedMid}, got ${res.trueProbYes}`);
    assert(Math.abs(res.trueProbNo - (1 - c.expectedMid)) < 1e-12, `Expected midNo ${1 - c.expectedMid}, got ${res.trueProbNo}`);
    assert.equal(res.overround, 1.0);
  }
});

runEmpiricalTest('devigMarket: Quotes near boundaries (askYes near 1.0, bidYes near 0.0)', () => {
  const boundaryQuotes = [
    { bid: 0.000001, ask: 0.999999 },
    { bid: 1e-9, ask: 1.0 - 1e-9 },
    { bid: 0.0, ask: 1.0 },
    { bid: 1.0, ask: 1.0 }
  ];

  for (const q of boundaryQuotes) {
    for (const method of ['shin', 'power', 'multiplicative']) {
      const res = devigMarket(q.bid, q.ask, method);
      assert(!isNaN(res.trueProbYes), `NaN on ${JSON.stringify(q)} with ${method}`);
      assert(!isNaN(res.trueProbNo), `NaN on ${JSON.stringify(q)} with ${method}`);
      assert(isFinite(res.trueProbYes));
      assert(isFinite(res.trueProbNo));
      const sum = res.trueProbYes + res.trueProbNo;
      assert(Math.abs(sum - 1.0) < 1e-9, `Sum != 1.0 on ${JSON.stringify(q)} with ${method}`);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────
// [Pillar 4] Floating-Point Robustness & Comparative Invariance
// ─────────────────────────────────────────────────────────────────────
console.log('\n[Pillar 4] Floating-Point Robustness & Comparative Invariance');

runEmpiricalTest('Shin vs Multiplicative: Shin favorite probability exceeds Multiplicative favorite probability', () => {
  // Shin microstructure attributes spread to informed trading, which implies favorites
  // are less overtaxed than longshots compared to proportional normalization.
  const book = [0.80, 0.40]; // Overround = 1.20
  const shinRes = solveShinDevig(book);
  const multRes = solveMultiplicativeDevig(book);

  assert(shinRes.trueProbs[0] > multRes.trueProbs[0], 
    `Shin favorite ${shinRes.trueProbs[0]} should exceed Multiplicative favorite ${multRes.trueProbs[0]}`);
  assert(shinRes.trueProbs[1] < multRes.trueProbs[1],
    `Shin longshot ${shinRes.trueProbs[1]} should be lower than Multiplicative longshot ${multRes.trueProbs[1]}`);
});

runEmpiricalTest('Universal Dispatcher devig() interface routing', () => {
  const book = [0.60, 0.60];
  const rShin = devig(book, 'shin');
  const rPower = devig(book, 'power');
  const rMult = devig(book, 'multiplicative');

  assert.equal(rShin.method, 'shin');
  assert.equal(rPower.method, 'power');
  assert.equal(rMult.method, 'multiplicative');
  assert.equal(typeof rShin.z, 'number');
  assert.equal(typeof rPower.r, 'number');
  assert.equal(rMult.z, undefined);
});

runEmpiricalTest('Monte Carlo Fuzz: 1,000 randomized binary books across diverse spreads', () => {
  for (let trial = 0; trial < 1000; trial++) {
    const s = 1.001 + Math.random() * 0.98;
    const minQ = Math.max(0.01, s - 0.99);
    const maxQ = Math.min(0.99, s - 0.01);
    const q0 = minQ + Math.random() * (maxQ - minQ);
    const q1 = s - q0;

    // Shin
    const shin = solveShinDevig([q0, q1]);
    const sumShin = shin.trueProbs[0] + shin.trueProbs[1];
    assert(Math.abs(sumShin - 1.0) < 1e-11, `Shin sum failed on trial ${trial}: ${sumShin}`);
    assert(!isNaN(shin.z) && isFinite(shin.z) && shin.z >= 0 && shin.z <= 1);
    assert(shin.trueProbs[0] > 0 && shin.trueProbs[0] < 1);
    assert(shin.trueProbs[1] > 0 && shin.trueProbs[1] < 1);

    // Power
    const power = solvePowerDevig([q0, q1]);
    const sumPower = power.trueProbs[0] + power.trueProbs[1];
    assert(Math.abs(sumPower - 1.0) < 1e-11, `Power sum failed on trial ${trial}: ${sumPower}`);
    assert(!isNaN(power.r) && isFinite(power.r) && power.r >= 1.0);
    assert(power.trueProbs[0] > 0 && power.trueProbs[0] < 1);
    assert(power.trueProbs[1] > 0 && power.trueProbs[1] < 1);
  }
});

runEmpiricalTest('Monte Carlo Fuzz: 1,000 randomized multi-outcome books (N=3..50)', () => {
  let evaluated = 0;
  for (let trial = 0; trial < 1000; trial++) {
    const N = Math.floor(3 + Math.random() * 48); // 3 to 50 outcomes
    let raw = [];
    for (let i = 0; i < N; i++) raw.push(Math.random() + 0.05);
    const rawSum = raw.reduce((a, b) => a + b, 0);
    const targetOverround = 1.05 + Math.random() * 1.45;
    const q = raw.map(x => (x / rawSum) * targetOverround);
    const qMax = Math.max(...q);
    if (qMax >= 0.999) continue;

    const shin = solveShinDevig(q);
    const sumShin = shin.trueProbs.reduce((a, b) => a + b, 0);
    assert(Math.abs(sumShin - 1.0) < 1e-9, `Shin multi-outcome sum failed: ${sumShin}`);
    assert(!isNaN(shin.z) && shin.z >= 0 && shin.z <= 1);

    const power = solvePowerDevig(q);
    const sumPower = power.trueProbs.reduce((a, b) => a + b, 0);
    assert(Math.abs(sumPower - 1.0) < 1e-9, `Power multi-outcome sum failed: ${sumPower}`);
    assert(!isNaN(power.r) && power.r >= 1.0);
    evaluated++;
  }
  assert(evaluated >= 950, `Evaluated only ${evaluated} multi-outcome books`);
});

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  EMPIRICAL DE-VIGGING STRESS RESULTS: ${passedTests}/${totalTests} PASSED (0 FAILED)`);
console.log('═══════════════════════════════════════════════════════════════\n');
