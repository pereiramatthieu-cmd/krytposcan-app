import { fetchKlineSeries, fmtLongDate } from '../klines';

const DAYS = 730; // ~2 years of daily candles, free & unrestricted on Binance spot

export async function fetchHistoricalSeries(ticker) {
  return fetchKlineSeries(ticker, DAYS, fmtLongDate);
}

// Fetches all tickers in parallel; tickers without a Binance spot listing are
// silently dropped (e.g. a brand-new token) rather than failing the whole run.
export async function fetchAllHistories(tickers) {
  const entries = await Promise.all(
    tickers.map(async ticker => {
      try {
        return [ticker, await fetchHistoricalSeries(ticker)];
      } catch {
        return [ticker, null];
      }
    })
  );
  return Object.fromEntries(entries.filter(([, series]) => series !== null));
}
