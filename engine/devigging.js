/**
 * engine/devigging.js
 * 
 * Standard and Microstructural De-vigging Algorithms for Prediction Markets.
 * Removes bookmaker / automated market maker overround to extract true unbiased probabilities:
 * 1. Multiplicative (Proportional Normalization)
 * 2. Power Method (Logarithmic Overround / Safeguarded Newton-Raphson Solver)
 * 3. Shin (1993) Microstructure Model (Informed Trader / Rationalized Bisection Solver)
 */

/**
 * Validate probability array inputs.
 * @param {number[]} q - Quoted implied probabilities (asks or implied odds)
 * @param {boolean} maxExclusive - Whether values must be strictly < 1.0 (true for Power solver)
 */
function validateProbabilities(q, maxExclusive = false) {
  if (!Array.isArray(q) || q.length === 0) {
    throw new TypeError('Implied probabilities must be a non-empty array of numbers');
  }
  for (let i = 0; i < q.length; i++) {
    const val = q[i];
    if (typeof val !== 'number' || isNaN(val) || val <= 0) {
      throw new RangeError(`Invalid probability at index ${i}: ${val}. Must be strictly positive.`);
    }
    if (maxExclusive && val >= 1.0) {
      throw new RangeError(`Invalid probability at index ${i}: ${val}. Implied probability must be strictly less than 1.0.`);
    }
  }
}

/**
 * Multiplicative De-vigging (Proportional Normalization).
 * Normalizes quoted probabilities proportionally by booksum:
 * p_i = q_i / sum(q_j)
 * 
 * Note: Ignores favorite-longshot bias.
 * 
 * @param {number[]} impliedProbs - Quoted probabilities
 * @returns {{ trueProbs: number[], overround: number, method: 'multiplicative' }}
 */
export function solveMultiplicativeDevig(impliedProbs) {
  validateProbabilities(impliedProbs);
  const s = impliedProbs.reduce((acc, v) => acc + v, 0);
  const trueProbs = impliedProbs.map(qi => qi / s);
  return {
    trueProbs,
    overround: s,
    method: 'multiplicative'
  };
}

/**
 * Power Method De-vigging (Margin-Weights / Logarithmic Solver).
 * Solves sum(q_i^r) = 1 for r using Safeguarded Newton-Raphson root finding with bisection fallback.
 * Then true probability p_i = q_i^r.
 * 
 * Decreases longshots more aggressively than favorites, partially adjusting for favorite-longshot bias.
 * 
 * @param {number[]} impliedProbs - Quoted probabilities (strictly in (0, 1))
 * @param {number} maxIters - Maximum iterations (default 60)
 * @param {number} tol - Convergence tolerance (default 1e-12)
 * @returns {{ trueProbs: number[], r: number, overround: number, iterations: number, method: 'power' }}
 */
