import { useState, useEffect } from 'react';

const GCK = 'https://api.coingecko.com/api/v3';
const CG_KEY = import.meta.env?.VITE_CG_API_KEY;

function cgUrl(path) {
  return CG_KEY ? `${GCK}${path}${path.includes('?') ? '&' : '?'}x_cg_demo_api_key=${CG_KEY}` : `${GCK}${path}`;
}

export function useGlobalStats() {
  const [stats, setStats] = useState(null);
  const [fearGreed, setFearGreed] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [glbRes, fngRes] = await Promise.all([
          fetch(cgUrl('/global')),
          fetch('https://api.alternative.me/fng/?limit=1').catch(() => null),
        ]);
        if (cancelled) return;

        if (glbRes.ok) {
          const global = await glbRes.json();
          setStats({
            totalMarketCap: global.data.total_market_cap.usd,
            btcDominance: global.data.market_cap_percentage.btc,
            volume24h: global.data.total_volume.usd,
          });
        }

        if (fngRes?.ok) {
          const fng = await fngRes.json();
          if (fng?.data?.[0]) {
            setFearGreed({
              value: parseInt(fng.data[0].value, 10),
              label: fng.data[0].value_classification,
            });
          }
        }
      } catch {
        // non-critical — the overview strip just stays blank on failure
      }
    }

    load();
    const id = setInterval(load, 1_800_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return { stats, fearGreed };
}
