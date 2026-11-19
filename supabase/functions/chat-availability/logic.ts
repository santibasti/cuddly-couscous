// Pure helpers for the chatbot's "is that date free?" question (no network, so they can be tested).
// The rules mirror the booking form: a day is open when a team leader, enough crew and a vehicle are free, and the daily job limit is not reached.
export const addDays = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400_000).toISOString().slice(0, 10);
export const manilaDay = (ms: number) => new Date(ms + 8 * 3600_000).toISOString().slice(0, 10);
const weekday = (d: string) => new Date(d + 'T00:00:00Z').getUTCDay();                       // 0 = Sunday

/** auto_confirm: the chat books an open date by itself (a person still arranges the team, vehicle and the quotation). check_resources: also require a free leader, crew and vehicle (off by default: a day is open while it has fewer than max_jobs_per_day jobs). */
export interface Rules { lead_days: number; closed_weekdays: number[]; max_jobs_per_day: number; horizon_days: number; alternatives: number; crew_needed: number; auto_confirm: boolean; check_resources: boolean; auto_job_order: boolean; job_order_delay_min: number }
export const DEFAULT_RULES: Rules = { lead_days: 2, closed_weekdays: [0], max_jobs_per_day: 2, horizon_days: 21, alternatives: 3, crew_needed: 3, auto_confirm: false, check_resources: false, auto_job_order: false, job_order_delay_min: 10 };
const num = (v: unknown, d: number, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };
/** Rules from the Admin settings, every value kept inside a sensible range. */
export function normalizeRules(x: unknown): Rules {
  const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const closed = Array.isArray(r.closed_weekdays) ? [...new Set(r.closed_weekdays.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))] : DEFAULT_RULES.closed_weekdays;
  return { lead_days: num(r.lead_days, DEFAULT_RULES.lead_days, 0, 30), closed_weekdays: closed, max_jobs_per_day: num(r.max_jobs_per_day, DEFAULT_RULES.max_jobs_per_day, 1, 20), horizon_days: num(r.horizon_days, DEFAULT_RULES.horizon_days, 7, 90), alternatives: num(r.alternatives, DEFAULT_RULES.alternatives, 1, 5), crew_needed: num(r.crew_needed, DEFAULT_RULES.crew_needed, 1, 15), auto_confirm: r.auto_confirm === true, check_resources: r.check_resources === true, auto_job_order: r.auto_job_order === true, job_order_delay_min: num(r.job_order_delay_min, DEFAULT_RULES.job_order_delay_min, 0, 240) };
}

const DAYS: Record<string, number> = { sunday: 0, sun: 0, linggo: 0, monday: 1, mon: 1, lunes: 1, tuesday: 2, tue: 2, tues: 2, martes: 2, wednesday: 3, wed: 3, miyerkules: 3, miyerkoles: 3, thursday: 4, thu: 4, thur: 4, thurs: 4, huwebes: 4, friday: 5, fri: 5, biyernes: 5, saturday: 6, sat: 6, sabado: 6 };
const MONTHS: Record<string, number> = { jan: 1, january: 1, enero: 1, feb: 2, february: 2, pebrero: 2, mar: 3, march: 3, marso: 3, apr: 4, april: 4, abril: 4, may: 5, mayo: 5, jun: 6, june: 6, hunyo: 6, jul: 7, july: 7, hulyo: 7, aug: 8, august: 8, agosto: 8, sep: 9, sept: 9, september: 9, setyembre: 9, oct: 10, october: 10, oktubre: 10, nov: 11, november: 11, nobyembre: 11, dec: 12, december: 12, disyembre: 12 };
const pad = (n: number) => String(n).padStart(2, '0');
/** The date the customer means, as YYYY-MM-DD in Manila time, or null when it cannot be understood. Accepts 2026-11-21, tomorrow / bukas, a weekday (Saturday, sa sabado, next Saturday), Nov 21, 21 Nov, 11/21. */
export function parseWanted(input: unknown, today: string): string | null {
  const t = String(input ?? '').trim().toLowerCase(); if (!t) return null;
  const iso = t.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/); if (iso) { const d = `${iso[1]}-${pad(+iso[2])}-${pad(+iso[3])}`; return Number.isNaN(Date.parse(d)) ? null : d; }
  if (/\b(today|ngayon)\b/.test(t)) return today; if (/\b(tomorrow|bukas)\b/.test(t)) return addDays(today, 1); if (/\b(day after tomorrow|samakalawa)\b/.test(t)) return addDays(today, 2);
  const year = +today.slice(0, 4);
  const fix = (m: number, d: number) => { if (m < 1 || m > 12 || d < 1 || d > 31) return null; let s = `${year}-${pad(m)}-${pad(d)}`; if (Number.isNaN(Date.parse(s))) return null; if (s < today) s = `${year + 1}-${pad(m)}-${pad(d)}`; return s; };
  const md = t.match(/\b([a-z]{3,9})\.?\s+(\d{1,2})\b/); if (md && MONTHS[md[1]]) return fix(MONTHS[md[1]], +md[2]);
  const dm = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3,9})\b/); if (dm && MONTHS[dm[2]]) return fix(MONTHS[dm[2]], +dm[1]);
  const sl = t.match(/\b(\d{1,2})\/(\d{1,2})\b/); if (sl) return fix(+sl[1], +sl[2]);
  const wd = t.match(/[a-z]+/g)?.find((w) => w in DAYS); if (wd !== undefined) { const target = DAYS[wd]; let d = addDays(today, 1); for (let i = 0; i < 7 && weekday(d) !== target; i++) d = addDays(d, 1); if (/\bnext\b|susunod/.test(t) && d <= addDays(today, 7)) d = addDays(d, 7); return d; }
  return null;
}

