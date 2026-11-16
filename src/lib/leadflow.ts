// Lead Flow: where every lead stands on the road from the first inquiry to a sent job order, and what the next step is. Worked out from the app's own records (inquiries,
// quotations, jobs, job orders), so it never disagrees with them. The steps that commit the company (sending a quotation, booking, assigning the crew, sending the job order)
// are approval gates: they only happen when a person presses the button.
import { findConflicts, isDone } from './business';
import { headOrder } from './joborder-core';
import type { Asset, DB, Employee, Job, Quotation } from './types';
import { addDays } from './util';

export type FlowStep = 'new' | 'quote' | 'sent' | 'confirm' | 'book' | 'order' | 'ready';
export interface StepDef { key: FlowStep; label: string; short: string; icon: string; agent: string; gate: boolean; blurb: string }
/** The road. `agent` is the headquarters character that looks after the step (see lib/hq.ts). */
export const STEPS: StepDef[] = [
  { key: 'new', label: 'New inquiry', short: 'Inquiry', icon: '💬', agent: 'messenger', gate: false, blurb: 'A lead arrived and needs a quotation.' },
  { key: 'quote', label: 'Quotation ready', short: 'Quotation', icon: '🧾', agent: 'quote', gate: true, blurb: 'A draft quotation waits for your approval to send.' },
  { key: 'sent', label: 'With the client', short: 'Sent', icon: '📨', agent: 'quote', gate: false, blurb: 'Sent; waiting for the client to answer.' },
  { key: 'confirm', label: 'Client said yes', short: 'Confirmed', icon: '✅', agent: 'booking', gate: true, blurb: 'Approved by the client; pick the date and book it.' },
  { key: 'book', label: 'Booked, crew needed', short: 'Crew', icon: '🧑‍🔧', agent: 'scheduler', gate: true, blurb: 'The booking exists; assign the team and vehicle.' },
  { key: 'order', label: 'Job order to send', short: 'Job order', icon: '📄', agent: 'joborders', gate: true, blurb: 'The team is set; send the job order to the client.' },
  { key: 'ready', label: 'Ready to go', short: 'Ready', icon: '🚚', agent: 'joborders', gate: false, blurb: 'Everything is confirmed and sent.' },
];
export const stepDef = (k: FlowStep) => STEPS.find((s) => s.key === k)!;

export interface FlowCard {
  id: string; step: FlowStep; client: string; service: string; place: string; since: string; ageH: number;
  flags: string[]; urgent: boolean; /** forgotten: older than 30 days (or a job that started days ago), hidden until asked for */ stale: boolean; clientId: string; inquiryId?: string; quotationId?: string; jobId?: string; number?: string;
}
const DAY = 86_400_000;
const isLiveJob = (j: Job) => !j.deleted_at && !['Cancelled', 'Rescheduled'].includes(j.status) && !isDone(j.status);

