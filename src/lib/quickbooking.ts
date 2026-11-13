// Quick booking: paste the booking details from Facebook Messenger and get the client, an approved quotation and a booked job order in one go.
// Residential glass packages follow the rate-by-location list; the team and vehicle are arranged afterwards on the job order.
import { store } from './store';
import { addDays, today } from './util';
import { geoPatch } from './geo-ph';
import { priceService, docTotals } from './business';
import { saveQuotation, saveJob, setQuoteStatus } from './actions';
import { defaultCrew, defaultDisclaimer, defaultIntro, defaultMethodology, syncMethodSections } from './quote-text';
import type { Client, DB, Job, Quotation, ServiceCode } from './types';

export interface Rate { place: string; group: string; price: number; panels: number }
const P = (price: number, panels: number) => ({ price, panels });
const A = P(4799, 31), B = P(5799, 41), C = P(12799, 51);
const mk = (group: string, entries: [string, { price: number; panels: number }][]): Rate[] => entries.map(([place, r]) => ({ place, group, ...r }));
/** Package rate by location (extra panels beyond the package are ₱140 each everywhere). */
export const RATES: Rate[] = [
  ...mk('Metro Manila', [['Caloocan', A], ['Las Piñas', B], ['Makati', A], ['Malabon', A], ['Mandaluyong', A], ['Manila', A], ['Marikina', A], ['Muntinlupa', B], ['Navotas', A], ['Parañaque', B], ['Pasay', A], ['Pasig', A], ['Pateros', A], ['Quezon City', A], ['San Juan', A], ['Taguig', A], ['Valenzuela', A]]),
  ...mk('Cavite', [['Alfonso', C], ['Amadeo', C], ['Bacoor', B], ['Carmona', C], ['Cavite City', B], ['Dasmariñas', B], ['General Trias', P(6799, 41)], ['Imus', B], ['Silang', C], ['Tagaytay', C]]),
  ...mk('Bulacan', [['Bocaue', B], ['Marilao', B], ['San Jose del Monte', B], ['Santa Maria', B]]),
  ...mk('Rizal', [['Antipolo', B], ['Cainta', B], ['Rodriguez (Montalban)', B]]),
  ...mk('Province-level rate', [['Laguna', C], ['Batangas', C]]),
];
export const EXTRA_PANEL = 140;
/** Other services: rate, unit and minimum quantity (billed at the minimum until measured). */
export const OTHER: { match: RegExp; code: ServiceCode; name: string; rate: number; unit: string; min: number }[] = [
  { match: /roof/i, code: 'ROOF', name: 'Roof Cleaning', rate: 145, unit: 'sqm', min: 100 },
  { match: /solar/i, code: 'SOLAR', name: 'Solar Panel Cleaning', rate: 245, unit: 'panel', min: 20 },
  { match: /floor|driveway|hardscape/i, code: 'FLOOR', name: 'Floor / Driveway Cleaning', rate: 125, unit: 'sqm', min: 50 },
  { match: /wall/i, code: 'WALL', name: 'Exterior Wall Cleaning', rate: 125, unit: 'sqm', min: 50 },
];

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ñ/g, 'n');
const ALIASES: Record<string, string[]> = { 'Rodriguez (Montalban)': ['rodriguez', 'montalban'], 'Quezon City': ['quezon city', 'qc'], 'Cavite City': ['cavite city'], 'Parañaque': ['paranaque'], 'Las Piñas': ['las pinas'], 'Dasmariñas': ['dasmarinas', 'dasma'], 'San Jose del Monte': ['san jose del monte', 'sjdm'] };
/** Finds the city (or province) in an address; the longest name wins and "Metro Manila" is never mistaken for the city of Manila. */
export function findRate(address: string): Rate | undefined {
  const t = ' ' + norm(address).replace(/metro manila|ncr|national capital region/g, ' ').replace(/[^a-z0-9]+/g, ' ') + ' ';
  const names = RATES.flatMap((r) => (ALIASES[r.place] ?? [norm(r.place)]).map((n) => ({ r, n: norm(n) }))).sort((a, b) => b.n.length - a.n.length);
  for (const { r, n } of names) if (t.includes(' ' + n + ' ') || (r.group !== 'Province-level rate' && t.includes(' ' + n + ' city '))) return r;
  return undefined;
}

