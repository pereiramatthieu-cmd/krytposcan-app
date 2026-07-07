const PIVOT_LOOKBACK = 3;      // bars each side needed to confirm a swing pivot
const CLUSTER_TOLERANCE = 0.02; // swing points within 2% of each other = same zone
const MIN_TOUCHES = 2;          // a zone needs >=2 historical touches to count as real S/R
const TOUCH_BAND = 0.02;        // "touching" = today's low within 2% of the zone level

// Defaults reflect a 2-year backtest sweep across the top-300 universe (see chat
// history / scratch_test_variants*.mjs). Findings, cheapest first:
//   - requireBounceCandle (close in the upper half of the day's range) is the single
//     biggest lever: -19.7% return / -0.12 Sharpe without it -> +96.0% / 1.03 with it.
//     A "touch" alone is noise; a touch-and-reject is signal.
//   - trendFilter (SMA50/100/200, only buy above trend) backtested WORSE in this
//     window (Sharpe 0.52-0.90 vs 1.03) — it excludes some of the best deep-dip
//     recoveries. Kept available but OFF by default. Caveat: this window was net
//     favorable to dip-buying; a prolonged bear market could punish going without
//     a trend filter much harder than this backtest shows — re-test periodically.
//   - "more touches = stronger" (higher confidence/target) beat the reverse
//     hypothesis convincingly (1.03 vs -0.28 Sharpe) — a level tested more often
//     held up better here, not worse.
//   - Resistance-based targets and ATR-based stops both backtested worse than the
//     flat -10% / +40-50% the user asked for — that flat range turned out to
//     already be close to optimal, not just "simple."
//   - Rejecting BUYs where the close has already run far from the support level
//     (maxEntryDistancePct) — the intuitive fix for "why is it telling me to buy
//     something that already bounced 30-40%" — was tested and made things WORSE
//     (Sharpe 1.03 -> 0.32 at an 8% cap). Anchoring the stop to the support level
//     instead of the entry price (stopMode: 'support') was tested too, also worse
//     (best case 0.84 Sharpe at a tight 3%-below-support stop). In this sample, a
//     bigger same-day recovery off the low correlated with a stronger move, not a
//     weaker one — cutting those trades removed some of the best performers. Both
//     options are left available (off by default) for a stricter, more intuitive
//     — but backtested-worse — version of the strategy; distancePct is still
//     returned on every row so the UI can flag "extended" entries instead of
//     silently rejecting them.
export const DEFAULT_OPTS = {
  trendFilter: false,
  trendPeriod: 100,
  requireBounceCandle: true, // require the close to sit in the upper half of the day's range
  minClosePosition: 0.5,     // (close-low)/(high-low) must be >= this to count as a rejection wick
  requireVolume: false,      // require above-average volume on the bounce day
  volumeWindow: 20,
  volumeMult: 1.0,
  maxEntryDistancePct: Infinity, // opt-in: reject BUY if close is already more than this % above support
  reverseTouchScaling: false, // if true, FEWER touches -> higher confidence/target (level "wears down")
  stopMode: 'fixed',        // 'fixed' | 'atr' | 'support'
  fixedStopMult: 0.90,      // -10%
  atrStopMult: 2.5,
  supportStopMult: 0.95,    // stop = 5% below the support level itself (stopMode: 'support')
  targetMode: 'fixed',      // 'fixed' | 'resistance'
  fixedTargetRange: [1.40, 1.50],
};

// Rows with distancePct above this are flagged "Extended" in the UI — not
// rejected (that backtests worse), just clearly labeled so it's obvious the
// entry isn't right at the support level anymore.
export const EXTENDED_THRESHOLD_PCT = 8;

function sma(series, idx, period) {
  if (idx < period - 1) return null;
  let sum = 0;
  for (let i = idx - period + 1; i <= idx; i++) sum += series[i].price;
  return sum / period;
}

function avgVolume(series, idx, window) {
  const start = Math.max(0, idx - window);
  const slice = series.slice(start, idx);
  if (!slice.length) return null;
  return slice.reduce((a, b) => a + b.volume, 0) / slice.length;
}

function atr(series, idx, period = 14) {
  if (idx < period) return null;
  let sum = 0;
  for (let i = idx - period + 1; i <= idx; i++) {
    const c = series[i], p = series[i - 1];
    sum += p
      ? Math.max(c.high - c.low, Math.abs(c.high - p.price), Math.abs(c.low - p.price))
      : c.high - c.low;
  }
  return sum / period;
}

// Finds confirmed swing points up to (and including) `uptoIdx`. A pivot at position p
// needs PIVOT_LOOKBACK bars *after* it to be confirmed, so callers must pass
// `uptoIdx = idx - PIVOT_LOOKBACK` to stay lookahead-free when idx is "today".
function findSwingPoints(series, uptoIdx, key, isLower) {
  const points = [];
  for (let i = PIVOT_LOOKBACK; i <= uptoIdx - PIVOT_LOOKBACK; i++) {
    let isPivot = true;
    for (let k = 1; k <= PIVOT_LOOKBACK && isPivot; k++) {
      const cmp = isLower
        ? series[i][key] > series[i - k][key] || series[i][key] > series[i + k][key]
        : series[i][key] < series[i - k][key] || series[i][key] < series[i + k][key];
      if (cmp) isPivot = false;
    }
    if (isPivot) points.push({ idx: i, level: series[i][key] });
  }
  return points;
}

