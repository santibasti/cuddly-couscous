// Executive dashboard + geographic client insights (read-only over existing data; nothing here writes).
// Money rules: revenue = approved invoices (net of VAT); collections = Finance-verified payments only; outstanding = open invoice balances.
// Privacy: when `exec` is false the money fields are left out here (not just hidden in the page) and client names / exact points are never returned.
import type { Client, DB, FollowUp, Job, ServiceCode } from './types';
import { clientFollow, clientValue, completedJobs, followUpStats, serviceDate } from './followup-core';
import { docTotals, invoiceBalance, invoiceTotals, isDone, isOpenBackJob, jobCost, paymentCounts, profitAndLoss } from './business';
import { locate, PH_CENTER } from './geo-ph';
import { addDays, inRange, monthEnd, monthStart, round2, sum, weekStart } from './util';

export type Stage = 'Lead' | 'Quoted' | 'Booked' | 'Completed';
export const STAGES: Stage[] = ['Lead', 'Quoted', 'Booked', 'Completed'];
export interface InsightFilters {
  from: string; to: string; branch: string; service: string; client: string;
  segment: '' | 'Residential' | 'Commercial'; stage: '' | Stage; repeat: '' | 'New' | 'Repeat'; province: string; city: string;
}
export const noFilters = (from: string, to: string): InsightFilters => ({ from, to, branch: '', service: '', client: '', segment: '', stage: '', repeat: '', province: '', city: '' });

const live = <X extends { deleted_at?: string | null }>(a: X[] | undefined) => (a ?? []).filter((x) => !x.deleted_at);
const SKIP: Job['status'][] = ['Cancelled', 'Rescheduled'];
const NEEDS_FIX = 'Needs location';

/* ---------- where things are ---------- */
export interface Geo { lat?: number; lng?: number; city?: string; province?: string; precision?: 'precise' | 'area' | 'city' | 'province'; source?: string; mapped: boolean }
type GeoRow = { lat?: number; lng?: number; city?: string; province?: string; geo_precision?: Geo['precision']; geo_source?: string; address?: string; location?: string };
/** Saved position of a record, or (for records saved before geocoding existed) the same place match computed on the fly. */
export function geoOf(r: GeoRow | undefined, address?: string): Geo {
  if (r && typeof r.lat === 'number' && typeof r.lng === 'number') return { lat: r.lat, lng: r.lng, city: r.city, province: r.province, precision: r.geo_precision ?? 'area', source: r.geo_source, mapped: true };
  const hit = locate(address ?? r?.address ?? r?.location ?? '');
  if (hit) return { lat: hit.lat, lng: hit.lng, city: hit.city || undefined, province: hit.province, precision: hit.level, source: 'address-match', mapped: true };
  return { mapped: false };
}
export const areaKey = (g: Pick<Geo, 'city' | 'province' | 'mapped'>) => (!g.mapped ? '' : `${g.city ?? ''}|${g.province ?? ''}`);
export const areaLabel = (g: Pick<Geo, 'city' | 'province'>) => (g.city && g.province ? `${g.city}, ${g.province}` : g.city || (g.province ? `${g.province} (province-wide)` : NEEDS_FIX));
/** Centre of a city (not of any one client): the only position shown to people who may not see exact pins. */
export function areaCentre(city?: string, province?: string): [number, number] {
  const hit = locate(`${city ?? ''} ${province ?? ''}`) ?? (province ? locate(province) : null);
  return hit ? [hit.lat, hit.lng] : PH_CENTER;
}

/* ---------- clients in scope ---------- */
export const segmentOf = (c: Client): 'Residential' | 'Commercial' => (c.type === 'Residential' ? 'Residential' : 'Commercial');
export function stageOf(db: DB, clientId: string): Stage {
  const jobs = live(db.jobs).filter((j) => j.client_id === clientId);
  if (jobs.some((j) => isDone(j.status))) return 'Completed';
  if (jobs.some((j) => !SKIP.includes(j.status))) return 'Booked';
  if (live(db.quotations).some((q) => q.client_id === clientId && ['Draft', 'Sent', 'Approved'].includes(q.status))
    || live(db.ocular_visits).some((v) => v.client_id === clientId && v.status === 'Converted to Quotation')
    || live(db.inquiries).some((i) => i.client_id === clientId && ['Quotation', 'Client Approval'].includes(i.stage))) return 'Quoted';
  return 'Lead';
}
const repeatOf = (db: DB, clientId: string): 'New' | 'Repeat' => (completedJobs(db, clientId).length >= 2 ? 'Repeat' : 'New');