export function solvePowerDevig(impliedProbs, maxIters = 60, tol = 1e-12) {
  // Validate that all q_i are strictly between 0 and 1.0 (q_i < 1.0 required for convergence)
  validateProbabilities(impliedProbs, true);
  const n = impliedProbs.length;
  const s = impliedProbs.reduce((acc, v) => acc + v, 0);

  if (Math.abs(s - 1.0) < 1e-9) {
    return {
      trueProbs: [...impliedProbs],
      r: 1.0,
      overround: s,
      iterations: 0,
      method: 'power'
    };
  }

  const qMax = Math.max(...impliedProbs);

  // Analytical bracket:
  // If s > 1.0, g(1) = s - 1 > 0. Since sum(q_i^r) <= n * qMax^r,
  // n * qMax^r <= 1 => r >= ln(n) / (-ln(qMax)), guaranteeing g(rHigh) <= 0.
  let rLow, rHigh;
  if (s > 1.0) {
    rLow = 1.0;
    const theoreticalUpper = Math.log(n) / (-Math.log(qMax));
    rHigh = Math.max(theoreticalUpper * 1.5, theoreticalUpper + 1.0);
  } else {
    // Underround: g(0) = n - 1 > 0 and g(1) = s - 1 < 0. Root in (0, 1).
    rLow = 1e-6;
    rHigh = 1.0;
  }

  function evalG(r) {
    let g = -1.0;
    let gPrime = 0.0;
    for (let i = 0; i < n; i++) {
      const qi = impliedProbs[i];
      const qiR = Math.pow(qi, r);
      g += qiR;
      gPrime += qiR * Math.log(qi);
    }
    return { g, gPrime };
  }

  // Ensure rHigh brackets the root
  let highEval = evalG(rHigh);
  while (highEval.g > 0 && rHigh < 1e8) {
    rHigh *= 2.0;
    highEval = evalG(rHigh);
  }

  // Initial estimate
  let r = Math.log(n) / (Math.log(n) - Math.log(s));
  if (isNaN(r) || !isFinite(r) || r <= rLow || r >= rHigh) {
    r = 0.5 * (rLow + rHigh);
  }

  let iterations = 0;
  for (let iter = 0; iter < maxIters; iter++) {
    iterations++;
    const { g, gPrime } = evalG(r);

    if (Math.abs(g) < tol || (rHigh - rLow) < tol) {
      break;
    }

    // Update active bracket
    if (g > 0) {
      rLow = r;
    } else {
      rHigh = r;
    }

    // Attempt Newton-Raphson step
    let nextR = r;
    if (Math.abs(gPrime) > 1e-15) {
      nextR = r - g / gPrime;
    }

    // Safeguard: if Newton step falls outside bracket or is non-finite, fall back to bisection
    if (nextR <= rLow || nextR >= rHigh || isNaN(nextR) || !isFinite(nextR)) {
      nextR = 0.5 * (rLow + rHigh);
    }

    r = nextR;
  }

  // Compute unnormalized true probabilities and re-normalize to ensure sum = 1.0 exactly
  const rawProbs = impliedProbs.map(qi => Math.pow(qi, r));
  const rawSum = rawProbs.reduce((acc, v) => acc + v, 0);
  const trueProbs = rawProbs.map(p => p / rawSum);

  return {
    trueProbs,
    r,
    overround: s,
    iterations,
    method: 'power'
  };
}

/**
 * Shin (1993) Microstructure De-vigging Model.
 * Models a dealer facing informed insider flow (proportion z) and noise traders (1 - z).
 * Solves for equilibrium insider parameter z in [0, 1) and true probabilities p_i.
 * 
 * Rationalized Shin Formulation:
 * Eliminates catastrophic cancellation as z -> 1 by multiplying by the conjugate:
 * p_i(z) = [ 2 * (q_i^2 / s) ] / [ sqrt(z^2 + 4(1 - z) * (q_i^2 / s)) + z ]
 * 
 * Root z* satisfies F(z) = sum(p_i(z)) - 1 = 0.
 * Solved via high-precision 1D Bisection root-finding with tolerance 1e-10.
 * For symmetric binary books, exact analytical theorem z* = s - 1 is utilized.
 * 
 * Interface Contract (PROJECT.md):
 * solveShinDevig(impliedProbs: number[]): { trueProbs: number[], z: number }
 * 
 * @param {number[]} impliedProbs - Quoted probabilities
 * @param {number} maxIters - Maximum bisection iterations (default 80)
 * @param {number} tol - Convergence tolerance (default 1e-10)
 * @returns {{ trueProbs: number[], z: number, overround: number, iterations: number, method: 'shin' }}
 */