export interface JobRow { start_at: string; end_at: string; status: string; leader_id?: string | null; crew_ids?: string[] | null; vehicle_id?: string | null }
export interface Facts { jobs: JobRow[]; field: { id: string; tier?: string | null }[]; vehicles: { id: string }[]; holidays: string[] }
export const DONE = ['Work Completed', 'Leaving Site', 'Arrived at HQ', 'Closed', 'Completed', 'Cancelled', 'Rescheduled'];
export type Status = 'available' | 'full' | 'closed' | 'too_soon';
export interface DayCheck { date: string; status: Status; jobs: number; free_people: number; free_leaders: number; free_vehicles: number }
/** Is one day open? Day-level, like the calendar: a person or vehicle on any job touching that day is busy for it. */
export function dayCheck(date: string, today: string, rules: Rules, f: Facts): DayCheck {
  const act = f.jobs.filter((j) => !DONE.includes(j.status) && j.start_at.slice(0, 10) <= date && j.end_at.slice(0, 10) >= date);
  const busy = new Set<string>(), cars = new Set<string>(); for (const j of act) { for (const id of [...(j.crew_ids ?? []), ...(j.leader_id ? [j.leader_id] : [])]) busy.add(id); if (j.vehicle_id) cars.add(j.vehicle_id); }
  const free = f.field.filter((e) => !busy.has(e.id)), leaders = free.filter((e) => e.tier === 'Team Leader' || e.tier === 'Senior Technician'), veh = f.vehicles.filter((v) => !cars.has(v.id));
  const base = { date, jobs: act.length, free_people: free.length, free_leaders: leaders.length, free_vehicles: veh.length };
  if (rules.closed_weekdays.includes(weekday(date)) || f.holidays.includes(date)) return { ...base, status: 'closed' };
  if (date < addDays(today, rules.lead_days)) return { ...base, status: 'too_soon' };
  if (act.length >= rules.max_jobs_per_day || (rules.check_resources && (leaders.length < 1 || free.length < rules.crew_needed || veh.length < 1))) return { ...base, status: 'full' };
  return { ...base, status: 'available' };
}

