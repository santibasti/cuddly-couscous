export const TZ = 'Asia/Manila';

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

/** Current Manila wall-clock as 'YYYY-MM-DDTHH:mm'. */
export function nowLocal(d: Date = new Date()): string {
  const p: Record<string, string> = {};
  for (const x of partsFmt.formatToParts(d)) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export const today = (): string => nowLocal().slice(0, 10);
export const isoNow = (): string => new Date().toISOString();

/* Date arithmetic on 'YYYY-MM-DD' strings, done in UTC to avoid DST/zone drift. */
const toUTC = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
export function addDays(s: string, n: number): string {
  return new Date(toUTC(s) + n * 86400000).toISOString().slice(0, 10);
}
export const diffDays = (a: string, b: string): number => Math.round((toUTC(a) - toUTC(b)) / 86400000);
export const dow = (s: string): number => new Date(toUTC(s)).getUTCDay();
export const monthStart = (s: string) => s.slice(0, 8) + '01';
export function monthEnd(s: string) {
  const y = +s.slice(0, 4), m = +s.slice(5, 7);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
export const weekStart = (s: string) => addDays(s, -((dow(s) + 6) % 7)); // Monday
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
export function minutesBetween(a: string, b: string): number {
  const f = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16));
  return Math.round((f(b) - f(a)) / 60000);
}

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 });
const pesoWhole = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 });
export const money = (n: number): string => peso.format(round2(n || 0)).replace('PHP', '₱').replace(/\s/g, '');
export const moneyShort = (n: number): string => {
  const a = Math.abs(n);
  if (a >= 1e6) return `₱${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `₱${(n / 1e3).toFixed(1)}K`;
  return pesoWhole.format(n || 0).replace('PHP', '₱').replace(/\s/g, '');
};
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
export const num = (n: number, d = 0): string => n.toLocaleString('en-PH', { maximumFractionDigits: d, minimumFractionDigits: d });
export const pct = (n: number, d = 1): string => `${(n || 0).toFixed(d)}%`;

const dFmt = new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
export const fmtDate = (s?: string | null): string => (s ? dFmt.format(new Date(toUTC(s.slice(0, 10)))) : '—');
export function fmtTime(s?: string | null): string {
  if (!s || s.length < 16) return '—';
  const h = +s.slice(11, 13), m = s.slice(14, 16);
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}
export const fmtDateTime = (s?: string | null): string => (s ? `${fmtDate(s)} ${fmtTime(s)}` : '—');
/** Format a UTC ISO stamp in Manila time. */
export function fmtStamp(iso?: string | null): string {
  if (!iso) return '—';
  const l = nowLocal(new Date(iso));
  return fmtDateTime(l);
}

export function uid(): string {
  return (crypto as Crypto).randomUUID();
}

export const sum = <T,>(a: T[], f: (x: T) => number): number => a.reduce((s, x) => s + f(x), 0);
export const groupBy = <T,>(a: T[], f: (x: T) => string): Record<string, T[]> => {
  const o: Record<string, T[]> = {};
  for (const x of a) (o[f(x)] ||= []).push(x);
  return o;
};
export const inRange = (d: string, from?: string, to?: string) =>
  (!from || d.slice(0, 10) >= from) && (!to || d.slice(0, 10) <= to);

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const cls = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');
