const f = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
export const peso = (n: number) => f.format(Math.round(n)).replace('PHP', '₱').replace(/\s/g, '');
export const pesoCompact = (n: number) => {
  const a = Math.abs(n);
  const s = a >= 1e6 ? `${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M` : a >= 1e4 ? `${Math.round(a / 1e3)}k` : a >= 1e3 ? `${(a / 1e3).toFixed(1)}k` : `${Math.round(a)}`;
  return `${n < 0 ? '-' : ''}₱${s}`;
};
export const pct = (n: number, d = 0) => `${(n * 100).toFixed(d)}%`;
