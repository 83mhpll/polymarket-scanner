/**
 * engine/devigging.js
 * 
 * Standard and Microstructural De-vigging Algorithms for Prediction Markets.
 * Removes bookmaker / automated market maker overround to extract true unbiased probabilities:
 * 1. Multiplicative (Proportional Normalization)
 * 2. Power Method (Logarithmic Overround / Newton-Raphson Solver)
 * 3. Shin (1993) Microstructure Model (Informed Trader / Bisection Solver)
 */

/**
 * Validate probability array inputs.
 * @param {number[]} q - Quoted implied probabilities (asks or implied odds)
 */
function validateProbabilities(q) {
  if (!Array.isArray(q) || q.length === 0) {
    throw new TypeError('Implied probabilities must be a non-empty array of numbers');
  }
  for (let i = 0; i < q.length; i++) {
    const val = q[i];
    if (typeof val !== 'number' || isNaN(val) || val <= 0) {
      throw new RangeError(`Invalid probability at index ${i}: ${val}. Must be strictly positive.`);
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
 * Solves sum(q_i^r) = 1 for r > 1 using 1D Newton-Raphson root finding.
 * Then true probability p_i = q_i^r.
 * 
 * Decreases longshots more aggressively than favorites, partially adjusting for favorite-longshot bias.
 * 
 * @param {number[]} impliedProbs - Quoted probabilities
 * @param {number} maxIters - Maximum Newton-Raphson iterations (default 50)
 * @param {number} tol - Convergence tolerance (default 1e-12)
 * @returns {{ trueProbs: number[], r: number, overround: number, iterations: number, method: 'power' }}
 */
export function solvePowerDevig(impliedProbs, maxIters = 50, tol = 1e-12) {
  validateProbabilities(impliedProbs);
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

  // Initial estimate for r
  // sum(q_i^r) ~ 1. If q_i ~ s/n, (s/n)^r * n = 1 => r * ln(s/n) + ln(n) = 0
  let r = Math.max(1.0001, Math.log(n) / (Math.log(n) - Math.log(s)));
  if (isNaN(r) || !isFinite(r) || r <= 1.0) {
    r = 1.0 + (s - 1.0) / n;
  }

  let iterations = 0;
  for (let iter = 0; iter < maxIters; iter++) {
    iterations++;
    // g(r) = sum(q_i^r) - 1
    // g'(r) = sum(q_i^r * ln(q_i))
    let g = -1.0;
    let gPrime = 0.0;

    for (let i = 0; i < n; i++) {
      const qi = impliedProbs[i];
      const qiR = Math.pow(qi, r);
      g += qiR;
      gPrime += qiR * Math.log(qi);
    }

    if (Math.abs(g) < tol) {
      break;
    }

    if (Math.abs(gPrime) < 1e-15) {
      break;
    }

    const step = g / gPrime;
    r = r - step;

    // Guard against non-positive power
    if (r <= 0.1) {
      r = 0.1;
    }
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
 * Solves for equilibrium insider parameter z in [0, 1) and true probabilities p_i:
 * 
 * p_i(z) = [ sqrt(z^2 + 4(1 - z) * (q_i^2 / s)) - z ] / [ 2(1 - z) ]
 * 
 * The root z* satisfies F(z) = sum(p_i(z)) - 1 = 0.
 * Solved via high-precision 1D Bisection root-finding with tolerance 1e-10.
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

  let zLow = 0.0;
  let zHigh = 1.0 - 1e-7;
  let zMid = 0.0;
  let iterations = 0;

  // Function to evaluate sum(p_i(z))
  function evalSumP(z) {
    const twoOneMinusZ = 2.0 * (1.0 - z);
    const zSq = z * z;
    let sum = 0.0;
    for (let i = 0; i < n; i++) {
      const qi = impliedProbs[i];
      const term = Math.sqrt(zSq + 4.0 * (1.0 - z) * (qi * qi) / s);
      sum += (term - z) / twoOneMinusZ;
    }
    return sum;
  }

  for (let iter = 0; iter < maxIters; iter++) {
    iterations++;
    zMid = 0.5 * (zLow + zHigh);
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
  const twoOneMinusZ = 2.0 * (1.0 - z);
  const zSq = z * z;

  const rawProbs = impliedProbs.map(qi => {
    const term = Math.sqrt(zSq + 4.0 * (1.0 - z) * (qi * qi) / s);
    return (term - z) / twoOneMinusZ;
  });

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

  const askNo = 1.0 - bidYes;
  const implied = [askYes, askNo];
  const res = devig(implied, method);
  return {
    trueProbYes: res.trueProbs[0],
    trueProbNo: res.trueProbs[1],
    overround: res.overround,
    z: res.z,
    method: res.method
  };
}
