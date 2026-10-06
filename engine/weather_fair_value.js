/**
 * engine/weather_fair_value.js
 * 
 * Domain Fair Value Quantitative Model (Weather & Ensemble NWP).
 * Calibrated for prediction markets (e.g. Polymarket daily maximum temperature brackets).
 * Features:
 * - Open-Meteo GFS (31 members) & ECMWF IFS (51 members) ensemble NWP ingestion.
 * - Numerically stable logit/expit transformations with boundary clamping.
 * - Continuity-corrected Empirical CDF (ECDF) with Laplace smoothing (guarantees p in (0, 1)).
 * - Gaussian Kernel Density Estimation (KDE) with Silverman bandwidth and error function integration.
 * - Superensemble lead-time reliability weighting.
 * - Target station coordinate resolution (KNYC Central Park 40.7829, -73.9654, etc.).
 */

// Target meteorological stations
export const STATIONS = {
  KNYC: { id: 'KNYC', name: 'New York Central Park', lat: 40.7829, lon: -73.9654, timezone: 'America/New_York', unit: 'fahrenheit' },
  KORD: { id: 'KORD', name: "Chicago O'Hare", lat: 41.9742, lon: -87.9073, timezone: 'America/Chicago', unit: 'fahrenheit' },
  KMIA: { id: 'KMIA', name: 'Miami International', lat: 25.7959, lon: -80.2870, timezone: 'America/New_York', unit: 'fahrenheit' },
  KLAX: { id: 'KLAX', name: 'Los Angeles International', lat: 33.9416, lon: -118.4085, timezone: 'America/Los_Angeles', unit: 'fahrenheit' },
  EGLL: { id: 'EGLL', name: 'London Heathrow', lat: 51.4700, lon: -0.4543, timezone: 'Europe/London', unit: 'celsius' }
};

/**
 * Numerically stable logit transformation: log(p / (1 - p))
 * Clamps input probability to [epsilon, 1 - epsilon] to avoid NaN/Infinity.
 * @param {number} p - Probability in [0, 1]
 * @param {number} epsilon - Clamping bound (default 1e-7)
 * @returns {number} Log-odds in (-inf, +inf)
 */
export function logit(p, epsilon = 1e-7) {
  if (typeof p !== 'number' || isNaN(p)) {
    throw new TypeError(`Invalid probability input to logit: ${p}`);
  }
  const clamped = Math.max(epsilon, Math.min(1 - epsilon, p));
  return Math.log(clamped / (1 - clamped));
}

/**
 * Numerically stable logistic sigmoid (expit) transformation: 1 / (1 + exp(-eta))
 * Uses branch-safe formulation to eliminate floating-point overflow for large |eta|.
 * @param {number} eta - Log-odds in (-inf, +inf)
 * @returns {number} Probability strictly in (0, 1)
 */
export function expit(eta) {
  if (typeof eta !== 'number' || isNaN(eta)) {
    throw new TypeError(`Invalid log-odds input to expit: ${eta}`);
  }
  if (eta >= 0) {
    const z = Math.exp(-eta);
    return 1 / (1 + z);
  } else {
    const z = Math.exp(eta);
    return z / (1 + z);
  }
}

/**
 * High-precision complementary error function erfc(x)
 * Implemented via Chebyshev rational approximation (Abramowitz & Stegun 7.1.26).
 * Maximum relative error < 1.5e-7.
 * @param {number} x
 * @returns {number}
 */
export function erfc(x) {
  if (isNaN(x)) return NaN;
  if (x === 0) return 1.0;
  const z = Math.abs(x);
  const t = 1.0 / (1.0 + 0.3275911 * z);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  
  const poly = ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t;
  const erfVal = 1.0 - poly * Math.exp(-z * z);
  
  return x >= 0 ? 1.0 - erfVal : 1.0 + erfVal;
}

/**
 * Error function erf(x) = 1 - erfc(x)
 * @param {number} x
 * @returns {number}
 */
export function erf(x) {
  if (x === 0) return 0.0;
  return 1.0 - erfc(x);
}

/**
 * Standard Normal Cumulative Distribution Function Phi(z)
 * @param {number} z
 * @returns {number} Probability in (0, 1)
 */
