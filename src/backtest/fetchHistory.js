import { fetchKlineSeries, fmtLongDate } from '../klines.js';

const DAYS = 730; // ~2 years of daily candles, free & unrestricted on Binance spot

export async function fetchHistoricalSeries(ticker) {
  return fetchKlineSeries(ticker, DAYS, fmtLongDate);
}
