import {
  ResponsiveContainer, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { X } from 'lucide-react';
import { fmtPrice } from './format';
import { findZones } from './supportResistance';

function PriceTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs shadow-xl">
      <p className="text-zinc-400 mb-1">{label}</p>
      <p className="text-zinc-100 font-semibold">{fmtPrice(payload[0].value)}</p>
    </div>
  );
}

function Legend() {
  const items = [
    { color: '#818cf8', label: 'Price' },
    { color: '#f59e0b', label: 'Support' },
    { color: '#10b981', label: 'Target (TP)' },
    { color: '#ef4444', label: 'Stop (SL)' },
  ];
  return (
    <div className="flex items-center gap-4">
      {items.map(it => (
        <div key={it.label} className="flex items-center gap-1.5">
          <div className="w-3 h-0.5" style={{ backgroundColor: it.color }} />
          <span className="text-xs text-zinc-500">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

export default function SupportChart({ row, series, loading, onClose }) {
  return (
    <div className="mx-5 mb-4 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-zinc-100">{row.ticker}</span>
          <span className="text-xs text-zinc-500">{row.name}</span>
          <span className="text-sm font-semibold text-zinc-200 tabular-nums">{fmtPrice(row.price)}</span>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
          <X size={16} />
        </button>
      </div>

      {loading || !series ? (
        <p className="px-5 py-10 text-xs text-zinc-600 text-center">Loading chart…</p>
      ) : (
        <div className="px-5 py-4">
          <div className="mb-2"><Legend /></div>
          <ChartBody row={row} series={series} />
        </div>
      )}
    </div>
  );
}

function ChartBody({ row, series }) {
  const zones = findZones(series, series.length - 1);

  const prices = series.map(b => b.price);
  const yMin = Math.min(...prices, row.stopPrice) * 0.97;
  const yMax = Math.max(...prices, row.targetPrice) * 1.03;

  return (
    <div style={{ height: 340 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={series} margin={{ top: 4, right: 44, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#27272a" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tick={{ fill: '#71717a', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval={Math.max(0, Math.floor(series.length / 8))}
          />
          <YAxis
            domain={[yMin, yMax]}
            tick={{ fill: '#71717a', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => fmtPrice(v)}
            width={60}
          />
          <Tooltip content={<PriceTooltip />} />

          {zones.support.map((z, i) => (
            <ReferenceLine
              key={`s${i}`}
              y={z.level}
              stroke="#f59e0b"
              strokeDasharray="4 4"
              strokeOpacity={Math.abs(z.level - row.supportLevel) < 1e-9 ? 1 : 0.4}
              strokeWidth={Math.abs(z.level - row.supportLevel) < 1e-9 ? 2 : 1}
              label={{ value: `S ${z.touches.length}x`, position: 'right', fill: '#f59e0b', fontSize: 10 }}
            />
          ))}

          <ReferenceLine
            y={row.targetPrice}
            stroke="#10b981"
            strokeWidth={2}
            label={{ value: `TP ${fmtPrice(row.targetPrice)}`, position: 'right', fill: '#10b981', fontSize: 10 }}
          />
          <ReferenceLine
            y={row.stopPrice}
            stroke="#ef4444"
            strokeWidth={2}
            label={{ value: `SL ${fmtPrice(row.stopPrice)}`, position: 'right', fill: '#ef4444', fontSize: 10 }}
          />

          <Line type="monotone" dataKey="price" stroke="#818cf8" strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
