import { BarChart2, Activity, TrendingUp, Zap, Clock } from 'lucide-react';
import { useGlobalStats } from './useGlobalStats';
import { useSupportScan } from './useSupportScan';
import { useBacktest } from './backtest/useBacktest';
import { STARTING_CAPITAL as BACKTEST_STARTING_CAPITAL } from './backtest/runBacktest';
import BacktestPanel from './BacktestPanel';
import ScanTable from './ScanTable';
import { fmtLarge } from './format';

function TopBar() {
  const now = new Date();
  const ts = now.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
  return (
    <div className="h-14 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex items-center gap-2">
        <BarChart2 size={20} className="text-indigo-400" />
        <span className="text-zinc-100 font-bold tracking-widest text-sm">
          KRYPTO<span className="text-indigo-400">SCAN</span>
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span>Live</span>
        <span className="text-zinc-600">·</span>
        <Clock size={12} />
        <span>{ts}</span>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, accent }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 flex items-start gap-3 flex-1">
      <div className={`p-2 rounded ${accent} flex-shrink-0`}>
        <Icon size={14} className="text-zinc-100" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-zinc-500 mb-0.5">{label}</p>
        <p className="text-sm font-bold text-zinc-100 tabular-nums truncate">{value}</p>
        {sub && <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function FearGreedCard({ value, label }) {
  const color = value >= 75 ? '#10b981' : value >= 55 ? '#22c55e' : value >= 45 ? '#eab308' : value >= 25 ? '#f97316' : '#ef4444';
  const bg    = value >= 75 ? 'bg-emerald-500/20' : value >= 55 ? 'bg-green-500/15' : value >= 45 ? 'bg-yellow-500/15' : value >= 25 ? 'bg-orange-500/15' : 'bg-red-500/20';
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 flex items-start gap-3 flex-1">
      <div className={`p-2 rounded ${bg} flex-shrink-0`}>
        <Activity size={14} style={{ color }} />
      </div>
      <div>
        <p className="text-xs text-zinc-500 mb-0.5">Fear & Greed</p>
        <div className="flex items-baseline gap-2">
          <p className="text-sm font-bold tabular-nums" style={{ color }}>{value}</p>
          <span className="text-xs" style={{ color }}>{label}</span>
        </div>
      </div>
    </div>
  );
}

function MarketOverviewStrip({ stats, fearGreed, touchingSupportCount }) {
  const fg = fearGreed ?? { value: 0, label: '—' };
  return (
    <div className="flex gap-3 px-5 py-4">
      <StatCard label="Total Market Cap" value={fmtLarge(stats?.totalMarketCap)} sub="Global crypto" icon={BarChart2} accent="bg-indigo-500/20" />
      <StatCard label="BTC Dominance"    value={stats ? `${stats.btcDominance.toFixed(1)}%` : '—'} sub="of total cap" icon={TrendingUp} accent="bg-orange-500/20" />
      <FearGreedCard value={fg.value} label={fg.label} />
      <StatCard label="24h Volume"       value={fmtLarge(stats?.volume24h)} sub="All markets" icon={Activity} accent="bg-blue-500/20" />
      <StatCard label="Touching Support" value={String(touchingSupportCount)} sub="Live signals" icon={Zap} accent="bg-emerald-500/20" />
    </div>
  );
}

export default function KryptoScan() {
  const { stats, fearGreed } = useGlobalStats();
  const scan = useSupportScan();
  const backtest = useBacktest();

  const touchingSupportCount = scan.results.filter(r => r.signal === 'BUY').length;

  return (
    <div className="bg-zinc-950 min-h-screen flex flex-col" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <TopBar />

      <div className="flex-1 overflow-y-auto">
        <MarketOverviewStrip stats={stats} fearGreed={fearGreed} touchingSupportCount={touchingSupportCount} />
        <BacktestPanel backtest={backtest} startingCapital={BACKTEST_STARTING_CAPITAL} />
        <ScanTable scan={scan} />
      </div>
    </div>
  );
}
