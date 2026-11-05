// Bring in a list of past customers and what they paid: pasted from Excel (one line per bill: date, name, address, city, phone, amount).
// Each person becomes one client (with a service site) and each line a "previous bill" on that client, so a repeat quotation can start from it.
import type { Client, ClientType, DB, PastBill } from './types';
import { round2, uid } from './util';

export interface ImportLine { row: number; date: string; name: string; address: string; city: string; phone: string; amount: number }
export interface ImportBad { row: number; text: string; why: string }
export interface ImportClient { key: string; name: string; address: string; city: string; phone: string; type: ClientType; existing?: Client; bills: ImportLine[]; skipped: number; warnings: string[] }
export interface ImportPlan { clients: ImportClient[]; bad: ImportBad[]; newClients: number; newBills: number }

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** "24 Sept 2024", "24 September 2024" or "2024-09-24" → "2024-09-24". */
export function parseDate(s: string): string | null {
  const t = s.trim(); const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  const ok = (y: number, m: number, d: number) => (y >= 1990 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate() ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null);
  if (iso) return ok(+iso[1], +iso[2], +iso[3]);
  const m = /^(\d{1,2})\s+([A-Za-z]+)\.?,?\s+(\d{4})$/.exec(t); if (!m) return null;
  const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()); return mi < 0 ? null : ok(+m[3], mi + 1, +m[1]);
}
export const parseAmount = (s: string): number => { const n = Number(s.replace(/[₱,\s]|PHP/gi, '')); return Number.isFinite(n) ? round2(n) : NaN; };
/** Philippine mobile numbers as people write them: 9175608409 → 09175608409. Anything that does not fit is kept as typed and flagged. */
export function parsePhone(s: string): { phone: string; warn?: string } {
  const d = s.replace(/\D/g, ''); if (!d) return { phone: '' };
  if (d.length === 10 && d.startsWith('9')) return { phone: `0${d}` };
  if (d.length === 11 && d.startsWith('09')) return { phone: d };
  if (d.length === 12 && d.startsWith('639')) return { phone: `0${d.slice(2)}` };
  return { phone: s.trim(), warn: `The number ${s.trim()} does not look like a Philippine mobile (10 digits starting with 9): check it` };
}
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const BUSINESS = /\b(project|corp|corporation|inc\.?|enterprises?|trading|company|co\.|hotel|resort|school|church|bldg|building)\b/i;

/** Reads pasted lines (tab-separated, as copied from Excel). */
export function parseLines(text: string): { lines: ImportLine[]; bad: ImportBad[] } {
  const lines: ImportLine[] = []; const bad: ImportBad[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return;
    const f = raw.split('\t').map((x) => x.trim());
    if (f.length < 6) return void bad.push({ row: i + 1, text: raw.slice(0, 80), why: 'Expected 6 columns separated by tabs: date, name, address, city, phone, amount. Copy the rows straight from Excel.' });
    const [d, name, address, city, phone, amt] = [f[0], f[1], f[2], f[3], f[4], f[f.length - 1]];
    const date = parseDate(d); const amount = parseAmount(amt);
    if (!date) return void bad.push({ row: i + 1, text: raw.slice(0, 80), why: `Cannot read the date "${d}". Use a form like 24 Sept 2024.` });
    if (!name) return void bad.push({ row: i + 1, text: raw.slice(0, 80), why: 'The name is empty.' });
    if (!(amount > 0)) return void bad.push({ row: i + 1, text: raw.slice(0, 80), why: `Cannot read the amount "${amt}".` });
    lines.push({ row: i + 1, date, name: name.replace(/\s+/g, ' '), address: address.replace(/\s+/g, ' '), city: city.replace(/\s+/g, ' '), phone, amount });
  });
  return { lines, bad };
}

/** Groups the lines by person, matches them to clients that already exist (same name or same mobile) and drops bills that are already on the client. */
export function planImport(db: Pick<DB, 'clients'>, text: string): ImportPlan {
  const { lines, bad } = parseLines(text);
  const live = db.clients.filter((c) => !c.deleted_at);
  const groups = new Map<string, ImportClient>();
  for (const l of lines) {
    const key = norm(l.name); const ph = parsePhone(l.phone);
    let g = groups.get(key);
    if (!g) {
      const ex = live.find((c) => norm(c.name) === key || (ph.phone && c.mobile.replace(/\D/g, '').slice(-10) === ph.phone.replace(/\D/g, '').slice(-10)));
      g = { key, name: l.name, address: l.address, city: l.city, phone: ph.phone, type: BUSINESS.test(l.name) ? 'Commercial' : 'Residential', existing: ex, bills: [], skipped: 0, warnings: [] };
      groups.set(key, g);
    }
    if (ph.warn && !g.warnings.includes(ph.warn)) g.warnings.push(ph.warn);
    if (!g.phone && ph.phone) g.phone = ph.phone;
    const dup = (g.existing?.past_bills ?? []).some((b) => b.date === l.date && Math.abs(b.total - l.amount) < 0.005) || g.bills.some((b) => b.date === l.date && Math.abs(b.amount - l.amount) < 0.005);
    if (dup) g.skipped += 1; else g.bills.push(l);
  }
  const clients = [...groups.values()];
  return { clients, bad, newClients: clients.filter((c) => !c.existing).length, newBills: clients.reduce((n, c) => n + c.bills.length, 0) };
}

/** Where the service is done: the address, with the city added when the address does not name it (it helps the map find the place). */
export const siteAddress = (c: Pick<ImportClient, 'address' | 'city'>) => (c.city && !norm(c.address).includes(norm(c.city)) ? `${c.address}, ${c.city}` : c.address);
export const pastBillOf = (l: ImportLine): PastBill => ({ id: uid(), date: l.date, ref: '', total: l.amount, items: [], notes: 'Imported from the previous customer list' });
