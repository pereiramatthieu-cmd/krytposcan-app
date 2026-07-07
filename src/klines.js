import { calcEMA, calcRSI, calcATR, calcMACD, calcBollinger } from './indicators';

const BINANCE_API = 'https://api.binance.com/api/v3';

export function fmtShortDate(ms) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function fmtLongDate(ms) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

// Fetches daily klines for one ticker and computes every indicator the app uses
// (EMA20/50, RSI14, ATR14, MACD, Bollinger) over the full fetched window so values
// are properly warmed up — shared by the live chart fetch and the backtester so
// both run on identically-built series.
export async function fetchKlineSeries(ticker, limit, dateFormatter = fmtShortDate) {
  const symbol = `${ticker}USDT`;
  const res = await fetch(`${BINANCE_API}/klines?symbol=${symbol}&interval=1d&limit=${limit}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.json();
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('empty history');

  const highs   = raw.map(k => parseFloat(k[2]));
  const lows    = raw.map(k => parseFloat(k[3]));
  const closes  = raw.map(k => parseFloat(k[4]));
  const volumes = raw.map(k => parseFloat(k[5]));
  const times   = raw.map(k => k[0]);

  const ema20arr = calcEMA(closes, 20);
  const ema50arr = calcEMA(closes, 50);
  const rsiArr   = calcRSI(closes, 14);
  const atrArr   = calcATR(highs, lows, closes, 14);
  const { macd, signal: macdSignal, histogram: macdHist } = calcMACD(closes);
  const { upper: bbUpper, mid: bbMid, lower: bbLower } = calcBollinger(closes, 20, 2);

  return closes.map((price, i) => ({
    time:   times[i],
    date:   dateFormatter(times[i]),
    price,
    high:   highs[i],
    low:    lows[i],
    volume: volumes[i],
    volUp:  i === 0 || price >= closes[i - 1],
    ema20:  ema20arr[i],
    ema50:  ema50arr[i],
    rsi:    rsiArr[i],
    atr:    atrArr[i],
    macd:       macd[i],
    macdSignal: macdSignal[i],
    macdHist:   macdHist[i],
    bbUpper: bbUpper[i],
    bbMid:   bbMid[i],
    bbLower: bbLower[i],
  }));
}
