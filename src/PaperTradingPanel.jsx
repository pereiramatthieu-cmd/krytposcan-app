import { Wallet, RotateCcw } from 'lucide-react';
import { fmtPrice, fmtPct, pctColor } from './format';

function daysHeld(entryDate) {
  const days = Math.floor((Date.now() - entryDate) / 86400000);
  return days === 0 ? '<1d' : `${days}d`;
}

const EXIT_LABELS = {
  target:        { text: 'Target hit',  className: 'text-emerald-400' },
  stop:          { text: 'Stop loss',   className: 'text-red-400' },
  'signal-flip': { text: 'Signal flip', className: 'text-amber-400' },
};

function StatBlock({ label, value, valueClassName = 'text-zinc-100' }) {
  return (
    <div>
      <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${valueClassName}`}>{value}</p>
    </div>
  );
}

export default function PaperTradingPanel({ paper, watchlist }) {
  const {
    equity, cash, totalReturnPct, winRate,
    positions, closedTrades, startingCapital, maxPositions, reset,
  } = paper;

  return (
    <div className="mx-5 mb-4 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet size={14} className="text-zinc-400" />
          <span className="text-sm font-semibold text-zinc-200">Paper Trading — Swing</span>
          <span className="text-xs px-2 py-0.5 bg-zinc-800 rounded-full text-zinc-400">
            {positions.length}/{maxPositions} slots
          </span>
        </div>
        <button
          onClick={reset}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <RotateCcw size={12} /> Reset
        </button>
      </div>

      <div className="flex gap-8 px-5 py-4 border-b border-zinc-800">
        <StatBlock label="Equity" value={fmtPrice(equity)} />
        <StatBlock label="Cash" value={fmtPrice(cash)} />
        <StatBlock label="Total Return" value={fmtPct(totalReturnPct)} valueClassName={pctColor(totalReturnPct)} />
        <StatBlock label="Win Rate" value={winRate == null ? '—' : `${winRate.toFixed(0)}%`} />
        <StatBlock label="Starting Capital" value={fmtPrice(startingCapital)} />
      </div>

      <div className="px-5 py-3">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">Open Positions</p>
        {positions.length === 0 ? (
          <p className="text-xs text-zinc-600 py-2">No open positions — waiting for a BUY signal.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left">
                <th className="text-xs text-zinc-500 font-semibold pb-2">Asset</th>
                <th className="text-xs text-zinc-500 font-semibold pb-2">Entry</th>
                <th className="text-xs text-zinc-500 font-semibold pb-2">Current</th>
                <th className="text-xs text-zinc-500 font-semibold pb-2">P&L</th>
                <th className="text-xs text-zinc-500 font-semibold pb-2">Target</th>
                <th className="text-xs text-zinc-500 font-semibold pb-2">Stop</th>
                <th className="text-xs text-zinc-500 font-semibold pb-2">Held</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {positions.map(pos => {
                const currentPrice = watchlist[pos.ticker]?.price ?? pos.entryPrice;
                const pnl = (currentPrice - pos.entryPrice) * pos.units;
                const pnlPct = (pnl / pos.costBasis) * 100;
                return (
                  <tr key={pos.id}>
                    <td className="py-2 text-sm font-semibold text-zinc-100">{pos.ticker}</td>
                    <td className="py-2 text-xs text-zinc-400 tabular-nums">{fmtPrice(pos.entryPrice)}</td>
                    <td className="py-2 text-xs text-zinc-300 tabular-nums">{fmtPrice(currentPrice)}</td>
                    <td className={`py-2 text-xs font-semibold tabular-nums ${pctColor(pnl)}`}>{fmtPct(pnlPct)}</td>
                    <td className="py-2 text-xs text-emerald-400 tabular-nums">{fmtPrice(pos.targetPrice)}</td>
                    <td className="py-2 text-xs text-red-400 tabular-nums">{fmtPrice(pos.stopPrice)}</td>
                    <td className="py-2 text-xs text-zinc-500">{daysHeld(pos.entryDate)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {closedTrades.length > 0 && (
        <div className="px-5 py-3 border-t border-zinc-800">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">
            Trade History ({closedTrades.length})
          </p>
          <table className="w-full">
            <thead>
              <tr className="text-left">
                <th className="text-xs text-zinc-500 font-semibold pb-2">Asset</th>
                <th className="text-xs text-zinc-500 font-semibold pb-2">Entry → Exit</th>
                <th className="text-xs text-zinc-500 font-semibold pb-2">P&L</th>
                <th className="text-xs text-zinc-500 font-semibold pb-2">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {closedTrades.slice(0, 10).map(t => (
                <tr key={t.id}>
                  <td className="py-2 text-sm font-semibold text-zinc-100">{t.ticker}</td>
                  <td className="py-2 text-xs text-zinc-400 tabular-nums">
                    {fmtPrice(t.entryPrice)} → {fmtPrice(t.exitPrice)}
                  </td>
                  <td className={`py-2 text-xs font-semibold tabular-nums ${pctColor(t.pnl)}`}>{fmtPct(t.pnlPct)}</td>
                  <td className={`py-2 text-xs ${EXIT_LABELS[t.exitReason]?.className ?? 'text-zinc-500'}`}>
                    {EXIT_LABELS[t.exitReason]?.text ?? t.exitReason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
