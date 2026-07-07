import { evaluateSupportSignal } from '../supportResistance.js';

export const STARTING_CAPITAL = 10000;
const POSITION_PCT = 0.20;
const MAX_POSITIONS = 5;

// Replays evaluateSupportSignal day-by-day across every ticker, applying the same
// portfolio rules a live paper trader would use: 20% sizing, max 5 concurrent
// positions, exit at target or stop — whichever the day's high/low reaches first
// (stop wins on a same-day overlap, the conservative call). `options` is forwarded
// to evaluateSupportSignal so strategy variants can be A/B tested.
export function runBacktest(historyByTicker, options) {
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

    // ── Exits: intrabar target/stop hit, checked against the day's high/low ──
    const stillOpen = [];
    for (const pos of positions) {
      const today = barsToday[pos.ticker];
      if (!today) { stillOpen.push(pos); continue; }
      const { high, low } = today.bar;

      let exitReason = null;
      let exitPrice = null;
      if (low <= pos.stopPrice) { exitReason = 'stop'; exitPrice = pos.stopPrice; }
      else if (high >= pos.targetPrice) { exitReason = 'target'; exitPrice = pos.targetPrice; }

      if (!exitReason) { stillOpen.push(pos); continue; }

      const proceeds = exitPrice * pos.units;
      const pnl = proceeds - pos.costBasis;
      cash += proceeds;
      closedTrades.push({
        ticker: pos.ticker,
        entryTime: pos.entryTime,
        exitTime: t,
        entryPrice: pos.entryPrice,
        exitPrice,
        pnl,
        pnlPct: (pnl / pos.costBasis) * 100,
        holdingDays: Math.round((t - pos.entryTime) / 86400000),
        exitReason,
      });
    }
    positions = stillOpen;

    // ── Entries: one position per ticker, highest confidence (most-touched support) first ──
    const candidates = [];
    for (const ticker of tickers) {
      const today = barsToday[ticker];
      if (!today) continue;
      const evald = evaluateSupportSignal(historyByTicker[ticker], today.idx, options);
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
