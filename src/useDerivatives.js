import { useState, useEffect } from 'react';

const BINANCE_FAPI = 'https://fapi.binance.com/fapi/v1';
const POLL_MS = 60_000;

// Binance Futures perpetuals — funding rate + open interest (public, no key needed)
async function fetchDerivative(ticker) {
  const symbol = `${ticker}USDT`;
  try {
    const [premRes, oiRes] = await Promise.all([
      fetch(`${BINANCE_FAPI}/premiumIndex?symbol=${symbol}`),
      fetch(`${BINANCE_FAPI}/openInterest?symbol=${symbol}`),
    ]);
    if (!premRes.ok || !oiRes.ok) return null;

    const [prem, oi] = await Promise.all([premRes.json(), oiRes.json()]);
    const markPrice = parseFloat(prem.markPrice);
    const openInterest = parseFloat(oi.openInterest);

    return {
      fundingRatePct: parseFloat(prem.lastFundingRate) * 100,
      nextFundingTime: prem.nextFundingTime,
      markPrice,
      openInterest,
      openInterestUsd: openInterest * markPrice,
    };
  } catch {
    return null; // no perp listed for this ticker, or network error
  }
}

// tickers must be a stable array reference (e.g. a module-level constant)
export function useDerivatives(tickers) {
  const [derivatives, setDerivatives] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const results = await Promise.all(
        tickers.map(async ticker => [ticker, await fetchDerivative(ticker)])
      );
      if (cancelled) return;
      setDerivatives(Object.fromEntries(results.filter(([, v]) => v !== null)));
    }

    load();
    const id = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [tickers]);

  return derivatives;
}
