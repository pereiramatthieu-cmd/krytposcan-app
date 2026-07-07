import { useState, useCallback } from 'react';
import { fetchTopCoins } from './topCoins.js';
import { fetchKlineSeries, fmtShortDate, isFlatAsset } from './klines.js';
import { evaluateSupportSignal } from './supportResistance.js';
import { runPool } from './pool.js';

export const SCAN_LOOKBACK_DAYS = 220; // enough history for meaningful pivot clustering
const CONCURRENCY = 12;
const COIN_COUNT = 300;

export function useSupportScan() {
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);

  const run = useCallback(async () => {
    setStatus('loading');
    setError(null);
    setProgress({ done: 0, total: 0 });
    try {
      const coins = await fetchTopCoins(COIN_COUNT);
      setProgress({ done: 0, total: coins.length });

      const rows = await runPool(coins, async (coin) => {
        const series = await fetchKlineSeries(coin.ticker, SCAN_LOOKBACK_DAYS, fmtShortDate);
        if (!series || isFlatAsset(series)) return null;
        const evald = evaluateSupportSignal(series, series.length - 1);
        if (!evald) return null;
        return { ...coin, ...evald };
      }, CONCURRENCY, (done, total) => setProgress({ done, total }));

      const found = rows.filter(Boolean).sort((a, b) => a.distancePct - b.distancePct);
      setResults(found);
      setStatus('done');
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  }, []);

  return { status, progress, results, error, run };
}