export interface Booking { name: string; address: string; mobile: string; email: string; storeys: string; date: string; time: string; service: string; home: string }
const LABELS: [keyof Booking, RegExp][] = [
  ['name', /full\s*name|name/], ['address', /address|location/], ['mobile', /contact\s*(number|no\.?)?|mobile|phone|cell(phone)?/], ['email', /e-?mail/],
  ['storeys', /(no\.?|number)\s*of\s*(house\s*)?(storey|story|floor)s?|storeys?|stories|floors?/], ['date', /reservation\s*date|date|schedule/], ['service', /service\s*type|service/], ['home', /home\s*or\s*residential|property\s*type|type/],
];
export const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** "November 20, 2026 8AM", "20 Nov", "11/20/2026 9:30 am" → YYYY-MM-DD and HH:mm (the year defaults to this or next year; 8:00 if no time). */
export function parseWhen(text: string, now: string = today()): { date: string; time: string } | null {
  const s = text.toLowerCase(); let y = 0, m = 0, d = 0;
  const num = s.match(/\b(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\b/);
  const mon = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?!\d)(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?/) ?? undefined;
  const mon2 = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s*,?\s*(\d{4}))?/);
  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
  else if (mon) { m = MONTHS.indexOf(mon[1]) + 1; d = +mon[2]; y = mon[3] ? +mon[3] : 0; }
  else if (mon2) { m = MONTHS.indexOf(mon2[2]) + 1; d = +mon2[1]; y = mon2[3] ? +mon2[3] : 0; }
  else if (num) { m = +num[1]; d = +num[2]; y = num[3] ? (+num[3] < 100 ? 2000 + +num[3] : +num[3]) : 0; if (m > 12 && d <= 12) [m, d] = [d, m]; }
  if (!m || !d || m > 12 || d > 31) return null;
  if (!y) { y = +now.slice(0, 4); if (`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` < now) y += 1; }
  const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const rest = s.replace(iso?.[0] ?? '', '').replace(mon?.[0] ?? '', '').replace(mon2?.[0] ?? '', '').replace(num?.[0] ?? '', '');
  const t = rest.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|nn)\b/) ?? rest.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  let time = '08:00';
  if (t) { let h = +t[1]; const mi = t[2] ?? '00'; const ap = t[3]; if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; time = `${String(h).padStart(2, '0')}:${mi}`; }
  return { date, time };
}
/** Reads the pasted Messenger message ("Name: …", "Address: …" …), one field per label wherever the line breaks fall. */
export function parseBooking(text: string): Booking {
  const out: Booking = { name: '', address: '', mobile: '', email: '', storeys: '', date: '', time: '', service: '', home: '' };
  const lines = text.replace(/\r/g, '').split('\n'); let cur: keyof Booking | null = null;
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z][A-Za-z .\/()'-]{1,40}?)\s*[:：]\s*(.*)$/);
    const hit = m && LABELS.find(([, re]) => new RegExp(`^(${re.source})$`, 'i').test(m[1].trim()));
    if (hit && m) { cur = hit[0]; out[cur] = m[2].trim(); }
    else if (cur && line.trim()) out[cur] = `${out[cur]} ${line.trim()}`.trim();
  }
  const w = parseWhen(out.date); if (w) { out.date = w.date; out.time = w.time; }
  out.mobile = out.mobile.replace(/[^\d+\-() ]/g, '').trim(); out.email = (out.email.match(/\S+@\S+\.\S+/) ?? [''])[0];
  return out;
}

export interface QuotePlan { rate?: Rate; other?: (typeof OTHER)[number]; items: ReturnType<typeof priceService>['lines']; note: string }
/** The price for the pasted booking: the glass package of the city, or the minimum of another service. */
export function planQuote(db: Pick<DB, 'services'>, b: Pick<Booking, 'address' | 'service'>, rate: Rate | undefined = findRate(b.address)): QuotePlan {
  const other = /glass|window|panel|^\s*$/i.test(b.service) ? undefined : OTHER.find((o) => o.match.test(b.service));
  if (other) {
    const def = db.services.find((s) => s.code === other.code); const base = def ?? { code: other.code, name: other.name, unit: other.unit, rate: other.rate, minimum_qty: other.min, custom_quote: false } as never;
    const r = priceService({ ...(base as object), name: other.name, unit: other.unit, rate: other.rate, minimum_qty: other.min, custom_quote: false, package_price: undefined, package_qty: undefined } as never, other.min);
    return { other, items: r.lines, note: `${other.name}: ${other.rate}/${other.unit}, minimum ${other.min} ${other.unit}. The final amount follows the area measured on site.` };
  }
  if (!rate) return { items: [], note: 'City not found in the rate list.' };
  const def = db.services.find((s) => s.code === 'GLASS_EXT');
  const r = priceService((def ?? { code: 'GLASS_EXT', name: 'Exterior Glass / Window Cleaning', unit: 'panel', rate: EXTRA_PANEL, minimum_qty: 1, custom_quote: false }) as never, rate.panels, { price: rate.price, qty: rate.panels, excess_rate: EXTRA_PANEL });
  return { rate, items: r.lines, note: `${rate.place}: ₱${rate.price.toLocaleString('en-PH')} for up to ${rate.panels} panels, ₱${EXTRA_PANEL} per extra panel.` };
}

