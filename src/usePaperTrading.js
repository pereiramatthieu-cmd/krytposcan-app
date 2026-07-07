import { useState, useEffect, useRef, useMemo } from 'react';

const STORAGE_KEY = 'kryptoscan_paper_trading_v1';
export const STARTING_CAPITAL = 10000;
const POSITION_PCT = 0.20;
const MAX_POSITIONS = 5;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // corrupt or unavailable storage — fall back to a fresh portfolio
  }
  return { cash: STARTING_CAPITAL, positions: [], closedTrades: [] };
}

// Auto-enters BUY-signal swing trades (20% of equity, max 5 concurrent) and
// exits on target/stop hit or trend reversal (bias flips bearish).
export function usePaperTrading(opportunities, watchlist) {
  const [state, setState] = useState(loadState);
  const nextId = useRef(
    1 + Math.max(0, ...state.positions.map(p => p.id), ...state.closedTrades.map(t => t.id))
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (!opportunities.length || !Object.keys(watchlist).length) return;

    setState(prev => {
      let cash = prev.cash;
      let positions = [...prev.positions];
      let closedTrades = prev.closedTrades;
      let changed = false;

      const opByTicker = Object.fromEntries(opportunities.map(o => [o.asset, o]));

      // ── Exits: target hit, stop hit, or trend reversal ──
      const stillOpen = [];
      for (const pos of positions) {
        const coin = watchlist[pos.ticker];
        if (!coin) { stillOpen.push(pos); continue; }
        const price = coin.price;
        const opp = opByTicker[pos.ticker];

        let exitReason = null;
        if (price >= pos.targetPrice) exitReason = 'target';
        else if (price <= pos.stopPrice) exitReason = 'stop';
        else if (opp && opp.bias === 'bearish') exitReason = 'signal-flip';

        if (!exitReason) { stillOpen.push(pos); continue; }

        const proceeds = price * pos.units;
        const pnl = proceeds - pos.costBasis;
        cash += proceeds;
        closedTrades = [{
          id: pos.id,
          ticker: pos.ticker,
          entryPrice: pos.entryPrice,
          exitPrice: price,
          entryDate: pos.entryDate,
          exitDate: Date.now(),
          pnl,
          pnlPct: (pnl / pos.costBasis) * 100,
          exitReason,
        }, ...closedTrades].slice(0, 50);
        changed = true;
      }
      positions = stillOpen;

      // ── Entries: one position per ticker, highest confidence first ──
      const openTickers = new Set(positions.map(p => p.ticker));
      for (const opp of opportunities) {
        if (positions.length >= MAX_POSITIONS) break;
        if (opp.signal !== 'BUY') continue;
        if (openTickers.has(opp.asset)) continue;
        const coin = watchlist[opp.asset];
        if (!coin) continue;

        const posValue = positions.reduce(
          (sum, p) => sum + p.units * (watchlist[p.ticker]?.price ?? p.entryPrice), 0
        );
        const equity = cash + posValue;
        const allocation = equity * POSITION_PCT;
        if (allocation > cash) continue;

        const units = allocation / coin.price;
        positions.push({
          id: nextId.current++,
          ticker: opp.asset,
          entryPrice: coin.price,
          entryDate: Date.now(),
          units,
          costBasis: allocation,
          targetPrice: opp.targetPrice,
          stopPrice: opp.stopPrice,
          trigger: opp.trigger,
        });
        cash -= allocation;
        openTickers.add(opp.asset);
        changed = true;
      }

      return changed ? { cash, positions, closedTrades } : prev;
    });
  }, [opportunities, watchlist]);

  const equity = useMemo(() => {
    const posValue = state.positions.reduce(
      (sum, p) => sum + p.units * (watchlist[p.ticker]?.price ?? p.entryPrice), 0
    );
    return state.cash + posValue;
  }, [state, watchlist]);

  const totalReturnPct = ((equity - STARTING_CAPITAL) / STARTING_CAPITAL) * 100;

  const winRate = state.closedTrades.length
    ? (state.closedTrades.filter(t => t.pnl > 0).length / state.closedTrades.length) * 100
    : null;

  const reset = () => {
    nextId.current = 1;
    setState({ cash: STARTING_CAPITAL, positions: [], closedTrades: [] });
  };

  return {
    cash: state.cash,
    positions: state.positions,
    closedTrades: state.closedTrades,
    equity,
    totalReturnPct,
    winRate,
    startingCapital: STARTING_CAPITAL,
    maxPositions: MAX_POSITIONS,
    reset,
  };
}
