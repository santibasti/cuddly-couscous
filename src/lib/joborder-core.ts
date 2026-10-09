// Job Order Confirmation — pure rules (no store access): what the client document says, when a new version is needed.
// A Job Order confirms a scheduled service. It is not an invoice, an official receipt or a new quotation, and it never carries
// internal labour cost, profitability, the internal equipment checklist, payroll details or internal notes.
import type { DB, Job, JobOrder, JobOrderContent, JobOrderStatus, QuoteItem } from './types';
import { appliedDiscount, docTotals, finalQuoteSummary, invoiceLedger, invoiceTotals, lineTotals, variationTotals } from './business';
import { round2 } from './util';
import { defaultDisclaimer, paymentSentence } from './quote-text';

export const JO_STATUSES: JobOrderStatus[] = ['Draft', 'Sent to Client', 'Revised', 'Superseded'];
/** A booking that has been confirmed and not yet finished or cancelled. */
export const ORDER_JOB_STATUSES = ['Confirmed', 'Dispatch Checklist Pending', 'Dispatched', 'On Site', 'In Progress'];
export const WEATHER_NOTE = 'The schedule may change because of unsafe weather or site-access conditions. We will contact you as early as possible to agree a new time.';
export const CHANGE_NOTE = 'Additional work, changes in scope or extra charges need your approval before the work starts.';
export const PREPARE = ['Site access: let building security / administration know the crew is coming and arrange passes or permits if needed.', 'Water and electricity: please make sure both are available at the work area if the service needs them.', 'Clear work areas: move vehicles, furniture and valuables away from the areas to be cleaned.', 'Contact person: someone who can open the site and approve the work should be reachable on the day.'];

const hhmm = (s: string) => s.slice(11, 16);
const addMin = (hm: string, m: number) => { const t = +hm.slice(0, 2) * 60 + +hm.slice(3, 5) + m; return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
const line = (i: QuoteItem) => ({ description: i.description, qty: i.qty, unit: i.unit, rate: i.rate, amount: round2(i.qty * i.rate - (i.discount || 0)) });

/** Client-facing content for a job, pulled only from its approved quotation, approved variations and the booking. */
export function buildContent(db: DB, job: Job): JobOrderContent {
  const s = db.settings; const c = db.clients.find((x) => x.id === job.client_id);
  const site = db.sites.find((x) => x.id === job.site_id);
  const q = db.quotations.find((x) => x.id === job.quotation_id && !x.deleted_at);
  const approvedQ = q && q.status === 'Approved' ? q : undefined;
  const vars = db.variations.filter((v) => v.job_id === job.id && v.status === 'Approved' && !v.deleted_at);
  const names = (ids: string[]) => ids.map((id) => db.employees.find((e) => e.id === id)?.full_name).filter(Boolean) as string[];
  const leader = job.leader_id ? db.employees.find((e) => e.id === job.leader_id)?.full_name : undefined;
  const crew = names(job.crew_ids).filter((n) => n !== leader);
  const start = hhmm(job.start_at);
  const hours = Math.max(0.5, Math.round(((Date.parse(job.end_at + ':00Z') - Date.parse(job.start_at + ':00Z')) / 3600000) * 2) / 2);
  const sum = approvedQ ? finalQuoteSummary(db, job) : undefined;
  const dr = appliedDiscount(db, job.id);
  const qt = approvedQ ? docTotals(approvedQ.items, approvedQ.discount, approvedQ.vat_mode, approvedQ.vat_rate) : undefined;
  const discounts = [
    ...(qt && qt.discount > 0 ? [{ label: 'Quotation discount', amount: qt.discount }] : []),
    ...vars.filter((v) => variationTotals(v).discount > 0).map((v) => ({ label: `Discount on additional work ${v.number}`, amount: variationTotals(v).discount })),
    ...(dr && (dr.approved_amount ?? 0) > 0 ? [{ label: 'Approved discount', amount: dr.approved_amount! }] : []),
  ];
  const total = sum?.finalTotal ?? 0; const vat = sum?.vat ?? 0;
  const inv = db.invoices.find((i) => i.job_id === job.id && i.status === 'Approved' && !i.deleted_at);
  let payment_status = 'No payment is due yet — the invoice is issued after the service is completed.';
  if (inv) { const lg = invoiceLedger(db, inv); payment_status = lg.balance <= 0.005 ? 'Paid' : lg.received > 0 ? 'Partially paid' : 'Unpaid'; }
  const terms = [paymentSentence(approvedQ?.payment_option) ?? `Payment is due within ${s.payment_terms_days} days of the invoice date.`, approvedQ?.terms?.trim()].filter(Boolean).join(' ');
  const vatMode = approvedQ?.vat_mode ?? 'none'; const vatRate = approvedQ?.vat_rate ?? 0;
  return {
    company: { name: s.company.name, tagline: s.company.tagline, address: s.company.address, phone: s.company.phone, email: s.company.email, tin: s.company.tin },
    client: { name: c?.name ?? '', contact_person: site?.contact_person || c?.contact_person || '', email: c?.email || undefined },
    client_address: (c?.address || c?.billing_address || '').trim() || undefined,
    disclaimer: (approvedQ?.disclaimer?.trim() || defaultDisclaimer(s)) || undefined,
    location: { name: site?.name ?? '', address: site?.address ?? '', contact_person: site?.contact_person || c?.contact_person || '', contact_mobile: site?.contact_mobile || c?.mobile || '' },
    booking_date: job.created_at.slice(0, 10), service_date: job.start_at.slice(0, 10), arrival_from: start, arrival_to: addMin(start, 30), duration_hours: hours,
    service_types: job.service_codes.map((code) => db.services.find((x) => x.code === code)?.name ?? code),
    scope: (approvedQ?.scope || job.scope || '').trim(),
    items: approvedQ ? approvedQ.items.map(line) : [],
    additions: vars.map((v) => ({ number: v.number, reason: v.reason, items: v.items.map(line), total: variationTotals(v).total })),
    discounts: discounts.map((d) => ({ ...d, amount: round2(d.amount) })),
    subtotal: round2(total - vat), vat_label: vatMode === 'none' ? 'VAT' : `VAT (${vatRate}%${vatMode === 'inclusive' ? ', included' : ''})`, vat: round2(vat), total: round2(total),
    payment_terms: terms, payment_status,
    team: { leader, crew },
    access_notes: [site?.access_instructions, c?.access_instructions].map((x) => (x ?? '').trim()).filter((x, i, a) => x && a.indexOf(x) === i),
    blocker: approvedQ ? undefined : 'No approved quotation is linked to this booking. Link the approved quotation before sending.',
  };
}
void lineTotals; void invoiceTotals;

/** What a client would notice changing: when, where, what, how much, who. (Payment status moves on its own and is not part of this.) */
export function contentKey(c: JobOrderContent): string {
  const core = JSON.stringify([c.service_date, c.arrival_from, c.arrival_to, c.duration_hours, c.location, c.client, c.service_types, c.scope, c.items, c.additions, c.discounts, c.subtotal, c.vat, c.total, c.payment_terms, c.team, c.access_notes, !!c.blocker]);
  let h = 5381; for (let i = 0; i < core.length; i++) h = ((h << 5) + h + core.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36) + ':' + core.length;
}
/** Short plain-language list of what changed between two versions of the content. */
export function changeSummary(a: JobOrderContent, b: JobOrderContent): string {
  // compared key-order-insensitively: the database stores JSON with its own key order
  const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x as object).sort(([p], [q]) => p.localeCompare(q))) : x));
  const diff = (x: unknown, y: unknown) => canon(x) !== canon(y);
  const out: string[] = [];
  if (a.service_date !== b.service_date || a.arrival_from !== b.arrival_from || a.duration_hours !== b.duration_hours) out.push('schedule');
  if (a.scope !== b.scope || diff(a.items, b.items) || diff(a.additions, b.additions)) out.push('approved scope');
  if (a.total !== b.total || diff(a.discounts, b.discounts)) out.push('final price');
  if (diff(a.team, b.team)) out.push('assigned team');
  if (diff(a.location, b.location) || diff(a.access_notes, b.access_notes)) out.push('site details');
  return out.length ? `Changed: ${out.join(', ')}.` : 'Updated booking details.';
}

