// AI V2.3: who is this ManyChat contact? Pure rules (testable) plus the few database lookups they need.
// Three statuses, kept apart:
//   new      first known interaction
//   previous has communicated with TopMop before, but no service history is verified (never shown a client's records)
//   existing positively matched to a TopMop Operation client record (verified by the system, or linked by staff)
// A name is NEVER a basis for a link. A number or job number the customer types in the chat is only a SUGGESTION for staff.
// A client record may be older OR newer than the chat: there is no date comparison.

export type ContactStatus = 'new' | 'previous' | 'existing';
export type LinkState = 'verified' | 'staff' | 'ambiguous' | 'suggested';
export interface Candidate { client_id: string; name: string; basis: string }
export interface Identity { status: ContactStatus; client_id?: string; state?: LinkState; basis?: string; candidates: Candidate[]; reasons: string[] }
export interface IdentityInput {
  stored: { client_id?: string | null; link_state?: string | null; link_basis?: string | null; staff_returning?: boolean };
  phoneMatches: Candidate[];       // clients whose mobile equals the CONTACT's own number (ManyChat contact record / payload), never a number typed in the chat
  typedMatches: Candidate[];       // clients matched by a number or job number the customer typed in the chat: suggestions only
  tags?: unknown; subscribedAt?: string; lastInteraction?: string; convCreatedAt?: string; aiStartedOn?: string;
  priorStaffReply?: boolean;
}

/** A Philippine mobile number reduced to its 10 digits (9171234567), whatever the formatting; undefined when it is not one. */
export function normMobile(raw: unknown): string | undefined {
  const d = String(raw ?? '').replace(/\D/g, ''); if (d.length < 10) return undefined;
  const t = d.slice(-10); return /^9\d{9}$/.test(t) && (d.length === 10 || /^(0|63|0063)9/.test(d)) ? t : undefined;
}
/** Mobile numbers written in a message ("0917 555 1212", "+63 917-555-1212"). */
export function phonesIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of String(text ?? '').matchAll(/(?:\+?63|0)?[\s-]?9\d{2}[\s-]?\d{3}[\s-]?\d{4}/g)) { const n = normMobile(m[0].replace(/^\s+/, '')); if (n) out.add(n); }
  return [...out];
}
/** Job order numbers written in a message (JOB-2026-8818, JO-2026-83589). */
export const jobNumbersIn = (text: string): string[] => [...new Set([...String(text ?? '').matchAll(/\bJOB?-\d{4}-\d{3,6}\b/gi)].map((m) => m[0].toUpperCase()))];

/** The customer refers to something that already happened (an earlier chat, a booking, a job order, a scheduled date): this is NOT a new sales inquiry. */
const PREVIOUS_REF = new RegExp([
  String.raw`\bwe (?:already )?(?:talked|spoke|chatted|messaged|discussed|agreed|booked|scheduled)\b`,
  String.raw`\b(?:talked|spoke|chatted) (?:yesterday|earlier|last (?:week|time|month)|before|with (?:your|the) (?:staff|team|admin))\b`,
  String.raw`\b(?:i|we) (?:already|have already|had already) (?:booked|reserved|scheduled|paid|confirmed|have a (?:booking|reservation|job order|schedule))\b`,
  String.raw`\b(?:i|we) (?:have|got) (?:a|an|my|our) (?:booking|reservation|job order|schedule|appointment)\b`,
  String.raw`\bmay\s+(?:job order|booking|reservation|schedule|appointment)\s+(?:na|po|ako|kami)\b`,
  String.raw`\b(?:nag-?book|nagpa-?book|nag-?reserve|nagpa-?schedule|nakapag-?book)\b`,
  String.raw`\bas (?:discussed|agreed|per)\b|\bper (?:our|the) (?:discussion|conversation|agreement)\b|\bkausap (?:ko|namin)\b|\bnausap\b`,
  String.raw`\bfollow-?\s?up\b|\bfollowing up\b|\breminder\b|\bpaalala\b|\breminding\b`,
  String.raw`\b(?:we are|we're|i am|i'm|kami|ako)\s+(?:po\s+)?(?:scheduled|booked|nakaschedule|naka-?schedule)\b`,
  String.raw`\b(?:our|my|the|ang) (?:booking|reservation|schedule|appointment|job order)\b.{0,40}\b(?:on|for|sa|is|was)\b`,
  String.raw`\b(?:still|already)\s+(?:scheduled|booked|confirmed|on for)\b|\bare we (?:still )?(?:on|scheduled|booked)\b|\bscheduled (?:on|for)\b|\b(?:my|our) (?:booking|reservation|appointment|job order)\b`,
  String.raw`\bJOB?-\d{4}-\d{3,6}\b`,
].join('|'), 'i');
export const isPreviousReference = (text: string): boolean => PREVIOUS_REF.test(String(text ?? ''));

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, '0');
/** Calendar dates named in a message ("November 30", "Nov. 30", "30 Nov", "11/30"), as YYYY-MM-DD in the year of `today` (the next year when the date is more than a month past). */
export function datesIn(text: string, today: string): string[] {
  const t = String(text ?? '').toLowerCase(); const out = new Set<string>(); const y0 = Number(today.slice(0, 4));
  const add = (m: number, d: number) => { if (m < 1 || m > 12 || d < 1 || d > 31) return; let y = y0; let iso = `${y}-${pad(m)}-${pad(d)}`; if (Date.parse(iso) < Date.parse(today) - 31 * 86400_000) { y++; iso = `${y}-${pad(m)}-${pad(d)}`; } out.add(iso); };
  for (const m of t.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/g)) add(MONTHS[m[1]], Number(m[2]));
  for (const m of t.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/g)) add(MONTHS[m[2]], Number(m[1]));
  for (const m of t.matchAll(/\b(\d{1,2})[/-](\d{1,2})(?:[/-]\d{2,4})?\b/g)) add(Number(m[1]), Number(m[2]));
  return [...out];
}

