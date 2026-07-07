import { useState, useCallback } from 'react';
import { fetchAllHistories } from './fetchHistory';
import { runBacktest, computeStats, STARTING_CAPITAL } from './runBacktest';

export function useBacktest(tickers) {
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const run = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const historyByTicker = await fetchAllHistories(tickers);
      const { equityCurve, closedTrades, openPositions } = runBacktest(historyByTicker);
      const stats = computeStats(equityCurve, closedTrades, STARTING_CAPITAL);

      const perTicker = {};
      for (const ticker of Object.keys(historyByTicker)) {
        const trades = closedTrades.filter(t => t.ticker === ticker);
        const wins = trades.filter(t => t.pnl > 0).length;
        const series = historyByTicker[ticker];
        perTicker[ticker] = {
          trades: trades.length,
          winRate: trades.length ? (wins / trades.length) * 100 : null,
          pnl: trades.reduce((a, t) => a + t.pnl, 0),
          firstDate: series[0]?.date,
          lastDate: series[series.length - 1]?.date,
        };
      }

      setResult({ equityCurve, closedTrades, openPositions, stats, perTicker });
      setStatus('done');
    } catch (e) {
      setError(e.message);
      setStatus('error');
    }
  }, [tickers]);

  return { status, result, error, run };
}