const label = (d: string) => new Date(d + 'T00:00:00Z').toLocaleDateString('en-PH', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
export interface Alt { date: string; label: string }
export type Lang = 'en' | 'tl' | 'taglish';
/** The customer's language: English, Filipino or Taglish (the default is English). The chat answers in the language the customer writes. */
export const parseLang = (v: unknown): Lang => { const t = String(v ?? '').toLowerCase().replace(/[^a-z]/g, ''); return t.startsWith('tag') && t.includes('lish') || t === 'taglish' || t === 'tglish' ? 'taglish' : t === 'tl' || t === 'tagalog' || t === 'filipino' || t === 'fil' ? 'tl' : 'en'; };
export const pick = (r: { reply_en: string; reply_tl: string; reply_tglish: string }, lang: Lang) => (lang === 'tl' ? r.reply_tl : lang === 'taglish' ? r.reply_tglish : r.reply_en);
export interface Result { ok: boolean; status: Status | 'unclear'; requested: string | null; requested_label: string | null; alternatives: Alt[]; reply_en: string; reply_tl: string; reply_tglish: string }
/** The answer the chatbot reads out. It never confirms a booking: a person reviews every request. */
export function checkAvailability(wanted: string | null, today: string, rules: Rules, f: Facts): Result {
  if (!wanted) return { ok: false, status: 'unclear', requested: null, requested_label: null, alternatives: [], reply_en: 'Which date would you like? You can write it like "Saturday" or "Nov 21".', reply_tl: 'Anong petsa po ang gusto ninyo? Pwede pong isulat tulad ng "Sabado" o "Nov 21".', reply_tglish: 'Anong date po ang gusto ninyo? Pwede po ninyong i-type like "Saturday" or "Nov 21".' };
  const c = dayCheck(wanted, today, rules, f), first = addDays(today, rules.lead_days);
  const alts: Alt[] = []; if (c.status !== 'available') {
    const cand: { d: string; dist: number }[] = []; for (let k = 0; k <= rules.horizon_days; k++) { const d = addDays(first, k); if (d !== wanted && dayCheck(d, today, rules, f).status === 'available') cand.push({ d, dist: Math.abs(Date.parse(d) - Date.parse(wanted)) }); }
    for (const x of cand.sort((a, b) => a.dist - b.dist || a.d.localeCompare(b.d)).slice(0, rules.alternatives).sort((a, b) => a.d.localeCompare(b.d))) alts.push({ date: x.d, label: label(x.d) });
  }
  const L = label(wanted), list = alts.map((a) => a.label).join(', ');
  if (c.status === 'available') return { ok: true, status: 'available', requested: wanted, requested_label: L, alternatives: [], reply_en: `${L} looks open. Our team will review your details and confirm the booking with you.`, reply_tl: `Mukhang bukas po ang ${L}. Titingnan po ng aming team ang inyong detalye at ikukumpirma namin sa inyo.`, reply_tglish: `Mukhang open po ang ${L}. Ire-review po ng team namin ang details ninyo at kukumpirmahin namin sa inyo.` };
  const why = { full: ['is fully booked', 'ay puno na po', 'puno na po kami sa'], closed: ['is a day we are closed', 'ay hindi po kami nagseserbisyo', 'hindi po kami nagseserbisyo tuwing'], too_soon: ['is too soon for us to schedule', 'ay masyado pong malapit para ma-schedule', 'masyado pong malapit para ma-schedule ang'] }[c.status];
  const en = `Sorry, ${L} ${why[0]}.` + (list ? ` The nearest open dates are: ${list}. Which one suits you?` : ' Please tell us another date and our team will check.');
  const tl = `Paumanhin po, ang ${L} ${why[1]}.` + (list ? ` Ang pinakamalapit na bukas na petsa ay: ${list}. Alin po ang gusto ninyo?` : ' Pakisabi po ang ibang petsa at titingnan ng aming team.');
  const tg = `Sorry po, ${why[2]} ${L}.` + (list ? ` Ang pinakamalapit na available dates namin ay ${list}. Alin po ang okay sa inyo?` : ' Pakisabi po ang ibang date at titingnan ng team namin.');
  return { ok: false, status: c.status, requested: wanted, requested_label: L, alternatives: alts, reply_en: en, reply_tl: tl, reply_tglish: tg };
}

/** What the chat says after it really booked the date. Nothing about the price (the estimate sentence is added separately). With a Job Order link (automatic Job Order switched on) it also hands over the link. */
export function bookedReply(label: string, number: string, link?: string, later = false): { reply_en: string; reply_tl: string; reply_tglish: string } {
  // English-first for every language: the customer gets one short, clear confirmation (the Tagalog-heavy variants were retired in V2).
  const en = `Your booking is set for ${label} (ref ${number}). Our team will message you the arrival time and the final price after verifying the details. If you need to change the date, just tell us.`;
  const tail = link ? ` Here is your Job Order with our rates: ${link}` : later ? ' Your Job Order confirmation will follow in a few minutes.' : '';
  const r = `${en}${tail}`; return { reply_en: r, reply_tl: r, reply_tglish: r };
}