function clusterZones(points) {
  const sorted = [...points].sort((a, b) => a.level - b.level);
  const zones = [];
  for (const p of sorted) {
    const zone = zones.find(z => Math.abs(p.level - z.level) / z.level <= CLUSTER_TOLERANCE);
    if (zone) {
      zone.touches.push(p);
      zone.level = zone.touches.reduce((a, t) => a + t.level, 0) / zone.touches.length;
    } else {
      zones.push({ level: p.level, touches: [p] });
    }
  }
  return zones.filter(z => z.touches.length >= MIN_TOUCHES);
}

// Exposes the raw support/resistance zones for chart rendering — same clustering
// logic evaluateSupportSignal uses internally, no lookahead beyond `idx`.
export function findZones(series, idx) {
  const confirmableUpto = idx - PIVOT_LOOKBACK;
  return {
    support: clusterZones(findSwingPoints(series, confirmableUpto, 'low', true)),
    resistance: clusterZones(findSwingPoints(series, confirmableUpto, 'high', false)),
  };
}

// Evaluates the support-touch signal at bar `idx` of `series`, using only s[0..idx] —
// no lookahead. Shared by the live scan (idx = last bar) and the backtester (every
// historical idx), so both run the identical rule.
//
// Rule: a support zone is a price level where the low has bounced >=2 times before.
// BUY fires when today's low dips into (or near) that zone AND the close rejects back
// up (closes in the upper half of the day's range) AND — if trendFilter is on — price
// isn't fighting its own longer-term downtrend. Target is either a flat 40-50% gain or
// the nearest resistance zone, whichever mode is selected; stop is either a flat -10%
// or ATR-scaled.
export function evaluateSupportSignal(series, idx, opts = {}) {
  const o = { ...DEFAULT_OPTS, ...opts };
  const confirmableUpto = idx - PIVOT_LOOKBACK;
  if (confirmableUpto < PIVOT_LOOKBACK * 2) return null;

  const bar = series[idx];
  if (bar.low == null || bar.price == null || bar.high == null) return null;

  const supportZones = clusterZones(findSwingPoints(series, confirmableUpto, 'low', true));
  const resistanceZones = clusterZones(findSwingPoints(series, confirmableUpto, 'high', false));

  const candidates = supportZones.filter(z => z.level <= bar.price * 1.01);
  if (candidates.length === 0) return null;

  const nearestSupport = candidates.reduce((a, b) => (b.level > a.level ? b : a));
  const distancePct = ((bar.price - nearestSupport.level) / nearestSupport.level) * 100;
  const touches = nearestSupport.touches.length;

  const touchedZone = Math.abs(bar.low - nearestSupport.level) / nearestSupport.level <= TOUCH_BAND
    && bar.price >= nearestSupport.level * 0.99;

  const closePosition = (bar.price - bar.low) / ((bar.high - bar.low) || 1e-9);
  const bounceOk = !o.requireBounceCandle || closePosition >= o.minClosePosition;

  const trendLevel = o.trendFilter ? sma(series, idx, o.trendPeriod) : null;
  const trendOk = !o.trendFilter || trendLevel == null || bar.price >= trendLevel;

  const avgVol = o.requireVolume ? avgVolume(series, idx, o.volumeWindow) : null;
  const volumeOk = !o.requireVolume || avgVol == null || bar.volume >= avgVol * o.volumeMult;

  // A volatile day can touch the support zone on the low and still close far above
  // it (wide daily range) — that's no longer "buying at support", it's chasing an
  // already-completed bounce. Cap how extended the close is allowed to be.
  const notTooExtended = distancePct <= o.maxEntryDistancePct;

  const touchedToday = touchedZone && bounceOk && trendOk && volumeOk && notTooExtended;

  const aboveCandidates = resistanceZones.filter(z => z.level >= bar.price * 0.99);
  const nearestResistance = aboveCandidates.length
    ? aboveCandidates.reduce((a, b) => (b.level < a.level ? b : a))
    : null;

  const confidence = o.reverseTouchScaling
    ? Math.min(90, 50 + Math.max(0, 6 - touches) * 8)
    : Math.min(90, 50 + touches * 8);

  let targetPrice;
  if (o.targetMode === 'resistance' && nearestResistance) {
    targetPrice = nearestResistance.level;
  } else {
    const [lo, hi] = o.fixedTargetRange;
    const mult = o.reverseTouchScaling
      ? Math.max(lo, hi - (touches - 2) * 0.03)
      : Math.min(hi, lo + (touches - 2) * 0.03);
    targetPrice = bar.price * mult;
  }

  let stopPrice;
  if (o.stopMode === 'atr') {
    const a = atr(series, idx);
    stopPrice = a != null ? bar.price - a * o.atrStopMult : bar.price * o.fixedStopMult;
  } else if (o.stopMode === 'support') {
    stopPrice = nearestSupport.level * o.supportStopMult;
  } else {
    stopPrice = bar.price * o.fixedStopMult;
  }

  return {
    signal: touchedToday ? 'BUY' : 'WATCH',
    price: bar.price,
    date: bar.date,
    supportLevel: nearestSupport.level,
    supportTouches: touches,
    distancePct,
    resistanceLevel: nearestResistance?.level ?? null,
    confidence,
    targetPrice,
    stopPrice,
  };
}
