const GCK = 'https://api.coingecko.com/api/v3';
const CG_KEY = import.meta.env?.VITE_CG_API_KEY;

function cgUrl(path) {
  return CG_KEY ? `${GCK}${path}${path.includes('?') ? '&' : '?'}x_cg_demo_api_key=${CG_KEY}` : `${GCK}${path}`;
}

// Pegged assets don't have the swing price structure support/resistance is built
// for, so they're excluded from the scan universe.
const STABLECOIN_SYMBOLS = new Set([
  'usdt', 'usdc', 'dai', 'tusd', 'fdusd', 'usde', 'pyusd', 'usdd',
  'frax', 'usdp', 'gusd', 'lusd', 'susd', 'usds', 'usd1', 'eurc',
]);

// Fetches the top `count` coins by market cap from CoinGecko. Binance-pair
// resolution happens later (fetchAllScanHistories) — this just returns the
// candidate universe with CoinGecko's own price/market-cap fields.
export async function fetchTopCoins(count = 300) {
  const perPage = 250;
  const pages = Math.ceil(count / perPage);
  const rows = [];

  for (let page = 1; page <= pages; page++) {
    const res = await fetch(cgUrl(
      `/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${page}`
    ));
    if (!res.ok) throw new Error(`CoinGecko markets page ${page}: ${res.status}`);
    const json = await res.json();
    rows.push(...json);
    if (json.length < perPage) break;
  }

  const seen = new Map(); // ticker -> row, keeps the highest-market-cap one on symbol collisions
  for (const c of rows.slice(0, count)) {
    const ticker = c.symbol?.toUpperCase();
    if (!ticker || STABLECOIN_SYMBOLS.has(c.symbol.toLowerCase())) continue;
    const existing = seen.get(ticker);
    if (!existing || (c.market_cap ?? 0) > (existing.marketCap ?? 0)) {
      seen.set(ticker, {
        ticker,
        id: c.id,
        name: c.name,
        price: c.current_price,
        marketCap: c.market_cap,
        marketCapRank: c.market_cap_rank,
        change24h: c.price_change_percentage_24h ?? 0,
      });
    }
  }

  return Array.from(seen.values()).sort((a, b) => (a.marketCapRank ?? 9e9) - (b.marketCapRank ?? 9e9));
}