const TAG = /existing|returning|regular|repeat|past (customer|client)/i;
const tagOf = (tags: unknown): string | undefined => { for (const t of Array.isArray(tags) ? tags : []) { const n = String(typeof t === 'object' && t ? (t as { name?: unknown }).name ?? '' : t ?? ''); if (TAG.test(n) && !/new|lead|prospect/i.test(n)) return n; } return undefined; };
const olderThan = (d: string | undefined, ref: string | undefined, graceDays = 0) => !!d && !!ref && Date.parse(d) < Date.parse(ref) - graceDays * 86400_000;

/** The decision. Order: a stored link (system or staff) → the contact's own mobile number → previous-contact evidence → typed suggestions → new. */
export function decideIdentity(i: IdentityInput): Identity {
  const s = i.stored; const reasons: string[] = [];
  if (s.client_id && (s.link_state === 'verified' || s.link_state === 'staff')) {   // only an explicit link counts: a client_id alone may come from a number the customer typed into a booking
    return { status: 'existing', client_id: s.client_id, state: s.link_state === 'staff' ? 'staff' : 'verified', basis: s.link_basis || (s.link_state === 'staff' ? 'staff' : 'chat_booking'), candidates: [], reasons: [s.link_state === 'staff' ? 'Linked to this client by staff' : 'Already linked to this client'] };
  }
  if (i.phoneMatches.length === 1) { const m = i.phoneMatches[0]; return { status: 'existing', client_id: m.client_id, state: 'verified', basis: 'mobile', candidates: [], reasons: [`The contact's mobile number matches client ${m.name}`] }; }
  const tag = tagOf(i.tags);
  if (i.phoneMatches.length > 1) reasons.push(`The contact's mobile number is on ${i.phoneMatches.length} client records: staff must choose`);
  if (s.staff_returning) reasons.push('Staff marked this customer as returning');
  if (tag) reasons.push(`ManyChat tag "${tag}"`);
  if (olderThan(i.subscribedAt, i.aiStartedOn)) reasons.push(`A ManyChat contact since ${String(i.subscribedAt).slice(0, 10)}, before the AI chat started`);
  if (olderThan(i.convCreatedAt, i.aiStartedOn)) reasons.push('This conversation started before the AI chat was switched on; our team handled it');
  if (olderThan(i.lastInteraction, i.aiStartedOn)) reasons.push('Their last ManyChat activity was before the AI chat started');
  if (i.priorStaffReply) reasons.push('A staff member already replied in this chat');
  const ambiguous = i.phoneMatches.length > 1;
  const typed = i.typedMatches.filter((t) => !i.phoneMatches.some((p) => p.client_id === t.client_id));
  const cands = ambiguous ? i.phoneMatches : typed;
  if (!ambiguous && typed.length) reasons.push('The customer wrote a number that matches a client record: staff to confirm');
  if (!reasons.length) return { status: 'new', candidates: [], reasons: [] };
  return { status: 'previous', ...(cands.length ? { state: ambiguous ? 'ambiguous' as const : 'suggested' as const, candidates: cands } : { candidates: [] }), reasons };
}