export function standardNormalCdf(z) {
  return 0.5 * erfc(-z / Math.SQRT2);
}

/**
 * Compute sample mean and standard deviation of an array of numbers.
 * @param {number[]} values
 * @returns {{ mean: number, std: number, count: number }}
 */
export function computeSampleStats(values) {
  if (!values || values.length === 0) {
    return { mean: 0, std: 0, count: 0 };
  }
  const n = values.length;
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  if (n === 1) {
    return { mean, std: 0, count: 1 };
  }
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (n - 1);
  return { mean, std: Math.sqrt(variance), count: n };
}

/**
 * Silverman's Rule of Thumb optimal bandwidth for Gaussian Kernel Density Estimation:
 * h = 1.06 * min(std, IQR / 1.34) * M^(-1/5)
 * @param {number[]} samples - Ensemble samples
 * @returns {number} Optimal bandwidth h > 0
 */
export function calculateBandwidthSilverman(samples) {
  const n = samples.length;
  if (n < 2) return 1.0;
  
  const { std } = computeSampleStats(samples);
  const sorted = [...samples].sort((a, b) => a - b);
  
  // Calculate Interquartile Range (IQR)
  const q1 = sorted[Math.floor(n * 0.25)];
  const q3 = sorted[Math.floor(n * 0.75)];
  const iqr = q3 - q1;
  
  let spread = std;
  if (iqr > 0) {
    spread = Math.min(std, iqr / 1.34);
  }
  if (spread <= 0 || isNaN(spread)) {
    spread = std > 0 ? std : 1.0;
  }
  
  const h = 1.06 * spread * Math.pow(n, -0.2);
  return Math.max(0.1, h);
}

/**
 * Generate a synthetic ensemble forecast matching Open-Meteo schemas.
 * Used for deterministic testing, offline environments, or fallback.
 * GFS: 31 members. ECMWF: 51 members.
 * @param {string[]} dates - Array of ISO date strings (e.g. ['2026-10-07', '2026-10-08'])
 * @param {number} baseTemp - Center temperature (e.g. 68.0 °F)
 * @returns {object} Open-Meteo compliant ensemble data object
 */
export function generateSyntheticEnsemble(dates = ['2026-10-07', '2026-10-08'], baseTemp = 68.0) {
  const times = [];
  // 24 hours for each date
  for (const date of dates) {
    for (let h = 0; h < 24; h++) {
      const hh = String(h).padStart(2, '0');
      times.push(`${date}T${hh}:00`);
    }
  }

  const gfsHourly = { time: times };
  const ecmwfHourly = { time: times };

  // Helper to generate diurnal temperature cycle with pseudo-random seed
  function makeDiurnalCurve(seed, peakTemp, amp) {
    return times.map((t, idx) => {
      const hour = idx % 24;
      // Daily peak at 15:00 local time
      const diurnal = Math.sin(((hour - 9) / 24) * 2 * Math.PI);
      const perturb = Math.sin(idx * 0.5 + seed) * 1.5;
      return Math.round((peakTemp - amp + amp * diurnal + perturb) * 10) / 10;
    });
  }

  // GFS: 31 members (control + member01..member30)
  gfsHourly['temperature_2m'] = makeDiurnalCurve(0, baseTemp, 7.0);
  for (let m = 1; m <= 30; m++) {
    const key = `temperature_2m_member${String(m).padStart(2, '0')}`;
    const spread = (m - 15) * 0.45;
    gfsHourly[key] = makeDiurnalCurve(m, baseTemp + spread, 7.0 + (m % 3) * 0.5);
  }

  // ECMWF: 51 members (control + member01..member50)
  ecmwfHourly['temperature_2m'] = makeDiurnalCurve(100, baseTemp + 0.5, 6.8);
  for (let m = 1; m <= 50; m++) {
    const key = `temperature_2m_member${String(m).padStart(2, '0')}`;
    const spread = (m - 25) * 0.35;
    ecmwfHourly[key] = makeDiurnalCurve(m + 100, baseTemp + 0.5 + spread, 6.8 + (m % 4) * 0.4);
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

/**
 * Fetch ensemble forecast from Open-Meteo Ensemble API.
 * Falls back to deterministic synthetic data if network fails or options.useFixture is true.
 * @param {number} lat - Latitude (default KNYC 40.7829)
 * @param {number} lon - Longitude (default KNYC -73.9654)
 * @param {number} days - Forecast days (default 7)
 * @param {object} options - Fetch options, timeout, fixture
 * @returns {Promise<object>} Ensemble forecast bundle
 */
export async function fetchEnsembleForecast(lat = 40.7829, lon = -73.9654, days = 7, options = {}) {
  if (options.fixture) {
    return options.fixture;
  }

  const endpoint = `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${lat}&longitude=${lon}&hourly=temperature_2m&models=gfs025,ecmwf_ifs025_ensemble&temperature_unit=fahrenheit&timezone=America%2FNew_York&forecast_days=${days}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs || 4000);

    const res = await fetch(endpoint, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Open-Meteo API returned HTTP ${res.status}`);
    }

    const data = await res.json();
    return {
      latitude: data.latitude,
      longitude: data.longitude,
      timezone: data.timezone,
      times: data.hourly?.time || [],
      raw: data,
      gfs: extractModelHourly(data.hourly, 'gfs'),
      ecmwf: extractModelHourly(data.hourly, 'ecmwf')
    };
  } catch (err) {
    // Graceful offline fallback
    const today = new Date().toISOString().slice(0, 10);
    const dates = [today];
    for (let i = 1; i < days; i++) {
      const d = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10);
      dates.push(d);
    }
    return generateSyntheticEnsemble(dates, 70.0);
  }
}

