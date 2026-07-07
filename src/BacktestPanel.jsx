import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { TestTube2, Play } from 'lucide-react';
import { fmtPrice, fmtPct, pctColor } from './format';

function fmtDate(ms) {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function fmtRatio(v) {
  if (v == null) return '—';
  if (v === Infinity) return '∞';
  return `${v.toFixed(2)}x`;
}

function StatCard({ label, value, valueClassName = 'text-zinc-100' }) {
  return (
    <div className="bg-zinc-800/60 rounded-lg px-3 py-2">
      <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
      <p className={`text-sm font-bold tabular-nums ${valueClassName}`}>{value}</p>
    </div>
  );
}

function EquityTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs shadow-xl">
      <p className="text-zinc-400 mb-1">{fmtDate(label)}</p>
      <p className="text-zinc-100 font-semibold">{fmtPrice(payload[0].value)}</p>
    </div>
  );
}

export default function BacktestPanel({ backtest, startingCapital }) {
  const { status, result, error, run } = backtest;

  return (
    <div className="mx-5 mb-4 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TestTube2 size={14} className="text-zinc-400" />
          <span className="text-sm font-semibold text-zinc-200">Backtest — Swing Strategy (2 Years)</span>
        </div>
        <button
          onClick={run}
          disabled={status === 'loading'}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 hover:bg-indigo-500/30 transition-colors disabled:opacity-50"
        >
          <Play size={12} />
          {status === 'loading' ? 'Running…' : status === 'done' ? 'Re-run' : 'Run Backtest'}
        </button>
      </div>

      {status === 'idle' && (
        <p className="px-5 py-6 text-xs text-zinc-600">
          Replays the exact live signal logic (EMA20/50, RSI14) day-by-day over ~2 years of Binance
          daily history, using the same 20%-sizing / max-5-position rules as the paper trading engine.
        </p>
      )}

      {status === 'error' && (
        <p className="px-5 py-6 text-xs text-red-400">Backtest failed — {error}</p>
      )}

      {status === 'done' && result && (
        <>
          <div className="grid grid-cols-4 lg:grid-cols-7 gap-2 px-5 py-4 border-b border-zinc-800">
            <StatCard label="Total Return" value={fmtPct(result.stats.totalReturnPct)} valueClassName={pctColor(result.stats.totalReturnPct)} />
            <StatCard label="Max Drawdown" value={fmtPct(result.stats.maxDrawdownPct, false)} valueClassName="text-red-400" />
            <StatCard label="Win Rate" value={result.stats.winRate == null ? '—' : `${result.stats.winRate.toFixed(0)}%`} />
            <StatCard label="Profit Factor" value={fmtRatio(result.stats.profitFactor)} />
            <StatCard label="Sharpe (ann.)" value={result.stats.sharpe == null ? '—' : result.stats.sharpe.toFixed(2)} />
            <StatCard label="Total Trades" value={String(result.stats.totalTrades)} />
            <StatCard label="Avg Hold" value={result.stats.avgHoldingDays == null ? '—' : `${result.stats.avgHoldingDays.toFixed(1)}d`} />
          </div>

          <div className="px-5 py-4 border-b border-zinc-800">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">Equity Curve</p>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={result.equityCurve} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                  <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="time"
                    tickFormatter={fmtDate}
                    tick={{ fill: '#71717a', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    interval={Math.max(0, Math.floor(result.equityCurve.length / 8))}
                  />
                  <YAxis
                    tickFormatter={v => fmtPrice(v)}
                    tick={{ fill: '#71717a', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                  />
                  <ReferenceLine y={startingCapital} stroke="#52525b" strokeDasharray="4 4" strokeOpacity={0.6} />
                  <Tooltip content={<EquityTooltip />} />
                  <Line type="monotone" dataKey="equity" stroke="#6366f1" strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="px-5 py-4">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">Per-Asset Breakdown</p>
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  <th className="text-xs text-zinc-500 font-semibold pb-2">Asset</th>
                  <th className="text-xs text-zinc-500 font-semibold pb-2">Trades</th>
                  <th className="text-xs text-zinc-500 font-semibold pb-2">Win Rate</th>
                  <th className="text-xs text-zinc-500 font-semibold pb-2">P&L</th>
                  <th className="text-xs text-zinc-500 font-semibold pb-2">History Tested</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {Object.entries(result.perTicker).map(([ticker, t]) => (
                  <tr key={ticker}>
                    <td className="py-2 text-sm font-semibold text-zinc-100">{ticker}</td>
                    <td className="py-2 text-xs text-zinc-300">{t.trades}</td>
                    <td className="py-2 text-xs text-zinc-300">{t.winRate == null ? '—' : `${t.winRate.toFixed(0)}%`}</td>
                    <td className={`py-2 text-xs font-semibold ${pctColor(t.pnl)}`}>{fmtPrice(t.pnl)}</td>
                    <td className="py-2 text-xs text-zinc-500">{t.firstDate} → {t.lastDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
