const CATEGORIES = {
  BTC: 'L1', ETH: 'L1', SOL: 'L1', CFX: 'L1',
  AAVE: 'DeFi', ARB: 'L2', ONDO: 'DeFi', IO: 'L2',
};

// Format a price snapped to a realistic precision for its magnitude
function px(v, ref) {
  if (ref >= 50000) return `$${(Math.round(v / 500) * 500).toLocaleString('en-US')}`;
  if (ref >= 5000)  return `$${(Math.round(v / 50)  * 50).toLocaleString('en-US')}`;
  if (ref >= 1000)  return `$${(Math.round(v / 10)  * 10).toLocaleString('en-US')}`;
  if (ref >= 100)   return `$${Math.round(v)}`;
  if (ref >= 10)    return `$${v.toFixed(1)}`;
  if (ref >= 1)     return `$${v.toFixed(2)}`;
  return `$${v.toFixed(4)}`;
}

function zone(lo, hi, ref) {
  return `${px(lo, ref)} – ${px(hi, ref)}`;
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function generateSignals(chartData, watchlist) {
  const rows = [];
  let nextId = 1;

  for (const [ticker, data] of Object.entries(chartData)) {
    if (!data?.series?.length) continue;
    const coin = watchlist[ticker];
    if (!coin) continue;

    const s = data.series;
    const n = s.length;
    if (n < 6) continue;

    const last   = s[n - 1];
    const price  = last.price;
    const rsi    = last.rsi;
    const ema20  = last.ema20;
    const ema50  = last.ema50;

    if (rsi == null || ema20 == null || ema50 == null) continue;

    // Most-recent EMA cross within the last 5 bars (newest first)
    let emaCross = null;
    for (let i = n - 1; i >= Math.max(1, n - 5); i--) {
      const c = s[i], p = s[i - 1];
      if (p.ema20 == null || p.ema50 == null) continue;
      if (p.ema20 <= p.ema50 && c.ema20 > c.ema50) {
        emaCross = { type: 'up',   daysAgo: n - 1 - i };
        break;
      }
      if (p.ema20 >= p.ema50 && c.ema20 < c.ema50) {
        emaCross = { type: 'down', daysAgo: n - 1 - i };
        break;
      }
    }

    // Volume spike: last-3-day average vs full-window average
    const volAvg    = s.reduce((a, d) => a + d.volume, 0) / n;
    const volRecent = (s[n-1].volume + s[n-2].volume + s[n-3].volume) / 3;
    const volSpike  = volRecent > volAvg * 1.4;

    // RSI 5-day momentum
    const rsi5ago  = s[n - 6]?.rsi;
    const rsiDelta = rsi5ago != null ? rsi - rsi5ago : 0;

    const emaUp = ema20 > ema50;

    // ── Signal classification (first match wins, ordered by conviction) ──
    let signal, timeframe, trigger, confidence, targetMult, stopMult;

    if (rsi < 32 && emaUp) {
      // Oversold RSI inside a bullish EMA structure → strong BUY
      signal     = 'BUY';
      timeframe  = '4H';
      trigger    = volSpike
        ? `RSI oversold (${rsi.toFixed(1)}) + volume spike, EMA structure bullish`
        : `RSI oversold (${rsi.toFixed(1)}) + EMA 20 above EMA 50`;
      confidence = clamp(72 + Math.round((32 - rsi) * 1.5), 72, 92);
      targetMult = 1.22;
      stopMult   = 0.91;

    } else if (emaCross?.type === 'up') {
      // Golden cross just fired → BUY
      signal     = 'BUY';
      timeframe  = '1D';
      trigger    = emaCross.daysAgo === 0
        ? `EMA 20/50 golden cross today${volSpike ? ', volume confirming' : ''}`
        : `EMA 20/50 golden cross ${emaCross.daysAgo}d ago${volSpike ? ', volume confirming' : ''}`;
      confidence = clamp(76 - emaCross.daysAgo * 2 + (volSpike ? 5 : 0), 62, 88);
      targetMult = 1.18;
      stopMult   = 0.92;

    } else if (rsi < 44 && rsiDelta > 2 && emaUp) {
      // RSI recovering from lows, EMA uptrend → BUY
      signal     = 'BUY';
      timeframe  = '4H';
      trigger    = `RSI recovering from lows (${rsi.toFixed(1)}↑), EMA 20/50 bullish alignment`;
      confidence = clamp(60 + Math.round((44 - rsi) * 1.2), 62, 82);
      targetMult = 1.15;
      stopMult   = 0.93;

    } else if (emaCross?.type === 'down') {
      // Death cross just fired → WATCH (wait for reversal)
      signal     = 'WATCH';
      timeframe  = '1D';
      trigger    = `EMA 20/50 bearish cross ${emaCross.daysAgo}d ago — watching for reversal`;
      confidence = clamp(52 + emaCross.daysAgo * 2, 52, 70);
      targetMult = 1.10;
      stopMult   = 0.94;

    } else if (rsi > 68 && !emaUp) {
      // Overbought in bearish structure → WATCH for rejection
      signal     = 'WATCH';
      timeframe  = '1D';
      trigger    = `RSI elevated (${rsi.toFixed(1)}) in bearish EMA structure — watch for rejection`;
      confidence = clamp(52 + Math.round(rsi - 68), 52, 70);
      targetMult = 1.08;
      stopMult   = 0.95;

    } else if (emaUp && rsi >= 50 && rsi <= 65) {
      // Healthy uptrend, neutral RSI → WATCH for entry
      signal     = 'WATCH';
      timeframe  = volSpike ? '1D' : '1W';
      trigger    = volSpike
        ? `Uptrend intact with volume expansion — awaiting pullback entry`
        : `EMA 20 above EMA 50, RSI neutral (${rsi.toFixed(1)}) — trend continuation watch`;
      confidence = clamp(52 + Math.round((rsi - 50) * 0.9), 52, 70);
      targetMult = 1.14;
      stopMult   = 0.95;

    } else {
      // Default: structural WATCH
      signal     = 'WATCH';
      timeframe  = '1W';
      trigger    = emaUp
        ? `Price above EMA structure, RSI (${rsi.toFixed(1)}) — monitoring for momentum entry`
        : `Below EMA resistance, RSI (${rsi.toFixed(1)}) — watching for directional breakout`;
      confidence = 54;
      targetMult = 1.12;
      stopMult   = 0.94;
    }

    // ── Levels ────────────────────────────────────────────────────────────
    const entryLo  = price * 0.988;
    const entryHi  = price * 1.008;
    const targetPx = price * targetMult;
    const stopPx   = price * stopMult;
    const rrRaw    = (targetPx - price) / (price - stopPx);
    const rr       = Math.max(0.8, parseFloat(rrRaw.toFixed(1)));

    rows.push({
      id:        nextId++,
      asset:     ticker,
      category:  CATEGORIES[ticker] ?? 'Other',
      signal,
      timeframe,
      trigger,
      confidence,
      entryZone: zone(entryLo, entryHi, price),
      target:    px(targetPx, price),
      stopLoss:  px(stopPx,   price),
      rr,
    });
  }

  // Highest confidence first
  return rows.sort((a, b) => b.confidence - a.confidence);
}