export interface JobLine { number: string; date: string; time: string; status: string; services: string[]; site?: string }
const SVC: Record<string, string> = { GLASS_EXT: 'exterior glass', GLASS_INT: 'interior glass', ROOF: 'roof', WALL: 'wall', FLOOR: 'floor', SOLAR: 'solar panels' };
export const serviceNames = (codes: unknown): string[] => (Array.isArray(codes) ? codes : []).map((c) => SVC[String(c)] ?? String(c).toLowerCase().replace(/_/g, ' ')).slice(0, 4);
const dayName = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' });
const clock = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${pad(m || 0)} ${h >= 12 ? 'PM' : 'AM'}`; };
export const jobSentence = (j: JobLine) => `${j.number} is set for ${dayName(j.date)} at ${clock(j.time)} (${j.status.toLowerCase()})`;

/** The reply when a verified customer asks about their own booking: from their own job, never from the general calendar. */
export function existingBookingReply(jobs: JobLine[], wanted: string[] = []): string {
  if (!jobs.length) return '';
  const hit = jobs.find((j) => wanted.includes(j.date));
  if (hit) return `Yes po, your booking ${jobSentence(hit)}. Our team will see you then.`;
  if (jobs.length === 1) return `Yes po, your booking ${jobSentence(jobs[0])}. Is there anything you'd like to update po?`;
  return `We have ${jobs.length} bookings for you po: ${jobs.slice(0, 3).map(jobSentence).join('; ')}. Which one would you like to ask about?`;
}

const NOT_AVAILABLE = /\b(fully[- ]booked|is full|are full|no (?:more )?(?:slots?|schedules?)|not available|unavailable|too soon|cannot (?:accommodate|schedule)|can'?t (?:accommodate|schedule)|already taken)\b/i;
const FORM_TEXT = /please copy this and fill in your details|Reservation Date:/i;
/** True when a reply to a VERIFIED customer contradicts their own booking: it says a date they already hold is full or unavailable, or sends the booking form for a booking that exists. */
export function contradictsBooking(reply: string, customerText: string, jobs: JobLine[], today: string): string | undefined {
  if (!jobs.length) return undefined;
  const mine = new Set(jobs.map((j) => j.date)); const asked = datesIn(customerText, today).filter((d) => mine.has(d));
  if (asked.length && NOT_AVAILABLE.test(reply)) return `says ${asked[0]} is full or unavailable, but that date is this customer's own booking ${jobs.find((j) => j.date === asked[0])!.number}`;
  if (isPreviousReference(customerText) && FORM_TEXT.test(reply)) return 'sends the booking form to a customer who already has a booking';
  return undefined;
}

/* ---------------- database lookups (service role) ---------------- */
type Sb = { from: (t: string) => any; rpc: (n: string, a?: unknown) => any }; // deno-lint-ignore no-explicit-any
const cand = (c: { id: string; name: string }, basis: string): Candidate => ({ client_id: c.id, name: c.name, basis });

/** Clients with this mobile number (formatting-proof). Uses the database function; falls back to a scan when the migration is not applied yet. */
export async function clientsByMobile(sb: Sb, raw: unknown, basis: string): Promise<Candidate[]> {
  const n = normMobile(raw); if (!n) return [];
  const r = await sb.rpc('chat_clients_by_mobile', { p_mobile: `0${n}` });
  if (!r.error) return ((r.data ?? []) as { id: string; name: string }[]).map((c) => cand(c, basis));
  const { data } = await sb.from('clients').select('id, name, mobile').is('deleted_at', null).not('mobile', 'is', null).limit(5000);
  return ((data ?? []) as { id: string; name: string; mobile: string }[]).filter((c) => normMobile(c.mobile) === n).slice(0, 5).map((c) => cand(c, basis));
}
/** Clients behind job numbers the customer wrote. */
export async function clientsByJobNumber(sb: Sb, text: string): Promise<Candidate[]> {
  const nums = jobNumbersIn(text).filter((n) => n.startsWith('JOB-')); if (!nums.length) return [];
  const { data } = await sb.from('jobs').select('number, client_id').in('number', nums).is('deleted_at', null).limit(5);
  const ids = [...new Set(((data ?? []) as { client_id: string }[]).map((j) => j.client_id))]; if (!ids.length) return [];
  const { data: cl } = await sb.from('clients').select('id, name').in('id', ids).is('deleted_at', null);
  return ((cl ?? []) as { id: string; name: string }[]).map((c) => cand(c, 'job_number'));
}
/** The verified client's active and upcoming jobs (not cancelled, not completed), soonest first. Found from the client record, whoever created the job. */
export async function activeJobs(sb: Sb, clientId: string, todayIso: string): Promise<JobLine[]> {
  const { data } = await sb.from('jobs').select('number, start_at, status, service_codes, site_id').eq('client_id', clientId).is('deleted_at', null).in('status', ['Pending', 'Confirmed', 'In Progress']).gte('end_at', `${todayIso}T00:00:00`).order('start_at', { ascending: true }).limit(6);
  const rows = (data ?? []) as { number: string; start_at: string; status: string; service_codes: unknown; site_id: string }[]; if (!rows.length) return [];
  const { data: st } = await sb.from('sites').select('id, name').in('id', [...new Set(rows.map((r) => r.site_id))]);
  const sn = Object.fromEntries(((st ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  return rows.map((r) => ({ number: r.number, date: String(r.start_at).slice(0, 10), time: String(r.start_at).slice(11, 16) || '08:00', status: r.status, services: serviceNames(r.service_codes), site: sn[r.site_id] }));
}