/**
 * Filter and extract hourly columns for a specific model prefix.
 */
function extractModelHourly(hourlyObj, modelPrefix) {
  if (!hourlyObj) return {};
  const result = { time: hourlyObj.time || [] };
  for (const [key, val] of Object.entries(hourlyObj)) {
    if (key.includes(modelPrefix) || key.startsWith('temperature_2m')) {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Extract daily maximum temperatures for each ensemble member on targetDate.
 * Target resolution metric: maximum temperature recorded across 00:00 to 23:00 local time.
 * @param {object} ensembleData - Ensemble forecast object (from fetchEnsembleForecast or generateSyntheticEnsemble)
 * @param {string} targetDate - 'YYYY-MM-DD'
 * @returns {{ gfsMaxTemps: number[], ecmwfMaxTemps: number[], allMaxTemps: number[] }}
 */
export function extractDailyMaxTemperatures(ensembleData, targetDate) {
  if (!ensembleData) {
    throw new Error('ensembleData is required');
  }

  const times = ensembleData.times || ensembleData.gfs?.time || ensembleData.raw?.hourly?.time || [];
  if (!times || times.length === 0) {
    throw new Error('No time series found in ensembleData');
  }

  // Find index bounds matching targetDate
  const matchingIndices = [];
  for (let i = 0; i < times.length; i++) {
    if (times[i].startsWith(targetDate)) {
      matchingIndices.push(i);
    }
  }

  if (matchingIndices.length === 0) {
    // If exact targetDate not found, pick the closest date or first 24 hours
    for (let i = 0; i < Math.min(24, times.length); i++) {
      matchingIndices.push(i);
    }
  }

  const gfsHourly = ensembleData.gfs || ensembleData.raw?.hourly || {};
  const ecmwfHourly = ensembleData.ecmwf || ensembleData.raw?.hourly || {};

  const gfsMaxTemps = [];
  const ecmwfMaxTemps = [];

  // Parse GFS members
  for (const [key, values] of Object.entries(gfsHourly)) {
    if (key === 'time') continue;
    if (key.includes('ecmwf')) continue;
    if (Array.isArray(values) && values.length >= matchingIndices.length) {
      let maxVal = -Infinity;
      for (const idx of matchingIndices) {
        const v = values[idx];
        if (typeof v === 'number' && !isNaN(v) && v > maxVal) {
          maxVal = v;
        }
      }
      if (maxVal !== -Infinity) {
        gfsMaxTemps.push(maxVal);
      }
    }
  }

  // Parse ECMWF members
  for (const [key, values] of Object.entries(ecmwfHourly)) {
    if (key === 'time') continue;
    if (key.includes('gfs')) continue;
    if (Array.isArray(values) && values.length >= matchingIndices.length) {
      let maxVal = -Infinity;
      for (const idx of matchingIndices) {
        const v = values[idx];
        if (typeof v === 'number' && !isNaN(v) && v > maxVal) {
          maxVal = v;
        }
      }
      if (maxVal !== -Infinity) {
        ecmwfMaxTemps.push(maxVal);
      }
    }
  }

  const allMaxTemps = [...gfsMaxTemps, ...ecmwfMaxTemps];
  return { gfsMaxTemps, ecmwfMaxTemps, allMaxTemps };
}

/**
 * Check if a temperature falls within a bracket condition.
 * Bracket format:
 * - { min: 70, max: 75 }: 70 <= T <= 75
 * - { min: 80 }: T >= 80 (exceedance)
 * - { max: 60 }: T <= 60 (under)
 * @param {number} temp - Realized temperature
 * @param {{ min?: number, max?: number }} bracket
 * @returns {boolean}
 */
export function isTempInBracket(temp, bracket) {
  if (bracket.min !== undefined && bracket.max !== undefined) {
    return temp >= bracket.min && temp <= bracket.max;
  }
  if (bracket.min !== undefined) {
    return temp >= bracket.min;
  }
  if (bracket.max !== undefined) {
    return temp <= bracket.max;
  }
  return true;
}

/**
 * Calculate Fair Probability via Continuity-Corrected Empirical CDF (ECDF).
 * Uses Laplace rule of succession (alpha = 1.0 default) to ensure probabilities
 * are strictly bounded within (0, 1) and never equal to 0.0 or 1.0.
 * Formula: P_ecdf = (count + alpha) / (M + 2 * alpha)
 * @param {number[]} samples - Ensemble daily maximum temperature samples
 * @param {{ min?: number, max?: number }} bracket - Target temperature range
 * @param {number} alpha - Laplace regularization parameter (default 1.0)
 * @returns {number} Calibrated probability strictly in (0, 1)
 */
export function calculateEcdfProbability(samples, bracket, alpha = 1.0) {
  const m = samples.length;
  if (m === 0) return 0.5;

  let count = 0;
  for (const s of samples) {
    if (isTempInBracket(s, bracket)) {
      count++;
    }
  }

  const prob = (count + alpha) / (m + 2.0 * alpha);
  // Ensure strict safety clamping inside (1e-6, 1 - 1e-6)
  return Math.max(1e-6, Math.min(1.0 - 1e-6, prob));
}

/**
 * Calculate Fair Probability via Gaussian Kernel Density Smoothing (KDE).
 * Non-parametric smoothing using Silverman's bandwidth and analytical error function integration.
 * @param {number[]} samples - Ensemble daily maximum temperature samples
 * @param {{ min?: number, max?: number }} bracket - Target temperature range
 * @param {number} alpha - Small boundary regularization to preserve p in (0, 1)
 * @returns {number} Calibrated probability strictly in (0, 1)
 */
export function calculateKdeProbability(samples, bracket, alpha = 0.5) {
  const m = samples.length;
  if (m === 0) return 0.5;

  const h = calculateBandwidthSilverman(samples);
  const sqrt2h = Math.SQRT2 * h;

  let integratedMass = 0;

  for (const xm of samples) {
    if (bracket.min !== undefined && bracket.max !== undefined) {
      // Mass between min and max: 0.5 * (erfc((min - xm)/(sqrt2 * h)) - erfc((max - xm)/(sqrt2 * h)))
      const massMin = 0.5 * erfc((bracket.min - xm) / sqrt2h);
      const massMax = 0.5 * erfc((bracket.max - xm) / sqrt2h);
      integratedMass += (massMin - massMax);
    } else if (bracket.min !== undefined) {
      // Exceedance: X >= min
      integratedMass += 0.5 * erfc((bracket.min - xm) / sqrt2h);
    } else if (bracket.max !== undefined) {
      // Under: X <= max
      integratedMass += 1.0 - 0.5 * erfc((bracket.max - xm) / sqrt2h);
    } else {
      integratedMass += 1.0;
    }
  }

  // Continuity / sample size regularization
  const rawProb = integratedMass / m;
  const regularized = (rawProb * m + alpha) / (m + 2.0 * alpha);
  return Math.max(1e-6, Math.min(1.0 - 1e-6, regularized));
}

/**
 * Calculate Fair Probability using Superensemble Multi-Model Reliability Blending.
 * Weights ECMWF and GFS member distributions based on horizon reliability.
 * ECMWF typically carries higher skill (weight ~ 0.60) in 2-7 day horizons.
 * @param {number[]} gfsSamples - GFS ensemble member values
 * @param {number[]} ecmwfSamples - ECMWF ensemble member values
 * @param {{ min?: number, max?: number }} bracket - Target temperature range
 * @param {number} leadTimeDays - Horizon in days
 * @returns {number} Calibrated blended probability strictly in (0, 1)
 */
export function calculateSuperensembleProbability(gfsSamples, ecmwfSamples, bracket, leadTimeDays = 2) {
  // ECMWF weight scales slightly with lead time horizon
  let wEcmwf = 0.60;
  if (leadTimeDays >= 5) wEcmwf = 0.65;
  if (leadTimeDays <= 1) wEcmwf = 0.55;

  const pGfs = calculateKdeProbability(gfsSamples.length > 0 ? gfsSamples : ecmwfSamples, bracket);
  const pEcmwf = calculateKdeProbability(ecmwfSamples.length > 0 ? ecmwfSamples : gfsSamples, bracket);

  const blended = wEcmwf * pEcmwf + (1.0 - wEcmwf) * pGfs;
  return Math.max(1e-6, Math.min(1.0 - 1e-6, blended));
}

/**
 * Main quantitative model pricing engine entry point.
 * Guarantees fair probability strictly inside interval (0, 1) without runtime errors.
 * 
 * @param {object} ensemble - Ingested or synthetic ensemble forecast
 * @param {string} targetDate - Target settlement date ('YYYY-MM-DD')
 * @param {{ min?: number, max?: number }} bracket - Contract temperature bracket
 * @param {'ecdf' | 'kde' | 'super'} method - Estimation method (default: 'ecdf')
 * @param {object} options - Optional tuning parameters
 * @returns {{
 *   fairProb: number,
 *   logitProb: number,
 *   ensembleMean: number,
 *   ensembleStd: number,
 *   sampleSize: number,
 *   method: string,
 *   targetDate: string,
 *   bracket: object
 * }}
 */
export function calculateFairProbability(ensemble, targetDate, bracket, method = 'ecdf', options = {}) {
  if (!ensemble) {
    throw new Error('ensemble data is required');
  }
  if (!targetDate) {
    throw new Error('targetDate is required');
  }
  if (!bracket || (bracket.min === undefined && bracket.max === undefined)) {
    throw new Error('bracket must specify min, max, or both');
  }

  const { gfsMaxTemps, ecmwfMaxTemps, allMaxTemps } = extractDailyMaxTemperatures(ensemble, targetDate);

  if (allMaxTemps.length === 0) {
    throw new Error(`No ensemble temperature data available for date ${targetDate}`);
  }

  let fairProb;
  if (method === 'kde') {
    fairProb = calculateKdeProbability(allMaxTemps, bracket, options.alpha ?? 0.5);
  } else if (method === 'super') {
    const leadTime = options.leadTimeDays ?? 2;
    fairProb = calculateSuperensembleProbability(gfsMaxTemps, ecmwfMaxTemps, bracket, leadTime);
  } else {
    // Default ECDF with Laplace succession
    fairProb = calculateEcdfProbability(allMaxTemps, bracket, options.alpha ?? 1.0);
  }

  // Strict boundary assertion: 0.0 < fairProb < 1.0
  if (!(fairProb > 0.0 && fairProb < 1.0)) {
    fairProb = Math.max(1e-6, Math.min(1.0 - 1e-6, fairProb));
  }

  const logitProb = logit(fairProb);
  const stats = computeSampleStats(allMaxTemps);

  return {
    fairProb,
    logitProb,
    ensembleMean: Math.round(stats.mean * 100) / 100,
    ensembleStd: Math.round(stats.std * 100) / 100,
    sampleSize: allMaxTemps.length,
    method,
    targetDate,
    bracket
  };
}
