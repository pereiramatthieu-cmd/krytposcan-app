import { fetchTopCoins } from '../topCoins.js';
import { fetchHistoricalSeries } from './fetchHistory.js';
import { runBacktest, computeStats, STARTING_CAPITAL } from './runBacktest.js';
import { runPool } from '../pool.js';
import { isFlatAsset } from '../klines.js';

const CONCURRENCY = 12;
const COIN_COUNT = 300;

// Plain (non-React) orchestration: fetch top 300 -> fetch 2y history each -> run
// the simulation -> compute stats. Shared by the browser hook (useBacktest) and
// standalone Node scripts used to iterate on strategy parameters quickly.
export async function runFullBacktest(onProgress, options) {
  const coins = await fetchTopCoins(COIN_COUNT);
  onProgress?.(0, coins.length);

  const entries = await runPool(coins, async (coin) => {
    const series = await fetchHistoricalSeries(coin.ticker);
    if (!series || isFlatAsset(series)) return [coin.ticker, null];
    return [coin.ticker, series];
  }, CONCURRENCY, (done, total) => onProgress?.(done, total));

  const historyByTicker = Object.fromEntries(entries.filter(([, series]) => series !== null));

  const { equityCurve, closedTrades, openPositions } = runBacktest(historyByTicker, options);
  const stats = computeStats(equityCurve, closedTrades, STARTING_CAPITAL);

  return {
    equityCurve,
    closedTrades,
    openPositions,
    stats,
    tickersTested: Object.keys(historyByTicker).length,
    historyByTicker, // handed back so a Node script can re-run variants without re-fetching
  };
}
