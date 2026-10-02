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

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pesoWhole = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
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
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16); if (c?.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const sum = <T,>(a: T[], f: (x: T) => number): number => a.reduce((s, x) => s + f(x), 0);
export const groupBy = <T,>(a: T[], f: (x: T) => string): Record<string, T[]> => {
  const o: Record<string, T[]> = {};
  for (const x of a) (o[f(x)] ||= []).push(x);
  return o;
};
export const inRange = (d: string, from?: string, to?: string) =>
  (!from || d.slice(0, 10) >= from) && (!to || d.slice(0, 10) <= to);

/** Plain-JS SHA-256, used when the browser has no Web Crypto (phones opening the app over http:// on the local network). */
function sha256Js(msg: string): string {
  const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const bytes = Array.from(new TextEncoder().encode(msg));
  const bitLen = bytes.length * 8;
  bytes.push(0x80); while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i > 3 ? 0 : (bitLen >>> (i * 8)) & 0xff);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < bytes.length; o += 64) {
    const w = new Array<number>(64);
    for (let i = 0; i < 16; i++) w[i] = (bytes[o + i * 4] << 24) | (bytes[o + i * 4 + 1] << 16) | (bytes[o + i * 4 + 2] << 8) | bytes[o + i * 4 + 3];
    for (let i = 16; i < 64; i++) { const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3); const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
export async function sha256(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return sha256Js(text);
}

export const cls = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');
