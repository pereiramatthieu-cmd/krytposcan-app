import React, { useState, useEffect } from 'react';
import {
  ComposedChart, Area, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, LineChart
} from 'recharts';
import {
  TrendingUp, TrendingDown, Activity, ChevronUp, ChevronDown,
  ChevronsUpDown, BarChart2, Zap, Clock, Target, AlertCircle, X
} from 'lucide-react';
import { useMarketData } from './useMarketData';

// ═══════════════════════════════════════════════════════════════════════════════
// STATIC CONFIG  (opportunities table remains mock — phase 2 scope is data only)
// ═══════════════════════════════════════════════════════════════════════════════

const WATCHLIST_ORDER = ['BTC','ETH','SOL','CFX','AAVE','ARB','ONDO','IO'];
const FILTER_TABS = ['All','DeFi','L1','L2','Memes'];


// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function fmtPrice(p) {
  if (!p && p !== 0) return '—';
  if (p >= 10000) return `$${(p / 1000).toFixed(1)}k`;
  if (p >= 1000)  return `$${p.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (p >= 1)     return `$${p.toFixed(2)}`;
  return `$${p.toFixed(4)}`;
}

function fmtLarge(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(0)}`;
}

function fmtSupply(n, ticker) {
  if (!n) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B ${ticker}`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M ${ticker}`;
  return `${n.toLocaleString()} ${ticker}`;
}

function fmtPct(v, withSign = true) {
  if (v == null) return '—';
  const s = withSign && v > 0 ? '+' : '';
  return `${s}${v.toFixed(2)}%`;
}

function pctColor(v) {
  if (v == null) return 'text-zinc-600';
  return v >= 0 ? 'text-emerald-400' : 'text-red-400';
}