/** A client's service locations: every site used by a booking, ocular visit, quotation or inquiry (plus an ocular-only address); the client address if there is nothing else. */
export interface PlaceRef { key: string; siteId?: string; siteName: string; address: string; geo: Geo }
export function placesOf(db: DB, c: Client): PlaceRef[] {
  const out = new Map<string, PlaceRef>();
  const addSite = (id?: string) => { const s = id ? db.sites.find((x) => x.id === id && !x.deleted_at) : undefined; if (s && !out.has(s.id)) out.set(s.id, { key: s.id, siteId: s.id, siteName: s.name, address: s.address, geo: geoOf(s) }); };
  for (const j of live(db.jobs)) if (j.client_id === c.id && !SKIP.includes(j.status)) addSite(j.site_id);
  for (const q of live(db.quotations)) if (q.client_id === c.id) addSite(q.site_id);
  for (const i of live(db.inquiries)) if (i.client_id === c.id) addSite(i.site_id);
  for (const v of live(db.ocular_visits)) {
    if (v.client_id !== c.id || v.status === 'Cancelled') continue;
    if (v.site_id) addSite(v.site_id); else out.set(`ov:${v.id}`, { key: `ov:${v.id}`, siteName: 'Ocular visit', address: v.location, geo: geoOf(v, v.location) });
  }
  if (!out.size) out.set(`c:${c.id}`, { key: `c:${c.id}`, siteName: 'Client address', address: c.address, geo: geoOf(c) });
  return [...out.values()];
}

/* ---------- one pass over the data ---------- */
export interface ClientRow {
  client: Client; stage: Stage; repeat: 'New' | 'Repeat'; segment: 'Residential' | 'Commercial'; places: PlaceRef[];
  services: ServiceCode[];
}
export interface Scope {
  f: InsightFilters; exec: boolean; T: string;
  clients: ClientRow[]; clientIds: Set<string>;
  jobOk: (j: Job) => boolean;
}
const areaMatch = (g: Geo, f: InsightFilters) => (!f.province || g.province === f.province) && (!f.city || g.city === f.city);

/** The clients and records the filters let through. Every number on the page is computed from this, so filters apply everywhere alike. */
export function scopeOf(db: DB, f: InsightFilters, exec: boolean, T: string): Scope {
  const rows: ClientRow[] = [];
  for (const c of live(db.clients)) {
    if (f.client && c.id !== f.client) continue;
    const segment = segmentOf(c); if (f.segment && segment !== f.segment) continue;
    const repeat = repeatOf(db, c.id); if (f.repeat && repeat !== f.repeat) continue;
    const stage = stageOf(db, c.id); if (f.stage && stage !== f.stage) continue;
    const places = placesOf(db, c).filter((p) => areaMatch(p.geo, f) || (!f.province && !f.city));
    if ((f.province || f.city) && !places.length) continue;
    const services = new Set<ServiceCode>();
    for (const j of live(db.jobs)) if (j.client_id === c.id && !SKIP.includes(j.status)) j.service_codes.forEach((s) => services.add(s));
    for (const v of live(db.ocular_visits)) if (v.client_id === c.id) v.service_codes.forEach((s) => services.add(s));
    if (f.service && !services.has(f.service as ServiceCode)) continue;
    rows.push({ client: c, stage, repeat, segment, places, services: [...services] });
  }
  const clientIds = new Set(rows.map((r) => r.client.id));
  const siteIn = new Map<string, boolean>(); for (const r of rows) for (const p of r.places) if (p.siteId) siteIn.set(p.siteId, true);
  const jobOk = (j: Job) => clientIds.has(j.client_id) && (!f.branch || j.branch_id === f.branch) && (!f.service || j.service_codes.includes(f.service as ServiceCode))
    && (!(f.province || f.city) || siteIn.has(j.site_id));
  return { f, exec, T, clients: rows, clientIds, jobOk };
}

const invOk = (db: DB, s: Scope, i: DB['invoices'][number]) => i.status === 'Approved' && !i.deleted_at && s.clientIds.has(i.client_id) && (!s.f.branch || i.branch_id === s.f.branch)
  && (!s.f.service || i.items.some((it) => it.service_code === s.f.service)) && (!(s.f.province || s.f.city) || !i.job_id || s.jobOk(db.jobs.find((j) => j.id === i.job_id) ?? ({ client_id: '' } as Job)));