/** Every lead that is still on the road, with its step, how long it has been there, and anything that needs attention. */
export function flowCards(db: DB, now: number = Date.now()): FlowCard[] {
  const today = new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
  const quotes = (db.quotations ?? []).filter((q) => !q.deleted_at);
  const jobOf = (q: Quotation) => (db.jobs ?? []).find((j) => j.quotation_id === q.id && isLiveJob(j));
  const bestQuote = (qs: Quotation[]) => qs.filter((q) => !['Rejected', 'Expired'].includes(q.status)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  const out: FlowCard[] = []; const used = new Set<string>();
  const clientOf = (id: string) => (db.clients ?? []).find((c) => c.id === id);
  const placeOf = (clientId: string, siteId?: string) => { const st = siteId ? (db.sites ?? []).find((s) => s.id === siteId) : undefined; const c = clientOf(clientId); return st?.city ?? c?.city ?? st?.address ?? c?.address ?? ''; };
  const hrs = (iso: string) => Math.max(0, Math.round((now - Date.parse(iso)) / 3_600_000));
  const svc = (codes: string[]) => (codes ?? []).map((c) => (db.services ?? []).find((s) => s.code === c)?.name ?? c).slice(0, 2).join(' + ') || 'Service';

  const add = (c: Omit<FlowCard, 'ageH' | 'flags' | 'urgent' | 'stale'> & { flags?: string[]; urgent?: boolean; stale?: boolean }) => {
    const ageH = hrs(c.since); const flags = [...(c.flags ?? [])]; let urgent = !!c.urgent; const stale = !!c.stale || (['new', 'quote', 'sent', 'confirm'].includes(c.step) && ageH > 30 * 24);
    if (c.step === 'new' && ageH >= 24) { flags.push(`No quotation for ${Math.floor(ageH / 24)} d`); urgent = true; }
    if (c.step === 'quote' && ageH >= 24) { flags.push(`Waiting for you ${Math.floor(ageH / 24)} d`); urgent = true; }
    if (c.step === 'sent' && ageH >= 72) flags.push(`No reply for ${Math.floor(ageH / 24)} d`);
    if (c.step === 'confirm' && ageH >= 24) { flags.push('Not booked yet'); urgent = true; }
    if (stale) urgent = false;
    out.push({ ...c, ageH, flags, urgent, stale });
  };

  for (const i of (db.inquiries ?? []).filter((x) => !x.deleted_at && x.stage !== 'Lost')) {
    const q = bestQuote(quotes.filter((x) => x.inquiry_id === i.id)); if (q) used.add(q.id);
    const base = { clientId: i.client_id, client: clientOf(i.client_id)?.name ?? 'Client', service: svc(i.service_codes), place: placeOf(i.client_id, i.site_id), inquiryId: i.id };
    if (!q) { add({ ...base, id: `i:${i.id}`, step: 'new', since: i.created_at }); continue; }
    cardFromQuote(q, base, i.id);
  }
  for (const q of quotes.filter((x) => !used.has(x.id) && !x.inquiry_id && !['Rejected', 'Expired'].includes(x.status))) {
    cardFromQuote(q, { clientId: q.client_id, client: clientOf(q.client_id)?.name ?? 'Client', service: svc(q.items.map((it) => it.service_code)), place: placeOf(q.client_id, q.site_id) }, undefined);
  }

  function cardFromQuote(q: Quotation, base: { clientId: string; client: string; service: string; place: string; inquiryId?: string }, inquiryId?: string) {
    const common = { ...base, inquiryId, quotationId: q.id, number: q.number };
    if (q.status === 'Draft') return add({ ...common, id: `q:${q.id}`, step: 'quote', since: q.created_at });
    if (q.status === 'Sent') return add({ ...common, id: `q:${q.id}`, step: 'sent', since: q.sent_at ?? q.created_at });
    if (q.status !== 'Approved') return;
    const j = jobOf(q);
    if (!j) return add({ ...common, id: `q:${q.id}`, step: 'confirm', since: q.decided_at ?? q.created_at });
    const jc = { ...common, jobId: j.id, number: j.number, id: `j:${j.id}` };
    const starts = Math.ceil((Date.parse(`${j.start_at.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
    if (!j.leader_id && !(j.crew_ids ?? []).length) return add({ ...jc, step: 'book', since: j.created_at, flags: starts <= 3 && starts >= -2 ? [`Starts ${starts <= 0 ? 'today' : `in ${starts} d`}, no crew`] : [], urgent: starts <= 3 && starts >= -2, stale: starts < -2 });
    const o = headOrder(db, j.id);
    if (o?.status !== 'Sent to Client') return add({ ...jc, step: 'order', since: j.updated_at ?? j.created_at, flags: starts <= 2 && starts >= -2 ? [`Starts ${starts <= 0 ? 'today' : `in ${starts} d`}`] : [], urgent: starts <= 2 && starts >= -2, stale: starts < -2 });
    if (starts >= 0 && starts <= 7) add({ ...jc, step: 'ready', since: j.start_at });
  }
  return out.sort((a, b) => Number(b.urgent) - Number(a.urgent) || b.ageH - a.ageH);
}

export interface FlowSummary { byStep: Record<FlowStep, number>; waitingForYou: number; urgent: number; wonThisMonth: number; leadsThisMonth: number; conversion: number }
export function flowSummary(db: DB, all: FlowCard[], now: number = Date.now()): FlowSummary {
  const cards = all.filter((c) => !c.stale);
  const byStep = Object.fromEntries(STEPS.map((s) => [s.key, cards.filter((c) => c.step === s.key).length])) as Record<FlowStep, number>;
  const month = new Date(now + 8 * 3_600_000).toISOString().slice(0, 7);
  const leads = (db.inquiries ?? []).filter((i) => !i.deleted_at && i.created_at.slice(0, 7) === month);
  const won = leads.filter((i) => i.stage === 'Booked').length;
  return { byStep, waitingForYou: cards.filter((c) => stepDef(c.step).gate).length, urgent: cards.filter((c) => c.urgent).length, wonThisMonth: won, leadsThisMonth: leads.length, conversion: leads.length ? Math.round((won / leads.length) * 100) : 0 };
}

/** The service words the price list understands, from the inquiry's service codes. */
export const serviceWord = (codes: string[]) => (codes.includes('ROOF') ? 'roof' : codes.includes('SOLAR') ? 'solar' : codes.includes('FLOOR') ? 'floor' : codes.includes('WALL') ? 'wall' : 'glass');
export const crewNeeded = (crewSize: string | undefined, fallback = 3) => { const n = Number(String(crewSize ?? '').match(/\d+/)?.[0]); return n >= 1 && n <= 12 ? n : fallback; };

export interface DaySlot { date: string; weekday: string; leaders: Employee[]; crew: Employee[]; vehicles: Asset[]; ok: boolean }
/** Which of the coming days have enough free people and a free vehicle for a job, using the same double-booking rule as the booking form. */
export function suggestDays(db: DB, opts: { from: string; days?: number; need: number; start?: string; end?: string }): DaySlot[] {
  const field = (db.employees ?? []).filter((e) => !e.deleted_at && e.status !== 'inactive' && e.department === 'Field Operations');
  const vehicles = (db.assets ?? []).filter((a) => !a.deleted_at && a.category === 'Vehicle' && a.status === 'Available');
  const out: DaySlot[] = [];
  for (let k = 0; k < (opts.days ?? 10); k++) {
    const date = addDays(opts.from, k); const start = `${date}T${opts.start ?? '08:00'}`; const end = `${date}T${opts.end ?? '17:00'}`;
    const free = field.filter((e) => !findConflicts(db, { start_at: start, end_at: end, leader_id: undefined, crew_ids: [e.id], vehicle_id: undefined, equipment_ids: [] }).length);
    const leaders = free.filter((e) => e.tier === 'Team Leader' || e.tier === 'Senior Technician'); const crew = free.filter((e) => !leaders.includes(e));
    const cars = vehicles.filter((v) => !findConflicts(db, { start_at: start, end_at: end, leader_id: undefined, crew_ids: [], vehicle_id: v.id, equipment_ids: [] }).length);
    out.push({ date, weekday: new Date(`${date}T00:00:00Z`).toLocaleDateString('en-PH', { weekday: 'short', timeZone: 'UTC' }), leaders, crew, vehicles: cars, ok: leaders.length >= 1 && free.length >= opts.need && cars.length >= 1 });
  }
  return out;
}
/** The team to propose for a free day: one leader and the rest crew, up to the size needed. */
export const proposeTeam = (slot: DaySlot, need: number): { leader?: Employee; crew: Employee[]; vehicle?: Asset } => ({ leader: slot.leaders[0], crew: [...slot.leaders.slice(1), ...slot.crew].slice(0, Math.max(0, need - 1)), vehicle: slot.vehicles[0] });
