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

const SIGNAL_WINDOW = 30; // trailing bars used for the volume-average baseline (mirrors the live 30-day series)

// Evaluates the swing signal at bar `idx` of `series`, using only s[0..idx] — no lookahead.
// Shared by the live signal table (idx = last bar) and the backtester (every historical idx),
// so both are guaranteed to run the identical rule set.
export function evaluateBar(series, idx) {
  const s = series;
  if (idx < 5) return null;

  const last  = s[idx];
  const price = last.price;
  const rsi   = last.rsi;
  const ema20 = last.ema20;
  const ema50 = last.ema50;
  if (rsi == null || ema20 == null || ema50 == null) return null;

  // Most-recent EMA cross within the last 5 bars (newest first)
  let emaCross = null;
  for (let i = idx; i >= Math.max(1, idx - 4); i--) {
    const c = s[i], p = s[i - 1];
    if (p.ema20 == null || p.ema50 == null) continue;
    if (p.ema20 <= p.ema50 && c.ema20 > c.ema50) {
      emaCross = { type: 'up', daysAgo: idx - i };
      break;
    }
    if (p.ema20 >= p.ema50 && c.ema20 < c.ema50) {
      emaCross = { type: 'down', daysAgo: idx - i };
      break;
    }
  }

  // Volume spike: last-3-day average vs trailing-window average
  const winStart  = Math.max(0, idx - SIGNAL_WINDOW + 1);
  const win       = s.slice(winStart, idx + 1);
  const volAvg    = win.reduce((a, d) => a + d.volume, 0) / win.length;
  const volRecent = (s[idx].volume + s[idx - 1].volume + s[idx - 2].volume) / 3;
  const volSpike  = volRecent > volAvg * 1.4;

  // RSI 5-day momentum
  const rsi5ago  = s[idx - 5]?.rsi;
  const rsiDelta = rsi5ago != null ? rsi - rsi5ago : 0;

  const emaUp = ema20 > ema50;

  // ── Signal classification (first match wins, ordered by conviction) ──
  // Stop/target distances are a fixed % of price — backtested against an ATR-scaled
  // (volatility-adaptive) version over 2 years and the ATR version came out worse on
  // risk-adjusted return (same Sharpe, ~60% deeper max drawdown), so it was reverted.
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

  // MACD/Bollinger: confidence context layered on top of the validated rule tree.
  // Backtested neutral on aggregate P&L (doesn't change which trades get taken),
  // kept because the Bollinger note is genuinely useful context for a human reader.
  const macdHist = last.macdHist;
  const prevMacdHist = s[idx - 1]?.macdHist;
  if (signal === 'BUY' && macdHist != null && prevMacdHist != null) {
    if (macdHist > 0 && macdHist > prevMacdHist) confidence = clamp(confidence + 5, 0, 96);
    else if (macdHist < 0) confidence = clamp(confidence - 5, 0, 96);
  }

  const overextended = signal === 'BUY' && last.bbUpper != null && price > last.bbUpper;
  if (overextended) {
    confidence = clamp(confidence - 8, 0, 96);
    trigger += ' — extended above upper Bollinger Band, mean-reversion risk';
  }

  // ── Levels ────────────────────────────────────────────────────────────
  const entryLo  = price * 0.988;
  const entryHi  = price * 1.008;
  const targetPx = price * targetMult;
  const stopPx   = price * stopMult;
  const rrRaw    = (targetPx - price) / (price - stopPx);
  const rr       = Math.max(0.8, parseFloat(rrRaw.toFixed(1)));

  return {
    signal,
    timeframe,
    trigger,
    confidence,
    bias:        emaUp ? 'bullish' : 'bearish',
    price,
    date:        last.date,
    entryZone:   zone(entryLo, entryHi, price),
    entryLow:    entryLo,
    entryHigh:   entryHi,
    target:      px(targetPx, price),
    targetPrice: targetPx,
    stopLoss:    px(stopPx, price),
    stopPrice:   stopPx,
    rr,
  };
}

export function generateSignals(chartData, watchlist) {
  const rows = [];
  let nextId = 1;

  for (const [ticker, data] of Object.entries(chartData)) {
    if (!data?.series?.length) continue;
    const coin = watchlist[ticker];
    if (!coin) continue;

    const evaluated = evaluateBar(data.series, data.series.length - 1);
    if (!evaluated) continue;

    rows.push({
      id:       nextId++,
      asset:    ticker,
      category: CATEGORIES[ticker] ?? 'Other',
      ...evaluated,
    });
  }

  // Highest confidence first
  return rows.sort((a, b) => b.confidence - a.confidence);
}

export { CATEGORIES };
