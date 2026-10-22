const DAY = 86400000;

const toUtc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const todayIso = () => {
  const n = new Date();
  return fromUtc(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
};

export const addDays = (iso: string, n: number) => fromUtc(toUtc(iso) + n * DAY);

export const diffDays = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / DAY);

/** Monday of the week containing `iso`. */
export const startOfWeek = (iso: string) => {
  const dow = new Date(toUtc(iso)).getUTCDay(); // 0 = Sun
  return addDays(iso, -((dow + 6) % 7));
};

export const isWeekend = (iso: string) => {
  const dow = new Date(toUtc(iso)).getUTCDay();
  return dow === 0 || dow === 6;
};

export const fmtDate = (iso: string) =>
  new Date(toUtc(iso)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export const fmtDay = (iso: string) =>
  new Date(toUtc(iso)).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });

export const fmtMonth = (iso: string) =>
  new Date(toUtc(iso)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
