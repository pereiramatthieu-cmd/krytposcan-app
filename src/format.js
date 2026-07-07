export function fmtPrice(p) {
  if (!p && p !== 0) return '—';
  if (p >= 10000) return `$${(p / 1000).toFixed(1)}k`;
  if (p >= 1000)  return `$${p.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (p >= 1)     return `$${p.toFixed(2)}`;
  return `$${p.toFixed(4)}`;
}

export function fmtLarge(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toFixed(0)}`;
}

export function fmtSupply(n, ticker) {
  if (!n) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B ${ticker}`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M ${ticker}`;
  return `${n.toLocaleString()} ${ticker}`;
}

export function fmtPct(v, withSign = true) {
  if (v == null) return '—';
  const s = withSign && v > 0 ? '+' : '';
  return `${s}${v.toFixed(2)}%`;
}

export function pctColor(v) {
  if (v == null) return 'text-zinc-600';
  return v >= 0 ? 'text-emerald-400' : 'text-red-400';
}

// Volume axis labels (no $ prefix)
export function fmtVol(v) {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)}M`;
  return v.toFixed(0);
}