/** The newest version of a job's Job Order. */
export const headOrder = (db: Pick<DB, 'job_orders'>, jobId: string): JobOrder | undefined =>
  (db.job_orders ?? []).filter((o) => o.job_id === jobId && !o.deleted_at).sort((a, b) => b.version - a.version)[0];
export const ordersOf = (db: Pick<DB, 'job_orders'>, jobId: string) => (db.job_orders ?? []).filter((o) => o.job_id === jobId && !o.deleted_at).sort((a, b) => b.version - a.version);

export type OrderStep = { kind: 'create'; job: Job } | { kind: 'refresh'; order: JobOrder; content: JobOrderContent; key: string } | { kind: 'revise'; order: JobOrder; content: JobOrderContent; key: string };
/** What has to happen so every confirmed booking has an up-to-date Job Order: create the first Draft, refresh an unsent one in place, or supersede a sent one with a revised version. */
export function planJobOrders(db: DB, only?: string): OrderStep[] {
  const out: OrderStep[] = [];
  for (const j of db.jobs.filter((x) => !x.deleted_at && ORDER_JOB_STATUSES.includes(x.status) && (!only || x.id === only))) {
    const head = headOrder(db, j.id);
    if (!head) { out.push({ kind: 'create', job: j }); continue; }
    if (head.status === 'Superseded') continue;
    const content = buildContent(db, j); const key = contentKey(content);
    // an unsent order picks up the client's address and the service disclaimer when it was made before the address was shown (a sent one is never touched for this)
    const needsAddress = ['Draft', 'Revised'].includes(head.status) && ((!head.content.client_address && !!content.client_address) || (!head.content.disclaimer && !!content.disclaimer));
    if (key === head.content_key && !needsAddress) continue;
    out.push({ kind: head.status === 'Sent to Client' ? 'revise' : 'refresh', order: head, content, key });
  }
  return out;
}
export const orderLabel = (o: Pick<JobOrder, 'number' | 'version'>) => (o.version > 1 ? `${o.number} · Rev ${o.version}` : o.number);

/** The crew's copy of a Job Order: everything except prices, totals and payment terms. (The database does the same for real accounts — see crew_job_order().) */
export const stripForCrew = (c: JobOrderContent): JobOrderContent => ({ ...c, items: [], additions: [], discounts: [], subtotal: 0, vat_label: '', vat: 0, total: 0, payment_terms: '', payment_status: '', crew_copy: true });
/** What the database returns to crew (price keys are simply absent) → the full shape with empty prices. */
export const crewContentFromServer = (c: Partial<JobOrderContent>): JobOrderContent => stripForCrew(c as JobOrderContent);
