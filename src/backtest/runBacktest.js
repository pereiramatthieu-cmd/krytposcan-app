import { evaluateBar } from '../signals';

export const STARTING_CAPITAL = 10000;
const POSITION_PCT = 0.20;
const MAX_POSITIONS = 5;
const WARMUP = 60; // bars needed before EMA50 is as converged as it is on first display live

// Replays generateSignals' exact rule set day-by-day across the whole watchlist,
// applying the same auto-entry/exit portfolio logic as usePaperTrading (20% sizing,
// max 5 concurrent positions, exit on target/stop/trend-flip) — so the backtest is a
// faithful simulation of what the live paper trader would have done historically.
export function runBacktest(historyByTicker) {
  const tickers = Object.keys(historyByTicker);

  const indexByTime = {};
  const allTimes = new Set();
  for (const ticker of tickers) {
    const map = new Map();
    historyByTicker[ticker].forEach((bar, i) => {
      map.set(bar.time, i);
      allTimes.add(bar.time);
    });
    indexByTime[ticker] = map;
  }
  const sortedTimes = Array.from(allTimes).sort((a, b) => a - b);

  let cash = STARTING_CAPITAL;
  let positions = [];
  const closedTrades = [];
  const equityCurve = [];

  const markToMarket = (barsToday) =>
    positions.reduce((sum, p) => {
      const today = barsToday[p.ticker];
      const price = today ? today.bar.price : p.entryPrice;
      return sum + p.units * price;
    }, 0);

  for (const t of sortedTimes) {
    const barsToday = {};
    for (const ticker of tickers) {
      const idx = indexByTime[ticker].get(t);
      if (idx == null) continue;
      barsToday[ticker] = { idx, bar: historyByTicker[ticker][idx] };
    }
    if (Object.keys(barsToday).length === 0) continue;

    // ── Exits: target hit, stop hit, or trend reversal ──
    const stillOpen = [];
    for (const pos of positions) {
      const today = barsToday[pos.ticker];
      if (!today) { stillOpen.push(pos); continue; }
      const price = today.bar.price;
      const evald = today.idx >= WARMUP ? evaluateBar(historyByTicker[pos.ticker], today.idx) : null;

      let exitReason = null;
      if (price >= pos.targetPrice) exitReason = 'target';
      else if (price <= pos.stopPrice) exitReason = 'stop';
      else if (evald?.bias === 'bearish') exitReason = 'signal-flip';

      if (!exitReason) { stillOpen.push(pos); continue; }

      const proceeds = price * pos.units;
      const pnl = proceeds - pos.costBasis;
      cash += proceeds;
      closedTrades.push({
        ticker: pos.ticker,
        entryTime: pos.entryTime,
        exitTime: t,
        entryPrice: pos.entryPrice,
        exitPrice: price,
        pnl,
        pnlPct: (pnl / pos.costBasis) * 100,
        holdingDays: Math.round((t - pos.entryTime) / 86400000),
        exitReason,
      });
    }
    positions = stillOpen;

    // ── Entries: one position per ticker, highest confidence first ──
    const candidates = [];
    for (const ticker of tickers) {
      const today = barsToday[ticker];
      if (!today || today.idx < WARMUP) continue;
      const evald = evaluateBar(historyByTicker[ticker], today.idx);
      if (evald?.signal === 'BUY') candidates.push({ ticker, ...evald });
    }
    candidates.sort((a, b) => b.confidence - a.confidence);

    const openTickers = new Set(positions.map(p => p.ticker));
    for (const cand of candidates) {
      if (positions.length >= MAX_POSITIONS) break;
      if (openTickers.has(cand.ticker)) continue;

      const equity = cash + markToMarket(barsToday);
      const allocation = equity * POSITION_PCT;
      if (allocation > cash) continue;

      positions.push({
        ticker: cand.ticker,
        entryPrice: cand.price,
        entryTime: t,
        units: allocation / cand.price,
        costBasis: allocation,
        targetPrice: cand.targetPrice,
        stopPrice: cand.stopPrice,
      });
      cash -= allocation;
      openTickers.add(cand.ticker);
    }

    equityCurve.push({ time: t, equity: cash + markToMarket(barsToday) });
  }

  return { equityCurve, closedTrades, openPositions: positions, finalCash: cash };
}

export function computeStats(equityCurve, closedTrades, startingCapital) {
  if (!equityCurve.length) return null;

  const finalEquity = equityCurve[equityCurve.length - 1].equity;
  const totalReturnPct = ((finalEquity - startingCapital) / startingCapital) * 100;

  let peak = -Infinity;
  let maxDrawdownPct = 0;
  for (const pt of equityCurve) {
    peak = Math.max(peak, pt.equity);
    maxDrawdownPct = Math.min(maxDrawdownPct, ((pt.equity - peak) / peak) * 100);
  }

  const dailyReturns = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity;
    if (prev > 0) dailyReturns.push((equityCurve[i].equity - prev) / prev);
  }
  const n = dailyReturns.length || 1;
  const meanRet = dailyReturns.reduce((a, b) => a + b, 0) / n;
  const variance = dailyReturns.reduce((a, r) => a + (r - meanRet) ** 2, 0) / n;
  const stdRet = Math.sqrt(variance);
  const sharpe = stdRet > 0 ? (meanRet / stdRet) * Math.sqrt(365) : null;

  const wins = closedTrades.filter(t => t.pnl > 0);
  const losses = closedTrades.filter(t => t.pnl <= 0);
  const grossProfit = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));

  return {
    totalReturnPct,
    maxDrawdownPct,
    sharpe,
    winRate: closedTrades.length ? (wins.length / closedTrades.length) * 100 : null,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : null),
    totalTrades: closedTrades.length,
    avgHoldingDays: closedTrades.length
      ? closedTrades.reduce((a, t) => a + t.holdingDays, 0) / closedTrades.length
      : null,
    finalEquity,
  };
}
