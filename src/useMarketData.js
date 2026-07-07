import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fetchKlineSeries, fmtShortDate } from './klines';
import { generateSignals } from './signals';

const COIN_IDS = {
  BTC:  'bitcoin',
  ETH:  'ethereum',
  SOL:  'solana',
  CFX:  'conflux-token',
  AAVE: 'aave',
  ARB:  'arbitrum',
  ONDO: 'ondo-finance',
  IO:   'io',
};

const COIN_CATEGORIES = {
  BTC: 'L1', ETH: 'L1', SOL: 'L1', CFX: 'L1',
  AAVE: 'DeFi', ARB: 'L2', ONDO: 'DeFi', IO: 'L2',
};

const ID_TO_TICKER = Object.fromEntries(
  Object.entries(COIN_IDS).map(([ticker, id]) => [id, ticker])
);

const WATCHLIST_IDS = Object.values(COIN_IDS).join(',');

const GCK    = 'https://api.coingecko.com/api/v3';
const CG_KEY = import.meta.env.VITE_CG_API_KEY;

// Appends the API key as a query param when present
function cgUrl(path) {
  return CG_KEY ? `${GCK}${path}${path.includes('?') ? '&' : '?'}x_cg_demo_api_key=${CG_KEY}` : `${GCK}${path}`;
}

function fmtAthDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function normaliseItem(raw) {
  const ticker = ID_TO_TICKER[raw.id];
  if (!ticker) return null;
  // sparkline_in_7d.price has ~168 hourly values — downsample to 7 daily points
  const sp = raw.sparkline_in_7d?.price ?? [];
  const step = Math.max(1, Math.floor(sp.length / 7));
  const sparkline = Array.from({ length: 7 }, (_, i) => sp[Math.min(i * step, sp.length - 1)]);
  return {
    ticker,
    name: raw.name,
    category: COIN_CATEGORIES[ticker] ?? 'Other',
    price: raw.current_price,
    change24h: raw.price_change_percentage_24h ?? 0,
    marketCap: raw.market_cap,
    volume24h: raw.total_volume,
    supply: raw.circulating_supply,
    ath: raw.ath,
    athDate: fmtAthDate(raw.ath_date),
    perf7d: raw.price_change_percentage_7d_in_currency ?? 0,
    perf30d: raw.price_change_percentage_30d_in_currency ?? 0,
    sparkline,
  };
}

// Fetch with one retry on 429 or network error (1-second back-off)
async function fetchWithRetry(url) {
  const attempt = () => fetch(url).then(res => {
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    return res;
  });
  try {
    return await attempt();
  } catch (e) {
    if (e.status === 429 || e.name === 'TypeError') {
      await new Promise(r => setTimeout(r, 3000));
      return attempt();
    }
    throw e;
  }
}

// Fetches Binance daily klines (150d lookback for EMA50/ATR/MACD/Bollinger warmup),
// computes indicators, returns the last 30 days as the displayed series.
const CHART_LOOKBACK_DAYS = 150;

async function buildChartData(ticker) {
  const series = await fetchKlineSeries(ticker, CHART_LOOKBACK_DAYS, fmtShortDate);
  const n = series.length;
  // 90d performance: close 90 days ago → latest close
  const idx90 = n - 91;
  const perf90d = idx90 >= 0 ? ((series[n - 1].price - series[idx90].price) / series[idx90].price) * 100 : null;
  return { series: series.slice(Math.max(0, n - 30)), perf90d };
}

export function useMarketData() {
  const [watchlist,    setWatchlist]    = useState({});
  const [globalStats,  setGlobalStats]  = useState(null);
  const [fearGreed,    setFearGreed]    = useState(null);
  const [chartData,    setChartData]    = useState({});
  const [chartLoading, setChartLoading] = useState({});
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);

  const cache = useRef({});

  // Initial + polling fetch for watchlist / global stats
  useEffect(() => {
    let cancelled = false;

    async function loadData(isInitial) {
      try {
        const [mktRes, glbRes, fngRes] = await Promise.all([
          fetch(cgUrl(`/coins/markets?vs_currency=usd&ids=${WATCHLIST_IDS}` +
                     `&order=market_cap_desc&sparkline=true&price_change_percentage=7d,30d`)),
          fetch(cgUrl(`/global`)),
          fetch('https://api.alternative.me/fng/?limit=1').catch(() => null),
        ]);

        if (!mktRes.ok) throw new Error(`Markets ${mktRes.status}`);
        if (!glbRes.ok) throw new Error(`Global ${glbRes.status}`);

        const [markets, global, fng] = await Promise.all([
          mktRes.json(),
          glbRes.json(),
          fngRes ? fngRes.json().catch(() => null) : Promise.resolve(null),
        ]);

        if (cancelled) return;

        const wl = {};
        markets.forEach(item => {
          const norm = normaliseItem(item);
          if (norm) wl[norm.ticker] = norm;
        });
        setWatchlist(wl);

        setGlobalStats({
          totalMarketCap: global.data.total_market_cap.usd,
          btcDominance:   global.data.market_cap_percentage.btc,
          volume24h:      global.data.total_volume.usd,
          activeOpportunities: 4, // static — opportunities table is still mock
        });

        if (fng?.data?.[0]) {
          setFearGreed({
            value: parseInt(fng.data[0].value, 10),
            label: fng.data[0].value_classification,
          });
        }

        // Kick off background chart pre-fetch for all coins on first load so
        // signal generation has data to work with without requiring the user
        // to click every coin manually.
        if (isInitial) {
          Object.keys(COIN_IDS).forEach(ticker => fetchChart(ticker));
        }

        setError(null);
      } catch (e) {
        if (cancelled) return;
        if (isInitial) setError(e.message);
      } finally {
        if (!cancelled && isInitial) setLoading(false);
      }
    }

    loadData(true);
    const id = setInterval(() => loadData(false), 1_800_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Lazy chart fetch — Binance's public rate limits are generous enough to fetch
  // all watchlist tickers in parallel (unlike CoinGecko's free tier previously).
  // inFlight prevents the same ticker being fetched twice concurrently.
  const inFlight = useRef(new Set());
  const fetchChart = useCallback(async (ticker) => {
    if (cache.current[ticker]) {
      setChartData(prev => ({ ...prev, [ticker]: cache.current[ticker] }));
      return;
    }
    if (inFlight.current.has(ticker)) return;
    inFlight.current.add(ticker);
    setChartLoading(prev => ({ ...prev, [ticker]: true }));
    try {
      const data = await buildChartData(ticker);
      cache.current[ticker] = data;
      setChartData(prev => ({ ...prev, [ticker]: data }));
    } catch (e) {
      setError(`Chart unavailable for ${ticker} — ${e.message}`);
    } finally {
      inFlight.current.delete(ticker);
      setChartLoading(prev => ({ ...prev, [ticker]: false }));
    }
  }, []);

  const opportunities = useMemo(
    () => generateSignals(chartData, watchlist),
    [chartData, watchlist],
  );

  return {
    watchlist,
    globalStats,
    fearGreed,
    chartData,
    chartLoading,
    fetchChart,
    opportunities,
    loading,
    error,
    dismissError: () => setError(null),
  };
}