/* ---------- map pins ---------- */
export interface Pin {
  key: string; clientId: string; clientName: string; siteName: string; address: string; lat: number; lng: number; precision: NonNullable<Geo['precision']>;
  city?: string; province?: string; stage: Stage; repeat: 'New' | 'Repeat'; segment: string;
  completed: number; services: string[]; lastService?: string; nextFollowUp?: string; followStatus: string;
  billed: number; collected: number; outstanding: number;     // lifetime (Clients page definitions)
}
export interface MapData { pins: Pin[]; unmapped: { clientId: string; clientName: string; table: 'sites' | 'clients' | 'ocular_visits'; id: string; address: string }[]; }

/** Locations active in the date range (a booking, completed job, ocular visit, quotation, inquiry or a new client). Exact pins are built for Admin / CEO only. */
export function mapData(db: DB, s: Scope): MapData {
  const { from, to } = s.f; const pins: Pin[] = []; const unmapped: MapData['unmapped'] = [];
  for (const r of s.clients) {
    const c = r.client;
    const v = s.exec ? clientValue(db, c) : undefined;
    const fol = clientFollow(db, c.id, s.T);
    for (const p of r.places) {
      const siteJobs = live(db.jobs).filter((j) => j.client_id === c.id && !SKIP.includes(j.status) && (p.siteId ? j.site_id === p.siteId : false));
      const active = siteJobs.some((j) => inRange(j.start_at.slice(0, 10), from, to) || (isDone(j.status) && inRange(serviceDate(j), from, to)))
        || live(db.ocular_visits).some((o) => o.client_id === c.id && o.status !== 'Cancelled' && inRange(o.start_at.slice(0, 10), from, to) && (p.siteId ? o.site_id === p.siteId : p.key === `ov:${o.id}`))
        || live(db.quotations).some((q) => q.client_id === c.id && p.siteId && q.site_id === p.siteId && inRange(q.issue_date, from, to))
        || live(db.inquiries).some((i) => i.client_id === c.id && p.siteId && i.site_id === p.siteId && inRange(i.created_at.slice(0, 10), from, to))
        || (!p.siteId && inRange(c.created_at.slice(0, 10), from, to));
      if (!active) continue;
      if (!p.geo.mapped) { unmapped.push({ clientId: c.id, clientName: c.name, table: p.siteId ? 'sites' : p.key.startsWith('ov:') ? 'ocular_visits' : 'clients', id: p.siteId ?? p.key.replace(/^(ov|c):/, ''), address: p.address }); continue; }
      if (!s.exec) continue;                                  // no exact points for anyone else
      const done = siteJobs.filter((j) => isDone(j.status)).sort((a, b) => serviceDate(b).localeCompare(serviceDate(a)));
      pins.push({
        key: `${c.id}:${p.key}`, clientId: c.id, clientName: c.name, siteName: p.siteName, address: p.address, lat: p.geo.lat!, lng: p.geo.lng!, precision: p.geo.precision ?? 'area',
        city: p.geo.city, province: p.geo.province, stage: r.stage, repeat: r.repeat, segment: r.segment,
        completed: done.length, services: [...new Set(siteJobs.flatMap((j) => j.service_codes))].map((x) => db.services.find((d) => d.code === x)?.name ?? x),
        lastService: done[0] ? serviceDate(done[0]) : undefined, nextFollowUp: fol.due, followStatus: fol.status,
        billed: v!.billed, collected: v!.collected, outstanding: v!.outstanding,
      });
    }
  }
  return { pins, unmapped };
}

/* ---------- areas ---------- */
export interface AreaRow {
  key: string; label: string; city?: string; province?: string; lat: number; lng: number;
  clients: number; jobs: number; billed: number; collected: number; outstanding: number; avgJob: number; repeatClients: number;
  topService: string; overdueFollowUps: number; repeatPotential: number; costsPending: boolean; gross?: number;
}
export type AreaSort = 'clients' | 'billed' | 'jobs' | 'outstanding';

