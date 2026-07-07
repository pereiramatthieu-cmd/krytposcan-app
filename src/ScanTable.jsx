import { useState, useMemo, useEffect } from 'react';
import { Search, Radar } from 'lucide-react';
import { fmtPrice, fmtPct } from './format';
import { fetchKlineSeries, fmtShortDate } from './klines';
import { SCAN_LOOKBACK_DAYS } from './useSupportScan';
import { EXTENDED_THRESHOLD_PCT } from './supportResistance';
import SupportChart from './SupportChart';

function SignalBadge({ signal, distancePct }) {
  const styles = {
    BUY:   'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    WATCH: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  };
  const extended = signal === 'BUY' && distancePct > EXTENDED_THRESHOLD_PCT;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold tracking-wide ${styles[signal]}`}>
        {signal}
      </span>
      {extended && (
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-500/15 text-orange-400 border border-orange-500/30"
          title="Close is already well above the support level — not a fresh touch, chasing an in-progress bounce."
        >
          Extended
        </span>
      )}
    </span>
  );
}

function ProgressBar({ done, total }) {
  const pct = total ? (done / total) * 100 : 0;
  return (
    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div className="h-full bg-indigo-500 transition-all duration-200" style={{ width: `${pct}%` }} />
    </div>
  );
}

const SORTS = {
  distancePct:    { label: 'Distance to Support', dir: 1 },
  confidence:     { label: 'Confidence', dir: -1 },
  supportTouches: { label: 'Touches', dir: -1 },
};

function SortableHeader({ column, sortKey, onSort, children }) {
  const active = sortKey === column;
  return (
    <th
      className={`px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-widest whitespace-nowrap cursor-pointer select-none ${active ? 'text-indigo-400' : 'text-zinc-500 hover:text-zinc-300'}`}
      onClick={() => onSort(column)}
    >
      {children}
    </th>
  );
}

export default function ScanTable({ scan }) {
  const { status, progress, results, error, run } = scan;
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState('distancePct');
  const [selectedTicker, setSelectedTicker] = useState(null);
  const [chartSeries, setChartSeries] = useState(null);
  const [chartLoading, setChartLoading] = useState(false);

  const selectedRow = results.find(r => r.ticker === selectedTicker) ?? null;

  useEffect(() => {
    if (!selectedTicker) return;
    let cancelled = false;
    setChartSeries(null);
    setChartLoading(true);
    fetchKlineSeries(selectedTicker, SCAN_LOOKBACK_DAYS, fmtShortDate).then(series => {
      if (!cancelled) {
        setChartSeries(series);
        setChartLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [selectedTicker]);

  const toggleRow = (ticker) => setSelectedTicker(prev => (prev === ticker ? null : ticker));

  const rows = useMemo(() => {
    let filtered = results;
    if (query.trim()) {
      const q = query.trim().toUpperCase();
      filtered = filtered.filter(r => r.ticker.includes(q) || r.name.toUpperCase().includes(q));
    }
    const dir = SORTS[sortKey]?.dir ?? 1;
    return [...filtered].sort((a, b) => dir * ((a[sortKey] ?? 0) - (b[sortKey] ?? 0)));
  }, [results, query, sortKey]);

  const buyCount = results.filter(r => r.signal === 'BUY').length;

  return (
    <>
      {selectedRow && (
        <SupportChart
          row={selectedRow}
          series={chartSeries}
          loading={chartLoading}
          onClose={() => setSelectedTicker(null)}
        />
      )}
      <div className="mx-5 mb-5 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Radar size={14} className="text-zinc-400" />
          <span className="text-sm font-semibold text-zinc-200">Support Scan — Top 300</span>
          {status === 'done' && (
            <span className="text-xs px-2 py-0.5 bg-zinc-800 rounded-full text-zinc-400">{results.length} scanned</span>
          )}
          {status === 'done' && buyCount > 0 && (
            <span className="text-xs px-2 py-0.5 bg-emerald-500/15 text-emerald-400 rounded-full">{buyCount} touching support now</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status === 'done' && (
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Filter ticker or name…"
              className="bg-zinc-800 text-xs text-zinc-200 placeholder-zinc-600 rounded px-2 py-1.5 outline-none border border-zinc-700 focus:border-indigo-500"
            />
          )}
          <button
            onClick={run}
            disabled={status === 'loading'}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/40 hover:bg-indigo-500/30 transition-colors disabled:opacity-50"
          >
            <Search size={12} />
            {status === 'loading'
              ? `Scanning ${progress.done}/${progress.total}…`
              : status === 'done' ? 'Re-scan' : 'Scan Top 300'}
          </button>
        </div>
      </div>

      {status === 'loading' && (
        <div className="px-5 py-4">
          <ProgressBar done={progress.done} total={progress.total} />
        </div>
      )}

      {status === 'idle' && (
        <p className="px-5 py-6 text-xs text-zinc-600">
          Scans the top 300 coins by market cap, finds historical support zones (price levels
          tested 2+ times by past swing lows), and flags tokens currently testing one.
        </p>
      )}

      {status === 'error' && <p className="px-5 py-6 text-xs text-red-400">Scan failed — {error}</p>}

      {status === 'done' && (
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full">
            <thead className="bg-zinc-950/40 border-b border-zinc-800 sticky top-0">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-widest">Asset</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-widest">Signal</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-widest">Price</th>
                <SortableHeader column="distancePct" sortKey={sortKey} onSort={setSortKey}>Dist. to Support</SortableHeader>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-widest">Support Level</th>
                <SortableHeader column="supportTouches" sortKey={sortKey} onSort={setSortKey}>Touches</SortableHeader>
                <SortableHeader column="confidence" sortKey={sortKey} onSort={setSortKey}>Confidence</SortableHeader>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-widest">Target</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-widest">Stop (-10%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-zinc-600">No matches.</td></tr>
              ) : rows.map(r => (
                <tr
                  key={r.ticker}
                  onClick={() => toggleRow(r.ticker)}
                  className={`hover:bg-zinc-800/40 transition-colors cursor-pointer ${
                    r.ticker === selectedTicker ? 'bg-indigo-500/10' : r.signal === 'BUY' ? 'bg-emerald-500/5' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <span className="text-sm font-semibold text-zinc-100">{r.ticker}</span>
                    <span className="ml-2 text-xs text-zinc-600">{r.name}</span>
                  </td>
                  <td className="px-4 py-3"><SignalBadge signal={r.signal} distancePct={r.distancePct} /></td>
                  <td className="px-4 py-3 text-xs text-zinc-300 tabular-nums font-mono">{fmtPrice(r.price)}</td>
                  <td className={`px-4 py-3 text-xs font-semibold tabular-nums ${r.distancePct <= 3 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                    {fmtPct(r.distancePct)}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-400 tabular-nums font-mono">{fmtPrice(r.supportLevel)}</td>
                  <td className="px-4 py-3 text-xs text-zinc-300 tabular-nums">{r.supportTouches}x</td>
                  <td className="px-4 py-3 text-xs text-zinc-300 tabular-nums">{r.confidence}%</td>
                  <td className="px-4 py-3 text-xs font-semibold text-emerald-400 tabular-nums font-mono">{fmtPrice(r.targetPrice)}</td>
                  <td className="px-4 py-3 text-xs font-semibold text-red-400 tabular-nums font-mono">{fmtPrice(r.stopPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
    </>
  );
}
