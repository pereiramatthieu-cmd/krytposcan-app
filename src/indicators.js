// Standard EMA — returns array same length as prices, no null padding
export function calcEMA(prices, period) {
  const k = 2 / (period + 1);
  const out = [];
  let ema = prices[0];
  for (let i = 0; i < prices.length; i++) {
    ema = i === 0 ? prices[0] : prices[i] * k + ema * (1 - k);
    out.push(ema);
  }
  return out;
}

// RSI with Wilder's smoothing — first `period` values are null
export function calcRSI(prices, period = 14) {
  const out = new Array(prices.length).fill(null);
  if (prices.length < period + 1) return out;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = prices[i] - prices[i - 1];
    if (d > 0) avgGain += d;
    else avgLoss += Math.abs(d);
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

// Average True Range (Wilder's smoothing) — scales stop/target distance to each
// asset's own volatility instead of a one-size-fits-all % of price. First
// `period - 1` values are null.
export function calcATR(highs, lows, closes, period = 14) {
  const n = closes.length;
  const tr = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    tr[i] = i === 0
      ? highs[i] - lows[i]
      : Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
  }

  const out = new Array(n).fill(null);
  if (n < period) return out;

  let atr = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = atr;
  for (let i = period; i < n; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    out[i] = atr;
  }
  return out;
}

// MACD (12/26 EMA spread) + 9-EMA signal line + histogram
export function calcMACD(prices, fast = 12, slow = 26, signalPeriod = 9) {
  const emaFast = calcEMA(prices, fast);
  const emaSlow = calcEMA(prices, slow);
  const macd = prices.map((_, i) => emaFast[i] - emaSlow[i]);
  const signal = calcEMA(macd, signalPeriod);
  const histogram = macd.map((v, i) => v - signal[i]);
  return { macd, signal, histogram };
}

// Bollinger Bands — SMA(period) +/- (mult * stdDev). First `period - 1` values are null.
export function calcBollinger(prices, period = 20, mult = 2) {
  const n = prices.length;
  const mid = new Array(n).fill(null);
  const upper = new Array(n).fill(null);
  const lower = new Array(n).fill(null);

  for (let i = period - 1; i < n; i++) {
    const window = prices.slice(i - period + 1, i + 1);
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const variance = window.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    mid[i] = mean;
    upper[i] = mean + mult * sd;
    lower[i] = mean - mult * sd;
  }
  return { mid, upper, lower };
}
