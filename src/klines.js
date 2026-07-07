const BINANCE_API = 'https://api.binance.com/api/v3';
const STALE_THRESHOLD_MS = 4 * 86400000; // 4 days

export function fmtShortDate(ms) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function fmtLongDate(ms) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

// Fetches daily OHLCV for one ticker from Binance spot. Returns null (rather than
// throwing) when the ticker has no Binance USDT pair, or when the pair is
// delisted/inactive — Binance keeps serving historical data for dead symbols
// (e.g. old BTTUSDT, frozen at its Jan 2022 delisting) and `limit` without a
// startTime returns candles from the START of that frozen window rather than
// "now" once a symbol stops trading, silently pulling in years-old data.
export async function fetchKlineSeries(ticker, limit, dateFormatter = fmtShortDate) {
  const symbol = `${ticker}USDT`;
  let res;
  try {
    res = await fetch(`${BINANCE_API}/klines?symbol=${symbol}&interval=1d&limit=${limit}`);
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const raw = await res.json();
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const lastTime = raw[raw.length - 1][0];
  if (Date.now() - lastTime > STALE_THRESHOLD_MS) return null;

  return raw.map(k => ({
    time:   k[0],
    date:   dateFormatter(k[0]),
    high:   parseFloat(k[2]),
    low:    parseFloat(k[3]),
    price:  parseFloat(k[4]), // close
    volume: parseFloat(k[5]),
  }));
}

// Pegged/near-pegged assets (stablecoins, tokenized cash/treasury products) don't
// have real swing structure — rather than chase an ever-growing name blocklist,
// detect them generically: if price barely moved over the whole window, skip it.
export function isFlatAsset(series, thresholdPct = 8) {
  const prices = series.map(b => b.price);
  const max = Math.max(...prices);
  const min = Math.min(...prices);
  return min > 0 && ((max - min) / min) * 100 < thresholdPct;
}