// Volume axis labels (no $ prefix)
function fmtVol(v) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  return v.toFixed(0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOADING SKELETON
// ═══════════════════════════════════════════════════════════════════════════════

function LoadingSkeleton() {
  const pulse = 'bg-zinc-800 rounded animate-pulse';
  return (
    <div className="bg-zinc-950 min-h-screen flex flex-col">
      <div className="h-14 bg-zinc-900 border-b border-zinc-800 flex items-center px-6 gap-4 flex-shrink-0">
        <div className={`w-32 h-4 ${pulse}`} />
        <div className="flex gap-2">
          {[...Array(5)].map((_, i) => <div key={i} className={`w-14 h-7 ${pulse}`} />)}
        </div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-64 bg-zinc-900 border-r border-zinc-800 p-4 space-y-3 flex-shrink-0">
          {[...Array(8)].map((_, i) => <div key={i} className={`h-14 ${pulse}`} />)}
        </div>
        <div className="flex-1 p-5 space-y-4">
          <div className="flex gap-3">
            {[...Array(5)].map((_, i) => <div key={i} className={`flex-1 h-20 ${pulse}`} />)}
          </div>
          <div className={`h-96 ${pulse}`} />
          <div className={`h-56 ${pulse}`} />
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR BANNER
// ═══════════════════════════════════════════════════════════════════════════════

function ErrorBanner({ message, onDismiss }) {
  return (
    <div className="bg-red-500/10 border-b border-red-500/25 px-6 py-2 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-2 text-sm text-red-400">
        <AlertCircle size={14} />
        <span>{message}</span>
      </div>
      <button onClick={onDismiss} className="text-red-400 hover:text-red-300 transition-colors">
        <X size={14} />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMALL COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function SignalBadge({ signal }) {
  const styles = {
    BUY:   'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    SELL:  'bg-red-500/15 text-red-400 border border-red-500/30',
    WATCH: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold tracking-wide ${styles[signal]}`}>
      {signal}
    </span>
  );
}

function PctBadge({ value }) {
  const pos = value >= 0;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium tabular-nums ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
      {pos ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function Sparkline({ prices, positive }) {
  const data = (prices ?? []).map(v => ({ v }));
  return (
    <LineChart width={64} height={28} data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
      <Line
        type="monotone" dataKey="v"
        stroke={positive ? '#10b981' : '#ef4444'}
        strokeWidth={1.5} dot={false} isAnimationActive={false}
      />
    </LineChart>
  );
}

function ConfidenceBar({ value }) {
  const color = value >= 75 ? 'bg-emerald-500' : value >= 60 ? 'bg-blue-500' : 'bg-amber-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-zinc-300 tabular-nums">{value}%</span>
    </div>
  );
}

function SortIcon({ column, config }) {
  if (config.key !== column) return <ChevronsUpDown size={13} className="text-zinc-600" />;
  return config.dir === 'asc'
    ? <ChevronUp size={13} className="text-indigo-400" />
    : <ChevronDown size={13} className="text-indigo-400" />;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHART TOOLTIPS
// ═══════════════════════════════════════════════════════════════════════════════

function PriceTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const p   = payload.find(x => x.dataKey === 'price');
  const e20 = payload.find(x => x.dataKey === 'ema20');
  const e50 = payload.find(x => x.dataKey === 'ema50');
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs shadow-xl">
      <p className="text-zinc-400 mb-1">{label}</p>
      {p   && <p className="text-zinc-100 font-semibold">{fmtPrice(p.value)}</p>}
      {e20 && <p className="text-blue-400">EMA20 {fmtPrice(e20.value)}</p>}
      {e50 && <p className="text-orange-400">EMA50 {fmtPrice(e50.value)}</p>}
    </div>
  );
}

function RSITooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const v = payload[0]?.value;
  const zone = v >= 70 ? 'Overbought' : v <= 30 ? 'Oversold' : 'Neutral';
  const zoneColor = v >= 70 ? 'text-red-400' : v <= 30 ? 'text-emerald-400' : 'text-zinc-400';
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs shadow-xl">
      <p className="text-zinc-400 mb-1">{label}</p>
      <p className="text-violet-400 font-semibold">RSI {v?.toFixed(1)}</p>
      <p className={zoneColor}>{zone}</p>
    </div>
  );
}

function VolumeTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs shadow-xl">
      <p className="text-zinc-400 mb-1">{label}</p>
      <p className="text-zinc-100">{fmtLarge(payload[0]?.value)} vol</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOP BAR
// ═══════════════════════════════════════════════════════════════════════════════

function TopBar({ activeFilter, onFilter }) {
  const now = new Date();
  const ts = now.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
  return (
    <div className="h-14 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <BarChart2 size={20} className="text-indigo-400" />
          <span className="text-zinc-100 font-bold tracking-widest text-sm">
            KRYPTO<span className="text-indigo-400">SCAN</span>
          </span>
        </div>
        <div className="w-px h-5 bg-zinc-700 mx-2" />
        <div className="flex items-center gap-1">
          {FILTER_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => onFilter(tab)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeFilter === tab
                  ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
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

// ═══════════════════════════════════════════════════════════════════════════════
// WATCHLIST SIDEBAR
// ═══════════════════════════════════════════════════════════════════════════════

function WatchlistSidebar({ selected, onSelect, coins }) {
  return (
    <div className="w-64 flex-shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col">
      <div className="px-4 py-3 border-b border-zinc-800">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Watchlist</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {WATCHLIST_ORDER.map(ticker => {
          const coin = coins?.[ticker];
          const isSelected = selected === ticker;
          if (!coin) {
            return (
              <div key={ticker} className="px-4 py-3 border-b border-zinc-800/50 flex items-center gap-3">
                <div className="flex-1 space-y-2">
                  <div className="flex justify-between">
                    <div className="w-8 h-3 bg-zinc-800 rounded animate-pulse" />
                    <div className="w-12 h-3 bg-zinc-800 rounded animate-pulse" />
                  </div>
                  <div className="w-16 h-3 bg-zinc-800 rounded animate-pulse" />
                </div>
              </div>
            );
          }
          const pos = coin.change24h >= 0;
          return (
            <button
              key={ticker}
              onClick={() => onSelect(ticker)}
              className={`w-full px-4 py-3 flex items-center gap-3 transition-colors text-left border-b border-zinc-800/50 ${
                isSelected
                  ? 'bg-indigo-500/10 border-l-2 border-l-indigo-500'
                  : 'hover:bg-zinc-800/50'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-semibold text-zinc-100">{ticker}</span>
                  <span className={`text-xs font-medium tabular-nums ${pos ? 'text-emerald-400' : 'text-red-400'}`}>
                    {fmtPct(coin.change24h)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-400 tabular-nums">{fmtPrice(coin.price)}</span>
                  <Sparkline prices={coin.sparkline} positive={pos} />
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <div className="px-4 py-3 border-t border-zinc-800">
        <p className="text-xs text-zinc-600">8 assets tracked</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MARKET OVERVIEW STRIP
// ═══════════════════════════════════════════════════════════════════════════════

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
        <div className="mt-1.5 w-24 h-1 bg-zinc-700 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${value}%`, backgroundColor: color }} />
        </div>
      </div>
    </div>
  );
}

function MarketOverviewStrip({ stats, fearGreed, buySignalCount }) {
  const fg = fearGreed ?? { value: 0, label: '—' };
  return (
    <div className="flex gap-3 px-5 py-4">
      <StatCard label="Total Market Cap" value={fmtLarge(stats?.totalMarketCap)}  sub="Global crypto" icon={BarChart2} accent="bg-indigo-500/20" />
      <StatCard label="BTC Dominance"    value={stats ? `${stats.btcDominance.toFixed(1)}%` : '—'} sub="of total cap" icon={TrendingUp} accent="bg-orange-500/20" />
      <FearGreedCard value={fg.value} label={fg.label} />
      <StatCard label="24h Volume"       value={fmtLarge(stats?.volume24h)}        sub="All markets"  icon={Activity} accent="bg-blue-500/20" />
      <StatCard label="Active Signals"   value={String(buySignalCount ?? 0)}       sub="BUY setups"   icon={Zap} accent="bg-emerald-500/20" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ASSET DEEP DIVE
// ═══════════════════════════════════════════════════════════════════════════════

function PerfRow({ label, value }) {
  if (value == null) return (
    <div className="flex items-center justify-between py-1.5 border-b border-zinc-800">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs text-zinc-600">—</span>
    </div>
  );
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-zinc-800">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={`text-xs font-semibold tabular-nums ${pctColor(value)}`}>{fmtPct(value)}</span>
    </div>
  );
}

function StatRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-zinc-800">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs text-zinc-200 font-medium tabular-nums text-right max-w-32 truncate">{value ?? '—'}</span>
    </div>
  );
}

function ChartSpinner() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded bg-zinc-900/75">
      <div className="w-5 h-5 border-2 border-zinc-700 border-t-indigo-400 rounded-full animate-spin" />
    </div>
  );
}

function AssetDeepDive({ selectedCoin, coin, chartResult, isChartLoading }) {
  const series = chartResult?.series ?? [];

  const seriesPrices = series.map(d => d.price).filter(Boolean);
  const priceMin   = seriesPrices.length ? Math.min(...seriesPrices) : 0;
  const priceMax   = seriesPrices.length ? Math.max(...seriesPrices) : 0;
  const priceRange = priceMax - priceMin;
  const yDomain    = seriesPrices.length
    ? [priceMin - priceRange * 0.05, priceMax + priceRange * 0.05]
    : ['auto', 'auto'];

  const refPrice = coin?.price ?? 1;
  const priceTick = (v) => {
    if (refPrice >= 10000) return `${(v / 1000).toFixed(0)}k`;
    if (refPrice >= 1000)  return `${(v / 1000).toFixed(1)}k`;
    if (refPrice >= 100)   return v.toFixed(0);
    if (refPrice >= 1)     return v.toFixed(2);
    return v.toFixed(4);
  };

  const lastRSI    = series.length ? series[series.length - 1]?.rsi : null;
  const axisStyle  = { fill: '#71717a', fontSize: 10 };
  const gridStyle  = { stroke: '#27272a', strokeDasharray: '3 3' };
  const athPct     = coin ? ((coin.price - coin.ath) / coin.ath) * 100 : null;

  return (
    <div className="mx-5 mb-4 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-zinc-100">{coin?.name ?? selectedCoin}</span>
          <span className="text-xs text-zinc-500 font-medium">{selectedCoin}</span>
          <span className="text-xs px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">{coin?.category ?? '—'}</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-lg font-bold text-zinc-100 tabular-nums">{fmtPrice(coin?.price)}</span>
          {coin && <PctBadge value={coin.change24h} />}
        </div>
      </div>

      <div className="flex">
        {/* Charts column */}
        <div className="flex-1 min-w-0 px-5 py-4 border-r border-zinc-800 space-y-1">
          {/* Legend */}
          <div className="flex items-center gap-4 mb-2">
            <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-indigo-400 rounded" /><span className="text-xs text-zinc-500">Price</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-blue-400 rounded" /><span className="text-xs text-zinc-500">EMA 20</span></div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-0.5 bg-orange-400 rounded" /><span className="text-xs text-zinc-500">EMA 50</span></div>
          </div>

          {/* Price chart */}
          <div className="relative" style={{ height: 220, overflow: 'hidden' }}>
            {isChartLoading && <ChartSpinner />}
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
                <defs>
                  <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="90%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} interval={4} />
                <YAxis domain={yDomain} tick={axisStyle} tickLine={false} axisLine={false} tickFormatter={priceTick} width={48} />
                <Tooltip content={<PriceTooltip />} />
                <Area type="monotone" dataKey="price" stroke="#6366f1" strokeWidth={2} fill="url(#priceGrad)" dot={false} activeDot={{ r: 3, fill: '#6366f1' }} isAnimationActive={false} />
                <Line type="monotone" dataKey="ema20" stroke="#60a5fa" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="ema50" stroke="#f97316" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* RSI label */}
          <div className="flex items-center gap-2 pt-2 pb-1">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">RSI (14)</span>
            <div className="flex-1 h-px bg-zinc-800" />
            {lastRSI != null && (
              <span className={`text-xs font-semibold ${lastRSI >= 70 ? 'text-red-400' : lastRSI <= 30 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                {lastRSI.toFixed(1)} {lastRSI >= 70 ? '· Overbought' : lastRSI <= 30 ? '· Oversold' : '· Neutral'}
              </span>
            )}
          </div>

          {/* RSI chart */}
          <div className="relative" style={{ height: 100, overflow: 'hidden' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 2, right: 8, bottom: 0, left: 8 }}>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey="date" hide />
                <YAxis domain={[0, 100]} ticks={[0, 30, 50, 70, 100]} tick={axisStyle} tickLine={false} axisLine={false} width={48} />
                <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.5} />
                <ReferenceLine y={30} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.5} />
                <ReferenceLine y={50} stroke="#52525b" strokeDasharray="2 4" strokeOpacity={0.4} />
                <Tooltip content={<RSITooltip />} />
                <Line type="monotone" dataKey="rsi" stroke="#a78bfa" strokeWidth={2} dot={false} activeDot={{ r: 3, fill: '#a78bfa' }} isAnimationActive={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Volume label */}
          <div className="flex items-center gap-2 pt-2 pb-1">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">Volume</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          {/* Volume chart */}
          <div className="relative" style={{ height: 80, overflow: 'hidden' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series} margin={{ top: 0, right: 8, bottom: 0, left: 8 }} barSize={6}>
                <XAxis dataKey="date" hide />
                <YAxis tickFormatter={fmtVol} tick={axisStyle} tickLine={false} axisLine={false} width={48} />
                <Tooltip content={<VolumeTooltip />} />
                <Bar dataKey="volume" isAnimationActive={false}>
                  {series.map((entry, i) => (
                    <Cell key={i} fill={entry.volUp ? '#10b981' : '#ef4444'} fillOpacity={0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stats card */}
        <div className="w-60 flex-shrink-0 px-5 py-4">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Key Metrics</p>
          <div className="space-y-0">
            <StatRow label="Market Cap"   value={fmtLarge(coin?.marketCap)} />
            <StatRow label="24h Volume"   value={fmtLarge(coin?.volume24h)} />
            <StatRow label="Circ. Supply" value={fmtSupply(coin?.supply, selectedCoin)} />
            <StatRow label="All-Time High" value={fmtPrice(coin?.ath)} />
            <StatRow label="ATH Date"     value={coin?.athDate} />
          </div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mt-4 mb-3">Performance</p>
          <div className="space-y-0">
            <PerfRow label="7 Days"  value={coin?.perf7d} />
            <PerfRow label="30 Days" value={coin?.perf30d} />
            <PerfRow label="90 Days" value={chartResult?.perf90d} />
          </div>
          <div className="mt-4 p-3 bg-zinc-800/60 rounded-lg">
            <p className="text-xs text-zinc-500 mb-1">From ATH</p>
            <p className={`text-sm font-bold ${pctColor(athPct)}`}>{fmtPct(athPct)}</p>
            <p className="text-xs text-zinc-600 mt-0.5">ATH was {fmtPrice(coin?.ath)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRADE OPPORTUNITIES TABLE
// ═══════════════════════════════════════════════════════════════════════════════

function TradeOpportunitiesTable({ activeFilter, onSelectCoin, opportunities }) {
  const [sortConfig, setSortConfig] = useState({ key: 'confidence', dir: 'desc' });

  const handleSort = (key) => {
    setSortConfig(prev =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }
    );
  };

  const rows = React.useMemo(() => {
    const src = opportunities ?? [];
    const filtered = activeFilter === 'All'
      ? src
      : src.filter(o => o.category === activeFilter);
    return [...filtered].sort((a, b) => {
      const order = sortConfig.dir === 'asc' ? 1 : -1;
      return a[sortConfig.key] > b[sortConfig.key] ? order : -order;
    });
  }, [activeFilter, sortConfig]);

  const tfBg = { '1D': 'bg-blue-500/15 text-blue-400', '4H': 'bg-violet-500/15 text-violet-400', '1W': 'bg-teal-500/15 text-teal-400' };

  const TH = ({ children, sortKey, className = '' }) => (
    <th
      className={`px-4 py-2.5 text-left text-xs font-semibold text-zinc-500 uppercase tracking-widest whitespace-nowrap ${sortKey ? 'cursor-pointer select-none hover:text-zinc-300' : ''} ${className}`}
      onClick={sortKey ? () => handleSort(sortKey) : undefined}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortKey && <SortIcon column={sortKey} config={sortConfig} />}
      </div>
    </th>
  );

  return (
    <div className="mx-5 mb-5 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target size={14} className="text-zinc-400" />
          <span className="text-sm font-semibold text-zinc-200">Trade Opportunities</span>
          <span className="text-xs px-2 py-0.5 bg-zinc-800 rounded-full text-zinc-400">{rows.length} setups</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-xs text-zinc-500">{rows.filter(r => r.signal === 'BUY').length} active BUY signals</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-zinc-950/40 border-b border-zinc-800">
            <tr>
              <TH>Asset</TH>
              <TH>Signal</TH>
              <TH>Timeframe</TH>
              <TH className="max-w-xs">Trigger</TH>
              <TH sortKey="confidence">Confidence</TH>
              <TH>Entry Zone</TH>
              <TH>Target</TH>
              <TH>Stop Loss</TH>
              <TH sortKey="rr">R/R Ratio</TH>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-sm text-zinc-600">No setups for this category.</td></tr>
            ) : rows.map(row => (
              <tr key={row.id} className="hover:bg-zinc-800/40 transition-colors cursor-pointer" onClick={() => onSelectCoin(row.asset)}>
                <td className="px-4 py-3">
                  <span className="text-sm font-semibold text-zinc-100">{row.asset}</span>
                  <span className="ml-2 text-xs text-zinc-600">{row.category}</span>
                </td>
                <td className="px-4 py-3"><SignalBadge signal={row.signal} /></td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${tfBg[row.timeframe] ?? 'bg-zinc-700 text-zinc-400'}`}>{row.timeframe}</span>
                </td>
                <td className="px-4 py-3 max-w-xs"><span className="text-xs text-zinc-400 leading-relaxed">{row.trigger}</span></td>
                <td className="px-4 py-3"><ConfidenceBar value={row.confidence} /></td>
                <td className="px-4 py-3"><span className="text-xs text-zinc-300 tabular-nums font-mono">{row.entryZone}</span></td>
                <td className="px-4 py-3"><span className="text-xs font-semibold text-emerald-400 tabular-nums font-mono">{row.target}</span></td>
                <td className="px-4 py-3"><span className="text-xs font-semibold text-red-400 tabular-nums font-mono">{row.stopLoss}</span></td>
                <td className="px-4 py-3">
                  <span className={`text-sm font-bold tabular-nums ${row.rr >= 2.5 ? 'text-emerald-400' : row.rr >= 2 ? 'text-zinc-200' : 'text-amber-400'}`}>
                    {row.rr.toFixed(1)}x
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════════════════

export default function KryptoScan() {
  const [selectedCoin, setSelectedCoin] = useState('BTC');
  const [activeFilter, setActiveFilter] = useState('All');

  const {
    watchlist, globalStats, fearGreed,
    chartData, chartLoading, fetchChart,
    opportunities,
    loading, error, dismissError,
  } = useMarketData();

  // Lazy-fetch chart data whenever the selected coin changes
  useEffect(() => {
    fetchChart(selectedCoin);
  }, [selectedCoin, fetchChart]);

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="bg-zinc-950 min-h-screen flex flex-col" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {error && <ErrorBanner message={error} onDismiss={dismissError} />}
      <TopBar activeFilter={activeFilter} onFilter={setActiveFilter} />

      <div className="flex flex-1 overflow-hidden">
        <WatchlistSidebar selected={selectedCoin} onSelect={setSelectedCoin} coins={watchlist} />

        <div className="flex-1 overflow-y-auto">
          <MarketOverviewStrip
            stats={globalStats}
            fearGreed={fearGreed}
            buySignalCount={opportunities.filter(o => o.signal === 'BUY').length}
          />
          <AssetDeepDive
            selectedCoin={selectedCoin}
            coin={watchlist[selectedCoin]}
            chartResult={chartData[selectedCoin]}
            isChartLoading={!!chartLoading[selectedCoin]}
          />
          <TradeOpportunitiesTable
            activeFilter={activeFilter}
            onSelectCoin={setSelectedCoin}
            opportunities={opportunities}
          />
        </div>
      </div>
    </div>
  );
}