/** Per city / area totals for the date range. For non-Admin users the money columns are zero and `exec` is false. */
export function areaRows(db: DB, s: Scope): AreaRow[] {
  const { from, to } = s.f; const T = s.T;
  const acc = new Map<string, AreaRow & { cl: Set<string>; rep: Set<string>; svc: Map<string, number> }>();
  const get = (g: Geo) => {
    const key = areaKey(g); let a = acc.get(key);
    if (!a) { const [lat, lng] = areaCentre(g.city, g.province); a = { key, label: areaLabel(g), city: g.city, province: g.province, lat, lng, clients: 0, jobs: 0, billed: 0, collected: 0, outstanding: 0, avgJob: 0, repeatClients: 0, topService: '—', overdueFollowUps: 0, repeatPotential: 0, costsPending: false, cl: new Set(), rep: new Set(), svc: new Map() }; acc.set(key, a); }
    return a;
  };
  const siteGeo = new Map<string, Geo>(); const homeGeo = new Map<string, Geo>();
  for (const r of s.clients) { homeGeo.set(r.client.id, r.places[0]?.geo ?? { mapped: false }); for (const p of r.places) if (p.siteId) siteGeo.set(p.siteId, p.geo); }
  const clientRow = new Map(s.clients.map((r) => [r.client.id, r]));
  const geoForJob = (j: Job) => siteGeo.get(j.site_id) ?? geoOf(db.sites.find((x) => x.id === j.site_id));
  // clients: counted in every area where they have an active location
  for (const r of s.clients) for (const p of r.places) { if (!p.geo.mapped) continue; const a = get(p.geo); a.cl.add(r.client.id); if (r.repeat === 'Repeat') a.rep.add(r.client.id); }
  const jobsDone = live(db.jobs).filter((j) => s.jobOk(j) && isDone(j.status) && inRange(serviceDate(j), from, to));
  const doneBy = new Map<string, Job[]>();
  for (const j of jobsDone) { const g = geoForJob(j); if (!g.mapped) continue; const a = get(g); a.jobs++; doneBy.set(a.key, [...(doneBy.get(a.key) ?? []), j]); for (const code of j.service_codes) a.svc.set(code, (a.svc.get(code) ?? 0) + 1); }
  for (const j of live(db.jobs).filter((x) => s.jobOk(x) && !SKIP.includes(x.status) && !isDone(x.status) && inRange(x.start_at.slice(0, 10), from, to))) { const g = geoForJob(j); if (g.mapped) for (const code of j.service_codes) { const a = get(g); a.svc.set(code, (a.svc.get(code) ?? 0) + 1); } }
  if (s.exec) {
    const geoForInv = (i: DB['invoices'][number]) => { const j = i.job_id ? db.jobs.find((x) => x.id === i.job_id) : undefined; return j ? geoForJob(j) : homeGeo.get(i.client_id) ?? { mapped: false }; };
    const invs = live(db.invoices).filter((i) => invOk(db, s, i));
    for (const i of invs) { const g = geoForInv(i); if (!g.mapped) continue; const a = get(g); if (inRange(i.issue_date, from, to)) a.billed += invoiceTotals(i).net; a.outstanding += invoiceBalance(db, i); }
    for (const p of live(db.payments)) {
      if (!paymentCounts(p) || !inRange(p.date, from, to) || !s.clientIds.has(p.client_id)) continue;
      const inv = p.invoice_id ? db.invoices.find((x) => x.id === p.invoice_id) : undefined;
      if (inv && !invOk(db, s, inv)) continue;
      const g = inv ? geoForInv(inv) : homeGeo.get(p.client_id) ?? { mapped: false }; if (g.mapped) get(g).collected += p.amount;
    }
  }
  for (const a of acc.values()) {
    a.clients = a.cl.size; a.repeatClients = a.rep.size;
    a.avgJob = a.jobs ? round2(a.billed / a.jobs) : 0;
    a.topService = [...a.svc.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '';
    a.topService = a.topService ? db.services.find((x) => x.code === a.topService)?.name.replace(/ \/ .*/, '') ?? a.topService : '—';
    for (const id of a.cl) { const fo = clientFollow(db, id, T); if (fo.status === 'Overdue') a.overdueFollowUps++; if (fo.status !== 'Booked' && fo.status !== 'Not Interested' && clientRow.get(id)?.stage === 'Completed') a.repeatPotential++; }
    const dj = doneBy.get(a.key) ?? [];
    a.costsPending = !dj.length || dj.some((j) => jobCost(db, j).estimated);
    if (s.exec && !a.costsPending) a.gross = round2(sum(dj, (j) => jobCost(db, j).grossProfit));
  }
  return [...acc.values()].filter((a) => a.key !== '');
}
export const sortAreas = (rows: AreaRow[], by: AreaSort) => [...rows].sort((a, b) => (by === 'clients' ? b.clients - a.clients : by === 'billed' ? b.billed - a.billed : by === 'jobs' ? b.jobs - a.jobs : b.outstanding - a.outstanding) || b.clients - a.clients || a.label.localeCompare(b.label));
export function areaHighlights(rows: AreaRow[], exec: boolean) {
  const top = (k: keyof AreaRow, only?: (a: AreaRow) => boolean) => [...rows].filter(only ?? (() => true)).sort((a, b) => Number(b[k]) - Number(a[k]) || a.label.localeCompare(b.label)).slice(0, 5);
  return {
    dense: top('clients', (a) => a.clients > 0),
    revenue: exec ? top('billed', (a) => a.billed > 0) : [],
    overdue: top('overdueFollowUps', (a) => a.overdueFollowUps > 0),
    unpaid: exec ? top('outstanding', (a) => a.outstanding > 0.005) : [],
    repeat: top('repeatPotential', (a) => a.repeatPotential > 0),
  };
}

/* ---------- KPI cards ---------- */
export interface Kpis {
  revenue?: number; collections?: number; receivables?: number; overdue?: number;
  gross?: { value: number; margin: number } | 'pending'; pendingJobs: number;
  scheduledMonth: number; confirmedWeek: number; inProgress: number; completedMonth: number; newClients: number; repeatRate: number; repeatOf: number; followUpsWeek: number;
}
export function kpis(db: DB, s: Scope): Kpis {
  const T = s.T; const mS = monthStart(T), mE = monthEnd(T), wS = weekStart(T), wE = addDays(wS, 6);
  const jobs = live(db.jobs).filter((j) => s.jobOk(j));
  const k: Kpis = {
    pendingJobs: 0,
    scheduledMonth: jobs.filter((j) => inRange(j.start_at.slice(0, 10), mS, mE) && !SKIP.includes(j.status)).length,
    confirmedWeek: jobs.filter((j) => inRange(j.start_at.slice(0, 10), wS, wE) && !SKIP.includes(j.status) && j.status !== 'Pending').length,
    inProgress: jobs.filter((j) => ['On Site', 'In Progress'].includes(j.status)).length,
    completedMonth: jobs.filter((j) => isDone(j.status) && inRange(serviceDate(j), mS, mE)).length,
    newClients: s.clients.filter((r) => inRange(r.client.created_at.slice(0, 10), mS, mE)).length,
    repeatRate: 0, repeatOf: 0,
    followUpsWeek: followUpStats(db, T).week.filter((a) => s.clientIds.has(a.f.client_id)).length,
  };
  const done = s.clients.filter((r) => completedJobs(db, r.client.id).length >= 1);
  k.repeatOf = done.length; k.repeatRate = done.length ? Math.round((done.filter((r) => r.repeat === 'Repeat').length / done.length) * 100) : 0;
  if (s.exec) {
    const invs = live(db.invoices).filter((i) => invOk(db, s, i));
    k.revenue = round2(sum(invs.filter((i) => inRange(i.issue_date, mS, mE)), (i) => invoiceTotals(i).net));
    k.collections = round2(sum(live(db.payments).filter((p) => paymentCounts(p) && inRange(p.date, mS, mE) && s.clientIds.has(p.client_id) && (!p.invoice_id || invs.some((i) => i.id === p.invoice_id))), (p) => p.amount));
    k.receivables = round2(sum(invs, (i) => invoiceBalance(db, i)));
    k.overdue = round2(sum(invs.filter((i) => i.due_date < T), (i) => invoiceBalance(db, i)));
    // gross profit only when every completed job of the month has actual (not estimated) costs
    const doneJobs = jobs.filter((j) => isDone(j.status) && inRange(serviceDate(j), mS, mE));
    k.pendingJobs = doneJobs.filter((j) => jobCost(db, j).estimated).length;
    if (!doneJobs.length || k.pendingJobs) k.gross = 'pending';
    else { const p = profitAndLoss(db, mS, mE, { branch: s.f.branch || undefined, client: s.f.client || undefined, service: s.f.service || undefined }); k.gross = { value: p.grossProfit, margin: p.grossMargin }; }
  }
  return k;
}

/* ---------- trend ---------- */
export type TrendRange = 'days' | 'weeks' | 'months6' | 'months12';
export interface TrendPoint { label: string; revenue: number; collections: number }
export function trend(db: DB, s: Scope, range: TrendRange): TrendPoint[] {
  const T = s.T; const buckets: { label: string; a: string; b: string }[] = [];
  if (range === 'days') for (let k = 13; k >= 0; k--) { const d = addDays(T, -k); buckets.push({ label: d.slice(5), a: d, b: d }); }
  else if (range === 'weeks') for (let k = 11; k >= 0; k--) { const a = addDays(weekStart(T), -7 * k); buckets.push({ label: a.slice(5), a, b: addDays(a, 6) }); }
  else { const n = range === 'months6' ? 6 : 12; let m = monthStart(T); const list: string[] = [m]; for (let k = 1; k < n; k++) { m = monthStart(addDays(m, -1)); list.unshift(m); } for (const a of list) buckets.push({ label: a.slice(0, 7), a, b: monthEnd(a) }); }
  if (!s.exec) return buckets.map((b) => ({ label: b.label, revenue: 0, collections: 0 }));
  const invs = live(db.invoices).filter((i) => invOk(db, s, i)); const ids = new Set(invs.map((i) => i.id));
  const pays = live(db.payments).filter((p) => paymentCounts(p) && s.clientIds.has(p.client_id) && (!p.invoice_id || ids.has(p.invoice_id)));
  return buckets.map((b) => ({ label: b.label, revenue: round2(sum(invs.filter((i) => inRange(i.issue_date, b.a, b.b)), (i) => invoiceTotals(i).net)), collections: round2(sum(pays.filter((p) => inRange(p.date, b.a, b.b)), (p) => p.amount)) }));
}

/* ---------- operations today, attention, growth ---------- */
export function operationsToday(db: DB, s: Scope) {
  const T = s.T;
  const jobs = live(db.jobs).filter((j) => s.jobOk(j) && j.start_at.startsWith(T) && !SKIP.includes(j.status));
  const crew = new Set(jobs.flatMap((j) => [...j.crew_ids, ...(j.leader_id ? [j.leader_id] : [])]));
  return {
    jobs, crewAssigned: crew.size, crewIn: live(db.attendance).filter((a) => a.date === T && a.clock_in && !a.clock_out).length,
    ocular: live(db.ocular_visits).filter((v) => s.clientIds.has(v.client_id) && v.start_at.startsWith(T) && ['Scheduled', 'Confirmed'].includes(v.status)),
    pendingQuotes: live(db.quotations).filter((q) => s.clientIds.has(q.client_id) && ['Draft', 'Sent'].includes(q.status)),
    awaitingHandover: live(db.jobs).filter((j) => s.jobOk(j) && j.status === 'In Progress' && !live(db.workflows).some((w) => w.job_id === j.id && w.rep_client_sig)),
    backJobs: live(db.back_jobs).filter((b) => isOpenBackJob(b) && s.clientIds.has(b.client_id)),
  };
}

export interface Attention { key: string; label: string; count: number; detail: string; to: string; tone: 'bad' | 'warn' | 'info' }
export function attention(db: DB, s: Scope, money: (n: number) => string): Attention[] {
  const T = s.T; const out: Attention[] = [];
  if (s.exec) {
    const od = live(db.invoices).filter((i) => invOk(db, s, i) && i.due_date < T && invoiceBalance(db, i) > 0.005);
    out.push({ key: 'ar', label: 'Overdue receivables', count: od.length, detail: od.length ? `${money(sum(od, (i) => invoiceBalance(db, i)))} past due` : 'Nothing past due', to: '/finance?tab=receivables', tone: 'bad' });
  }
  const sent = live(db.quotations).filter((q) => s.clientIds.has(q.client_id) && q.status === 'Sent');
  out.push({ key: 'quotes', label: 'Quotations awaiting response', count: sent.length, detail: sent.length ? `oldest sent ${sent.map((q) => q.sent_at ?? q.issue_date).sort()[0]?.slice(0, 10)}` : 'None waiting', to: '/sales', tone: 'warn' });
  const fo = [...s.clientIds].filter((id) => clientFollow(db, id, T).status === 'Overdue');
  out.push({ key: 'fu', label: 'Follow-ups overdue', count: fo.length, detail: fo.length ? 'Clients past their 6-month / 1-year date' : 'All on time', to: '/clients', tone: 'bad' });
  const ov = live(db.ocular_visits).filter((v) => s.clientIds.has(v.client_id) && v.status === 'Completed');
  out.push({ key: 'ocular', label: 'Ocular visits awaiting quotation', count: ov.length, detail: ov.length ? 'Completed, no quotation made yet' : 'None waiting', to: '/sales', tone: 'warn' });
  const fb = live(db.client_feedback).filter((f) => s.clientIds.has(f.client_id) && f.follow_up === 'Required');
  out.push({ key: 'fb', label: 'Low-feedback follow-up', count: fb.length, detail: fb.length ? 'Not-satisfied clients to call' : 'None open', to: '/jobs', tone: 'bad' });
  const bj = live(db.back_jobs).filter((b) => isOpenBackJob(b) && s.clientIds.has(b.client_id));
  out.push({ key: 'bj', label: 'Open back jobs', count: bj.length, detail: bj.length ? 'Rework not yet closed' : 'None open', to: '/jobs', tone: 'warn' });
  const eq = live(db.assets).filter((a) => a.status === 'Missing' || a.status === 'Damaged').length + live(db.incidents).filter((i) => ['Open', 'Investigating'].includes(i.status)).length;
  out.push({ key: 'eq', label: 'Equipment issues', count: eq, detail: eq ? 'Missing / damaged items and open incidents' : 'No issues', to: '/assets?tab=incidents', tone: 'warn' });
  return out;
}

export function growth(db: DB, s: Scope) {
  const T = s.T; const mS = monthStart(T), mE = monthEnd(T);
  const fu = followUpStats(db, T);
  const mine = (f: FollowUp) => s.clientIds.has(f.client_id);
  const acted = live(db.followups).filter((f) => mine(f) && f.status !== 'Superseded' && !!f.actioned_at);
  const booked = acted.filter((f) => f.status === 'Booked');
  const newC = s.clients.filter((r) => inRange(r.client.created_at.slice(0, 10), mS, mE));
  const done = s.clients.filter((r) => completedJobs(db, r.client.id).length >= 1);
  return {
    newClients: newC.length, repeatClients: done.filter((r) => r.repeat === 'Repeat').length, activeClients: done.length,
    due6: fu.month.filter((a) => mine(a.f) && a.f.slot === 'short').length, due12: fu.month.filter((a) => mine(a.f) && a.f.slot === 'long').length,
    acted: acted.length, booked: booked.length, conversion: acted.length ? Math.round((booked.length / acted.length) * 100) : 0,
  };
}

/** Provinces and cities present in the data (for the filter lists). */
export function areaOptions(db: DB): { provinces: string[]; cities: { city: string; province: string }[] } {
  const prov = new Set<string>(); const cities = new Map<string, string>();
  for (const c of live(db.clients)) for (const p of placesOf(db, c)) { if (!p.geo.mapped) continue; if (p.geo.province) prov.add(p.geo.province); if (p.geo.city) cities.set(p.geo.city, p.geo.province ?? ''); }
  return { provinces: [...prov].sort(), cities: [...cities.entries()].map(([city, province]) => ({ city, province })).sort((a, b) => a.city.localeCompare(b.city)) };
}

/** Net revenue per service line for the period (approved invoices in scope), largest first. Admin / CEO only. */
export function serviceRevenue(db: DB, s: Scope): { name: string; value: number }[] {
  if (!s.exec) return [];
  const out: Record<string, number> = {};
  for (const i of live(db.invoices).filter((x) => invOk(db, s, x) && inRange(x.issue_date, s.f.from, s.f.to))) {
    const t = docTotals(i.items, i.discount, i.vat_mode, i.vat_rate); const lines = sum(i.items, (x) => x.qty * x.rate - x.discount) || 1;
    for (const it of i.items) out[it.service_code] = (out[it.service_code] ?? 0) + ((it.qty * it.rate - it.discount) / lines) * t.net;
  }
  return Object.entries(out).map(([code, v]) => ({ name: db.services.find((x) => x.code === code)?.name.replace(/ \/ .*/, '') ?? code, value: round2(v) })).sort((a, b) => b.value - a.value);
}
