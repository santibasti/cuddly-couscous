// All booking dates are plain 'YYYY-MM-DD' strings (Asia/Manila calendar days). Math is done in UTC to avoid DST/TZ drift.
export const DEFAULT_TZ = 'Asia/Manila';

const toUtc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (iso: string, n: number) => fromUtc(toUtc(iso) + n * 86400000);
export const diffDays = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / 86400000);
export const nightsBetween = (checkIn: string, checkOut: string) => Math.max(0, diffDays(checkIn, checkOut));

export function todayISO(tz = DEFAULT_TZ, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export const nowISO = () => new Date().toISOString();

/** Half-open interval overlap: [aStart,aEnd) vs [bStart,bEnd). */
export const rangesOverlap = (aStart: string, aEnd: string, bStart: string, bEnd: string) => aStart < bEnd && bStart < aEnd;

export function eachDay(start: string, endExclusive: string): string[] {
  const out: string[] = [];
  for (let d = start; d < endExclusive; d = addDays(d, 1)) out.push(d);
  return out;
}

export const startOfWeek = (iso: string) => {
  const dow = new Date(toUtc(iso)).getUTCDay(); // 0 Sun
  return addDays(iso, -((dow + 6) % 7)); // Monday
};
export const startOfMonth = (iso: string) => iso.slice(0, 8) + '01';
export const endOfMonth = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return fromUtc(Date.UTC(y, m, 0));
};
export const addMonths = (iso: string, n: number) => {
  const [y, m] = iso.split('-').map(Number);
  return fromUtc(Date.UTC(y, m - 1 + n, 1));
};
export const dayOfWeek = (iso: string) => new Date(toUtc(iso)).getUTCDay();

const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-PH', { timeZone: 'UTC', ...opts }).format(new Date(toUtc(iso)));

export const fmtDate = (iso: string) => fmt(iso, { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtShort = (iso: string) => fmt(iso, { day: 'numeric', month: 'short' });
export const fmtWeekday = (iso: string) => fmt(iso, { weekday: 'short' });
export const fmtLong = (iso: string) => fmt(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const fmtMonth = (iso: string) => fmt(iso, { month: 'long', year: 'numeric' });
export const fmtRange = (a: string, b: string) => `${fmtShort(a)} – ${fmtDate(b)}`;
export function fmtDateTime(isoTs: string) {
  return new Intl.DateTimeFormat('en-PH', { timeZone: DEFAULT_TZ, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(isoTs));
}
export const tsToDay = (isoTs: string, tz = DEFAULT_TZ) => todayISO(tz, new Date(isoTs));