export function solveShinDevig(impliedProbs, maxIters = 80, tol = 1e-10) {
  validateProbabilities(impliedProbs);
  const n = impliedProbs.length;
  const s = impliedProbs.reduce((acc, v) => acc + v, 0);

  // If already normalized or negative overround, return normalized probabilities
  if (Math.abs(s - 1.0) < 1e-9 || s <= 1.0) {
    const trueProbs = impliedProbs.map(qi => qi / s);
    return {
      trueProbs,
      z: 0.0,
      overround: s,
      iterations: 0,
      method: 'shin'
    };
  }

  // Bracket for insider fraction z is rigorously [0.0, 1.0]
  let zLow = 0.0;
  let zHigh = 1.0;
  let zMid = 0.0;
  let iterations = 0;

  // Precompute q_i^2 / s
  const qiSqOverS = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const qi = impliedProbs[i];
    qiSqOverS[i] = (qi * qi) / s;
  }

  // Check analytical theorem for symmetric binary books (z* = s - 1)
  const isSymmetricBinary = n === 2 && Math.abs(impliedProbs[0] - impliedProbs[1]) < 1e-12;

  // Function to evaluate sum(p_i(z)) using rationalized formulation
  function evalSumP(z) {
    const zSq = z * z;
    const fourOneMinusZ = 4.0 * (1.0 - z);
    let sum = 0.0;
    for (let i = 0; i < n; i++) {
      const term = Math.sqrt(zSq + fourOneMinusZ * qiSqOverS[i]);
      sum += (2.0 * qiSqOverS[i]) / (term + z);
    }
    return sum;
  }

  for (let iter = 0; iter < maxIters; iter++) {
    iterations++;
    if (isSymmetricBinary && iter === 0) {
      // Analytical root theorem: z* = s - 1
      zMid = Math.max(0.0, Math.min(1.0, s - 1.0));
    } else {
      zMid = 0.5 * (zLow + zHigh);
    }

    const sumP = evalSumP(zMid);
    const diff = sumP - 1.0;

    if (Math.abs(diff) < tol || (zHigh - zLow) < tol) {
      break;
    }

    if (diff > 0) {
      zLow = zMid;
    } else {
      zHigh = zMid;
    }
  }

  const z = zMid;
  const zSq = z * z;
  const fourOneMinusZ = 4.0 * (1.0 - z);

  const rawProbs = new Array(n);
  for (let i = 0; i < n; i++) {
    const term = Math.sqrt(zSq + fourOneMinusZ * qiSqOverS[i]);
    rawProbs[i] = (2.0 * qiSqOverS[i]) / (term + z);
  }

  // Re-normalize to ensure sum is strictly 1.0000000000
  const sumFinal = rawProbs.reduce((acc, v) => acc + v, 0);
  const trueProbs = rawProbs.map(p => p / sumFinal);

  return {
    trueProbs,
    z,
    overround: s,
    iterations,
    method: 'shin'
  };
}

/**
 * Universal De-vigging Dispatcher.
 * @param {number[]} impliedProbs - Quoted probabilities
 * @param {'shin' | 'power' | 'multiplicative'} method - De-vigging algorithm
 * @param {object} options - Solver options
 * @returns {{ trueProbs: number[], overround: number, method: string, z?: number, r?: number }}
 */
export function devig(impliedProbs, method = 'shin', options = {}) {
  switch (method.toLowerCase()) {
    case 'multiplicative':
    case 'mult':
      return solveMultiplicativeDevig(impliedProbs);
    case 'power':
      return solvePowerDevig(impliedProbs, options.maxIters, options.tol);
    case 'shin':
    default:
      return solveShinDevig(impliedProbs, options.maxIters, options.tol);
  }
}

/**
 * Convenience helper to de-vig a binary market from BBO quotes.
 * Quoted ask for YES is askYes, quoted ask for NO is 1 - bidYes (synthetic no ask).
 * Overround s = askYes + (1 - bidYes) = 1 + spread.
 * 
 * @param {number} bidYes - Best bid for YES (0 < bidYes < 1)
 * @param {number} askYes - Best ask for YES (bidYes <= askYes < 1)
 * @param {'shin' | 'power' | 'multiplicative'} method
 * @returns {{ trueProbYes: number, trueProbNo: number, z?: number, overround: number }}
 */
export function devigMarket(bidYes, askYes, method = 'shin') {
  if (bidYes >= askYes) {
    // Zero spread or crossed book
    const mid = (bidYes + askYes) / 2;
    return { trueProbYes: mid, trueProbNo: 1 - mid, overround: 1.0, z: 0 };
  }

  // Sanitize quotes to strictly stay within (0, 1) interval
  const sanitizedBidYes = Math.max(1e-6, Math.min(1.0 - 1e-6, bidYes));
  const sanitizedAskYes = Math.max(1e-6, Math.min(1.0 - 1e-6, askYes));
  const askNo = Math.max(1e-6, Math.min(1.0 - 1e-6, 1.0 - sanitizedBidYes));
  const implied = [sanitizedAskYes, askNo];
  const res = devig(implied, method);
  return {
    trueProbYes: res.trueProbs[0],
    trueProbNo: res.trueProbs[1],
    overround: res.overround,
    z: res.z,
    method: res.method
  };
}