export interface QuickResult { client: Client; newClient: boolean; quote: Quotation; job: Job }
const digits = (s: string) => s.replace(/\D/g, '').replace(/^63/, '0');
/** Creates (or reuses) the client and site, an approved quotation and a booked job with no team yet. */
export function quickBook(b: Booking, rate?: Rate): QuickResult {
  const db = () => store.getDB();
  for (const p of ['clients.edit', 'sales.edit', 'sales.approve', 'jobs.edit']) store.require(p as never);
  if (!b.name.trim()) throw new Error('The name is missing.');
  if (!b.address.trim()) throw new Error('The address is missing.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date)) throw new Error('The reservation date was not understood. Type it like 2026-11-20.');
  const plan = planQuote(db(), b, rate ?? findRate(b.address));
  if (!plan.items.length) throw new Error('The city was not found in the rate list. Pick the city from the list.');
  const d = db();
  const mobileKey = digits(b.mobile);
  const existing = d.clients.find((c) => !c.deleted_at && ((mobileKey.length >= 7 && digits(c.mobile) === mobileKey) || c.name.trim().toLowerCase() === b.name.trim().toLowerCase()));
  const client = existing ?? store.insert('clients', { name: b.name.trim(), contact_person: b.name.trim(), mobile: b.mobile.trim(), email: b.email, address: b.address.trim(), billing_address: '', type: 'Residential', status: 'Active', notes: 'Booked through Quick booking (Messenger)', access_instructions: '', tin: '', vat_status: 'Non-VAT', withholding_rate: 0, withholding_notes: '', branch_id: d.branches[0].id, ...geoPatch(b.address.trim()) } as never, `Client ${b.name.trim()} created by Quick booking`) as Client;
  const addr = b.address.trim().toLowerCase();
  const site = d.sites.find((s) => !s.deleted_at && s.client_id === client.id && s.address.trim().toLowerCase() === addr)
    ?? store.insert('sites', { client_id: client.id, name: 'Home', address: b.address.trim(), contact_person: client.contact_person, contact_mobile: b.mobile.trim() || client.mobile, access_instructions: '', ...geoPatch(b.address.trim()) } as never) as { id: string };
  const code: ServiceCode = plan.other?.code ?? 'GLASS_EXT';
  const scope = `${plan.other?.name ?? 'Exterior glass / window cleaning'} at ${b.address.trim()}.${b.storeys ? ` ${b.storeys} storey house.` : ''}${b.service && !plan.other ? ` (${b.service})` : ''}`;
  const set = d.settings;
  const quote = saveQuotation({
    client_id: client.id, site_id: site.id, issue_date: today(), valid_until: addDays(today(), set.quote_validity_days ?? 30), scope, items: plan.items,
    vat_mode: 'none', vat_rate: set.vat_rate, discount: 0, terms: set.default_terms, payment_option: 'completion', ocular_done: false,
    crew_size: defaultCrew(set), safety_officer: true, work_days: 1, disclaimer: defaultDisclaimer(set), intro: defaultIntro(set), methodology: defaultMethodology(set),
    method_sections: syncMethodSections(d.services, [code], []), status: 'Draft', branch_id: client.branch_id,
  } as never) as Quotation;
  setQuoteStatus(quote.id, 'Sent'); setQuoteStatus(quote.id, 'Approved');
  const start = `${b.date}T${b.time || '08:00'}`; const end = `${b.date}T${String(Math.min(23, +(b.time || '08:00').slice(0, 2) + 9)).padStart(2, '0')}:${(b.time || '08:00').slice(3)}`;
  const job = saveJob({
    booking_date: today(), client_id: client.id, site_id: site.id, quotation_id: quote.id, branch_id: client.branch_id, service_codes: [code], scope, start_at: start, end_at: end > start ? end : `${b.date}T23:59`, status: 'Confirmed',
    leader_id: undefined, crew_ids: [], vehicle_id: undefined, equipment_ids: [], materials: [], ppe: ['Hard hat', 'Safety boots', 'Gloves', 'Safety goggles'],
    checklist: ['Site safety briefing & PPE check', 'Pre-work inspection & before photos', 'Cordon off / signage installed', `Perform ${plan.other?.name ?? d.services.find((x) => x.code === 'GLASS_EXT')?.name ?? 'the service'}`, 'Post-work inspection with client rep', 'After photos & clean-up', 'Client sign-off'].map((label) => ({ label, done: false })), findings: '', damage_report: '', equipment_condition_notes: '', contract_amount: docTotals(plan.items, 0, 'none', 0).net, estimated_cost: 0,
  } as never);
  return { client, newClient: !existing, quote: store.getDB().quotations.find((x) => x.id === quote.id) ?? quote, job };
}
