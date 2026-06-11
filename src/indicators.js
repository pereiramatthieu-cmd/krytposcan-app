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
