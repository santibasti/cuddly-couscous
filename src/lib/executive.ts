// Executive tab: every number is worked out here, by code, from the company's own records.
// The AI (supabase/functions/ai-executive) only reads this summary and writes the analysis — it never calculates the figures.
import type { DB, Job } from './types';
import { docTotals, invoiceBalance, invoiceTotals, paymentCounts, profitAndLoss } from './business';
import { addDays, diffDays, dow, monthEnd, monthStart, round2, sum } from './util';

export interface MonthRow { month: string; revenue: number; collected: number; grossProfit: number; opex: number; jobs: number; partial?: boolean }
export interface ForecastMonth { month: string; booked: number; runRate: number; base: number; low: number; high: number; bookedShare: number }
export interface CapacityDay { date: string; available: number; demand: number; pct: number; jobs: number; vehicles: number }
export type Severity = 'high' | 'medium' | 'low' | 'ok';
export interface Constraint { key: string; title: string; severity: Severity; metric: string; detail: string; action: string }
export interface ServiceRow { name: string; revenue: number; share: number; grossMargin: number | null }
export type Segment = 'Residential' | 'Commercial' | 'Other';
export interface SegmentRow { segment: Segment; revenue: number; share: number; jobs: number; avgJob: number | null; clients: number; grossMargin: number | null; collected: number; receivables: number }
export interface TypeRow { type: string; revenue: number; share: number; clients: number }
export interface SegmentReport { from: string; to: string; total: number; rows: SegmentRow[]; other: TypeRow[]; months: { month: string; Residential: number; Commercial: number; Other: number }[]; headline: string }
export interface ExecData {
  asOf: string;
  months: MonthRow[];
  forecast: ForecastMonth[];
  forecastMethod: string;
  kpis: {
    revenue90: number; grossMargin90: number | null; netMargin90: number | null; collected90: number;
    receivables: number; overdue: number; overduePct: number; dso: number | null;
    clients: number; repeatRate: number | null; top3Share: number | null; avgJobValue: number | null;
    quotesOpen: number; quotesOpenValue: number; winRate: number | null; approvedUnbooked: number; approvedUnbookedValue: number;
    jobs90: number; cancelRate: number | null; lateRate: number | null; rating: number | null; backJobRate: number | null;
  };
  services: ServiceRow[];
  segments: SegmentReport;
  capacity: {
    fieldStaff: number; avgTeamSize: number; vehicles: number;
    days: CapacityDay[];
    avgUtilNext28: number | null; avgUtilLast28: number | null; peakPct: number; overbookedDays: number; tightDays: number;
    firstOpenDay: string | null; leadTimeDays: number | null; maxCrewsAtOnce: number;
    peakWeekday: string | null;
  };
  constraints: Constraint[];
  verdict: { constraint: 'operations' | 'demand' | 'balanced' | 'unclear'; text: string };
}

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const OFF = new Set(['Cancelled', 'Rescheduled']);
const OPEN_JOB = new Set(['Pending', 'Confirmed', 'Dispatch Checklist Pending', 'Dispatched', 'On Site', 'In Progress']);
const live = <T extends { deleted_at?: string | null }>(a: T[]) => a.filter((x) => !x.deleted_at);
const pct = (n: number, d: number) => (d > 0 ? n / d : null);
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const stdev = (a: number[]) => { const m = mean(a); return a.length > 1 ? Math.sqrt(mean(a.map((x) => (x - m) ** 2))) : 0; };
const monthShift = (month: string, n: number) => { const d = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const crewOf = (j: Job) => new Set([...j.crew_ids, ...(j.leader_id ? [j.leader_id] : [])]);
const jobDates = (j: Job): string[] => { const out: string[] = []; for (let d = j.start_at.slice(0, 10); d <= j.end_at.slice(0, 10) && out.length < 62; d = addDays(d, 1)) out.push(d); return out; };

/** Revenue by month (net of VAT, billed), collections, margins and jobs, for the last `n` months including the current one. */
export function monthlyHistory(db: DB, T: string, n = 12): MonthRow[] {
  const cur = T.slice(0, 7); const rows: MonthRow[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = monthShift(cur, -i); const from = `${m}-01`; const to = monthEnd(from);
    const pl = profitAndLoss(db, from, to);
    rows.push({
      month: m, revenue: round2(pl.revenue), grossProfit: round2(pl.grossProfit), opex: round2(pl.opex),
      collected: round2(sum(live(db.payments).filter((p) => paymentCounts(p) && p.date >= from && p.date <= to), (p) => p.amount + p.wht_amount)),
      jobs: live(db.jobs).filter((j) => j.start_at.slice(0, 7) === m && !OFF.has(j.status)).length,
      ...(m === cur ? { partial: true } : {}),
    });
  }
  // leave out leading months before the business had any billing
  const first = rows.findIndex((r) => r.revenue > 0 || r.jobs > 0);
  return first > 0 ? rows.slice(first) : rows;
}

/** Next three months: what is already booked, what the recent run-rate suggests, and a range from how bumpy the months have been. */
export function forecastMonths(db: DB, history: MonthRow[], T: string): { rows: ForecastMonth[]; method: string } {
  const cur = T.slice(0, 7);
  const done = history.filter((h) => !h.partial && h.revenue > 0);
  const last6 = done.slice(-6); const last3 = done.slice(-3);
  const base3 = mean(last3.map((h) => h.revenue));
  // trend: slope of a straight line through the last 6 months as a share of their average, halved and capped so one odd month cannot run away
  let growth = 0;
  if (last6.length >= 4) {
    const xs = last6.map((_, i) => i); const ys = last6.map((h) => h.revenue); const mx = mean(xs); const my = mean(ys);
    const slope = sum(xs, (x) => (x - mx) * (ys[x] - my)) / Math.max(1e-9, sum(xs, (x) => (x - mx) ** 2));
    growth = my > 0 ? Math.max(-0.12, Math.min(0.12, (slope / my) * 0.5)) : 0;
  }
  const vol = last6.length >= 3 ? Math.max(0.1, Math.min(0.4, stdev(last6.map((h) => h.revenue)) / Math.max(1, mean(last6.map((h) => h.revenue))))) : 0.25;
  const jobsBooked = live(db.jobs).filter((j) => OPEN_JOB.has(j.status));
  const bookedIn = (m: string) => sum(jobsBooked.filter((j) => j.start_at.slice(0, 7) === m), (j) => j.contract_amount);
  const curBilled = history.find((h) => h.month === cur)?.revenue ?? 0;
  const rows: ForecastMonth[] = [];
  for (let i = 0; i < 3; i++) {
    const m = monthShift(cur, i);
    const runRate = round2(base3 * (1 + growth) ** (i + 1));
    const booked = round2(bookedIn(m) + (i === 0 ? curBilled : 0));
    const base = round2(Math.max(runRate, booked));
    rows.push({ month: m, booked, runRate, base, low: round2(Math.max(booked, base * (1 - vol))), high: round2(base * (1 + vol)), bookedShare: base > 0 ? Math.min(1, booked / base) : 0 });
  }
  return { rows, method: `Run-rate = average of the last ${last3.length || 0} full months (${round2(base3).toLocaleString('en-PH')}) adjusted by a damped ${Math.round(growth * 1000) / 10}% monthly trend; "booked" = the agreed price of jobs already scheduled (plus billed so far this month). Forecast = the higher of the two, with a ±${Math.round(vol * 100)}% range taken from how much your monthly revenue has varied.` };
}

/** Crew, vehicle and calendar capacity for the next 28 days against what is booked. */
export function capacityDays(db: DB, T: string, days = 28): { days: CapacityDay[]; fieldStaff: number; avgTeamSize: number; vehicles: number } {
  const staff = live(db.employees).filter((e) => e.status !== 'inactive' && e.department === 'Field Operations');
  const vehicles = live(db.assets).filter((a) => a.category === 'Vehicle' && !['Damaged', 'Out of Service', 'Missing'].includes(a.status)).length || live(db.assets).filter((a) => a.category === 'Vehicle').length;
  const holidays = new Set(live(db.holidays).map((h) => h.date));
  const past = live(db.jobs).filter((j) => !OFF.has(j.status) && j.start_at.slice(0, 10) >= addDays(T, -60) && j.start_at.slice(0, 10) < T);
  const sizes = past.map((j) => crewOf(j).size).filter((n) => n > 0);
  const avgTeamSize = sizes.length ? mean(sizes) : 4;
  const jobs = live(db.jobs).filter((j) => !OFF.has(j.status) && !['Closed', 'Completed'].includes(j.status));
  const out: CapacityDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(T, i);
    const available = holidays.has(date) ? 0 : staff.filter((e) => e.rest_day !== dow(date)).length;
    const todays = jobs.filter((j) => jobDates(j).includes(date));
    const demand = new Set(todays.flatMap((j) => [...crewOf(j)])).size;
    out.push({ date, available, demand, pct: available > 0 ? demand / available : demand > 0 ? 9.99 : 0, jobs: todays.length, vehicles: new Set(todays.map((j) => j.vehicle_id).filter(Boolean)).size });
  }
  return { days: out, fieldStaff: staff.length, avgTeamSize, vehicles };
}

export function buildExecutive(db: DB, T: string): ExecData {
  const history = monthlyHistory(db, T, 12);
  const fc = forecastMonths(db, history, T);
  const from90 = addDays(T, -90);
  const pl = profitAndLoss(db, from90, T);
  const inv = live(db.invoices).filter((i) => i.status === 'Approved');
  const receivables = sum(inv, (i) => invoiceBalance(db, i));
  const overdue = sum(inv.filter((i) => i.due_date < T), (i) => invoiceBalance(db, i));
  const revPerDay = pl.revenue / 90;
  const jobs90 = live(db.jobs).filter((j) => j.start_at.slice(0, 10) >= from90 && j.start_at.slice(0, 10) <= T);
  const jobsDone90 = jobs90.filter((j) => ['Completed', 'Work Completed', 'Leaving Site', 'Arrived at HQ', 'Closed'].includes(j.status));
  const clientsBilled = new Map<string, { n: number; rev: number }>();
  for (const i of inv) { const c = clientsBilled.get(i.client_id) ?? { n: 0, rev: 0 }; c.n += 1; c.rev += invoiceTotals(i).net; clientsBilled.set(i.client_id, c); }
  const revByClient = [...clientsBilled.values()].map((c) => c.rev).sort((a, b) => b - a);
  const totalRev = sum(revByClient, (x) => x);
  const quotesOpen = live(db.quotations).filter((q) => ['Draft', 'Sent'].includes(q.status));
  const decided = live(db.quotations).filter((q) => ['Approved', 'Rejected'].includes(q.status));
  const approved = live(db.quotations).filter((q) => q.status === 'Approved');
  const approvedUnbooked = approved.filter((q) => !live(db.jobs).some((j) => j.quotation_id === q.id) && !live(db.invoices).some((i) => i.quotation_id === q.id && i.status === 'Approved'));
  const val = (q: DB['quotations'][number]) => docTotals(q.items, q.discount, q.vat_mode, q.vat_rate).net;
  const att90 = live(db.attendance).filter((a) => a.date >= from90 && a.clock_in);
  const fb = live(db.client_feedback).filter((f) => f.submitted_at.slice(0, 10) >= from90);
  const stars = fb.map((f) => (f.q_quality ? mean([f.q_quality, f.q_professionalism ?? f.q_quality, f.q_communication ?? f.q_quality]) : f.rating === 3 ? 5 : f.rating === 2 ? 4 : 1));

  // by service
  const svcRev = new Map<string, number>();
  for (const i of inv.filter((x) => x.issue_date >= from90 && x.issue_date <= T)) { const t = invoiceTotals(i).net; const lines = i.items.length || 1; for (const it of i.items) svcRev.set(it.service_code, (svcRev.get(it.service_code) ?? 0) + t / lines); }
  const services: ServiceRow[] = [...svcRev.entries()].map(([code, revenue]) => {
    const p = profitAndLoss(db, from90, T, { service: code });
    return { name: db.services.find((s) => s.code === code)?.name.replace(/ \/ .*/, '') ?? code, revenue: round2(revenue), share: totalRev > 0 ? revenue / totalRev : 0, grossMargin: p.revenue > 0 ? p.grossMargin / 100 : null };
  }).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  // capacity
  const cap = capacityDays(db, T, 28);
  const usedNext = sum(cap.days, (d) => Math.min(d.demand, d.available)); const availNext = sum(cap.days, (d) => d.available);
  const lastDays: { demand: number; available: number }[] = [];
  const staff = live(db.employees).filter((e) => e.status !== 'inactive' && e.department === 'Field Operations');
  for (let i = 1; i <= 28; i++) {
    const d = addDays(T, -i); const worked = new Set(att90.filter((a) => a.date === d && a.kind === 'Present').map((a) => a.employee_id));
    lastDays.push({ demand: worked.size, available: staff.filter((e) => e.rest_day !== dow(d)).length });
  }
  const avgUtilLast28 = pct(sum(lastDays, (x) => Math.min(x.demand, x.available)), sum(lastDays, (x) => x.available));
  const avgUtilNext28 = pct(usedNext, availNext);
  const overbookedDays = cap.days.filter((d) => d.available > 0 && d.pct > 1).length;
  const tightDays = cap.days.filter((d) => d.available > 0 && d.pct >= 0.85 && d.pct <= 1).length;
  const peakPct = Math.max(0, ...cap.days.filter((d) => d.available > 0).map((d) => d.pct));
  const firstOpen = cap.days.find((d, i) => i > 0 && d.available > 0 && d.pct < 0.7 && dow(d.date) !== 0)?.date ?? null;
  const byWeekday = new Array(7).fill(0); for (const d of cap.days) byWeekday[dow(d.date)] += d.demand;
  const peakW = byWeekday.indexOf(Math.max(...byWeekday)); const peakWeekday = Math.max(...byWeekday) > 0 ? WEEKDAY[peakW] : null;
  const upcoming = live(db.jobs).filter((j) => !OFF.has(j.status) && j.start_at.slice(0, 10) >= T && j.start_at.slice(0, 10) <= addDays(T, 60));
  const lead = upcoming.map((j) => diffDays(j.start_at.slice(0, 10), j.booking_date ?? j.created_at.slice(0, 10))).filter((n) => n >= 0 && n < 365);
  const leadTimeDays = lead.length ? round2(mean(lead)) : null;
  const maxCrewsAtOnce = Math.floor(Math.max(0, ...cap.days.map((d) => d.available)) / Math.max(1, cap.avgTeamSize));

  const kpis: ExecData['kpis'] = {
    revenue90: round2(pl.revenue), grossMargin90: pl.revenue > 0 ? pl.grossMargin / 100 : null, netMargin90: pl.revenue > 0 ? pl.netMargin / 100 : null,
    collected90: round2(sum(live(db.payments).filter((p) => paymentCounts(p) && p.date >= from90 && p.date <= T), (p) => p.amount + p.wht_amount)),
    receivables: round2(receivables), overdue: round2(overdue), overduePct: receivables > 0 ? overdue / receivables : 0, dso: revPerDay > 0 ? round2(receivables / revPerDay) : null,
    clients: clientsBilled.size, repeatRate: clientsBilled.size ? [...clientsBilled.values()].filter((c) => c.n >= 2).length / clientsBilled.size : null,
    top3Share: totalRev > 0 ? sum(revByClient.slice(0, 3), (x) => x) / totalRev : null,
    avgJobValue: jobsDone90.length && pl.revenue > 0 ? round2(pl.revenue / jobsDone90.length) : null,
    quotesOpen: quotesOpen.length, quotesOpenValue: round2(sum(quotesOpen, val)), winRate: pct(decided.filter((q) => q.status === 'Approved').length, decided.length),
    approvedUnbooked: approvedUnbooked.length, approvedUnbookedValue: round2(sum(approvedUnbooked, val)),
    jobs90: jobs90.length, cancelRate: pct(jobs90.filter((j) => OFF.has(j.status)).length, jobs90.length),
    lateRate: pct(att90.filter((a) => a.late_min > db.settings.grace_minutes).length, att90.length),
    rating: stars.length ? round2(mean(stars)) : null,
    backJobRate: pct(live(db.back_jobs).filter((b) => b.created_at.slice(0, 10) >= from90).length, Math.max(1, jobsDone90.length)),
  };

  // ---- is operations the constraint? ----
  const constraints: Constraint[] = [];
  const add = (c: Constraint) => constraints.push(c);
  const crewHigh = overbookedDays > 0 || tightDays >= 3 || (avgUtilNext28 ?? 0) >= 0.8;
  add({
    key: 'crew', title: 'Crew capacity', severity: overbookedDays > 0 ? 'high' : crewHigh ? 'medium' : (avgUtilNext28 ?? 0) < 0.45 ? 'low' : 'ok',
    metric: `${Math.round((avgUtilNext28 ?? 0) * 100)}% of crew-days booked over the next 28 days; busiest day ${Math.round(peakPct * 100)}%`,
    detail: `${cap.fieldStaff} field staff, teams of about ${round2(cap.avgTeamSize)}, so at most ${maxCrewsAtOnce} crew${maxCrewsAtOnce === 1 ? '' : 's'} can work at once. ${overbookedDays} day(s) need more people than are available and ${tightDays} more are above 85%.`,
    action: overbookedDays > 0 ? 'Move or split the overbooked days, or add a trained trainee / contract crew for the peaks.' : crewHigh ? 'Hold new bookings off the tight days and plan the next hire before the busy weeks.' : 'There is room to take more work; the limit is not the crew.',
  });
  add({
    key: 'vehicles', title: 'Vehicles', severity: cap.vehicles > 0 && cap.days.some((d) => d.vehicles > cap.vehicles) ? 'high' : cap.vehicles > 0 && cap.days.some((d) => d.jobs > cap.vehicles) ? 'medium' : 'ok',
    metric: `${cap.vehicles} vehicle${cap.vehicles === 1 ? '' : 's'}; most jobs on one day: ${Math.max(0, ...cap.days.map((d) => d.jobs))}`,
    detail: cap.days.some((d) => d.jobs > cap.vehicles) ? 'On some days there are more jobs than vehicles, so crews must share a vehicle or one job waits.' : 'Vehicles cover the booked jobs.',
    action: 'If this repeats weekly, a second vehicle or staggered start times removes the bottleneck.',
  });
  add({
    key: 'leadtime', title: 'How soon a client can be served', severity: leadTimeDays !== null && leadTimeDays > 21 ? 'high' : leadTimeDays !== null && leadTimeDays > 10 ? 'medium' : 'ok',
    metric: `${leadTimeDays ?? '—'} days from booking to service; next open day ${firstOpen ?? 'none in 28 days'}`,
    detail: firstOpen && diffDays(firstOpen, T) > 10 ? `The calendar is full until ${firstOpen}. Clients who want service sooner will go elsewhere.` : 'New clients can be fitted in within about two weeks.',
    action: 'A long wait is the clearest sign operations, not sales, limit growth.',
  });
  add({
    key: 'backlog', title: 'Approved work not yet scheduled', severity: approvedUnbooked.length >= 5 ? 'high' : approvedUnbooked.length >= 2 ? 'medium' : 'ok',
    metric: `${approvedUnbooked.length} approved quotation(s) worth about ${Math.round(kpis.approvedUnbookedValue).toLocaleString('en-PH')}`,
    detail: approvedUnbooked.length ? 'Clients said yes but there is no booking yet: revenue is waiting on scheduling, not on selling.' : 'Everything approved has been booked.',
    action: 'Book these first; they are the cheapest revenue you have.',
  });
  add({
    key: 'quotes', title: 'Quotations waiting for an answer', severity: quotesOpen.length >= 10 ? 'medium' : 'ok',
    metric: `${quotesOpen.length} open, about ${Math.round(kpis.quotesOpenValue).toLocaleString('en-PH')}; win rate ${kpis.winRate === null ? '—' : Math.round(kpis.winRate * 100) + '%'}`,
    detail: 'Open quotations that go quiet are lost sales.', action: 'Follow up within 3 days; track which ones close.',
  });
  add({
    key: 'reliability', title: 'Reliability on the day', severity: (kpis.lateRate ?? 0) > 0.2 || (kpis.cancelRate ?? 0) > 0.12 ? 'medium' : 'ok',
    metric: `late arrivals ${kpis.lateRate === null ? '—' : Math.round(kpis.lateRate * 100) + '%'}; cancelled / rescheduled ${kpis.cancelRate === null ? '—' : Math.round(kpis.cancelRate * 100) + '%'}; back jobs ${kpis.backJobRate === null ? '—' : Math.round(kpis.backJobRate * 100) + '%'}`,
    detail: 'Lateness, reschedules and redo jobs use up capacity without earning anything.', action: 'Fix the top cause first (departure time, equipment readiness, client access).',
  });
  add({
    key: 'cash', title: 'Cash tied up in unpaid bills', severity: (kpis.overduePct ?? 0) > 0.3 ? 'high' : (kpis.overduePct ?? 0) > 0.15 ? 'medium' : 'ok',
    metric: `receivables ${Math.round(receivables).toLocaleString('en-PH')}, overdue ${Math.round(kpis.overduePct * 100)}%; about ${kpis.dso ?? '—'} days of sales outstanding`,
    detail: 'Slow collections limit how fast you can pay crew, buy supplies and hire.', action: 'Call overdue accounts weekly; ask for a deposit on large jobs.',
  });
  if ((kpis.top3Share ?? 0) > 0.5) add({ key: 'concentration', title: 'Dependence on a few clients', severity: 'medium', metric: `top 3 clients = ${Math.round((kpis.top3Share ?? 0) * 100)}% of revenue`, detail: 'Losing one of them would hurt badly.', action: 'Grow the number of regular clients before taking on more of the same.' });

  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2, ok: 3 };
  constraints.sort((a, b) => order[a.severity] - order[b.severity]);

  let verdict: ExecData['verdict'];
  const opsTight = overbookedDays > 0 || tightDays >= 3 || (avgUtilNext28 ?? 0) >= 0.8 || (leadTimeDays ?? 0) > 14 || approvedUnbooked.length >= 3;
  const demandSlack = (avgUtilNext28 ?? 1) < 0.55 && overbookedDays === 0 && (leadTimeDays ?? 99) <= 10;
  if (availNext === 0 || cap.fieldStaff === 0) verdict = { constraint: 'unclear', text: 'There are no field staff on the calendar, so capacity cannot be measured yet.' };
  else if (opsTight) verdict = { constraint: 'operations', text: 'Yes — operations are the constraint. The calendar is close to full, work is waiting to be scheduled, or clients wait a long time. More sales will not help until capacity grows or scheduling improves.' };
  else if (demandSlack) verdict = { constraint: 'demand', text: 'No — operations are not the constraint. Crews have spare days, so growth is limited by how much work you win. Put effort into sales, follow-ups and repeat business.' };
  else verdict = { constraint: 'balanced', text: 'Balanced for now: there is some spare capacity but not much. Watch the busiest days and the booking backlog as sales grow.' };

  return {
    asOf: T, months: history, forecast: fc.rows, forecastMethod: fc.method, kpis, services, segments: segmentReport(db, addDays(T, -90), T),
    capacity: { fieldStaff: cap.fieldStaff, avgTeamSize: round2(cap.avgTeamSize), vehicles: cap.vehicles, days: cap.days, avgUtilNext28, avgUtilLast28, peakPct, overbookedDays, tightDays, firstOpenDay: firstOpen, leadTimeDays, maxCrewsAtOnce, peakWeekday },
    constraints, verdict,
  };
}

/** What is sent to the AI: totals, rates and trends only — no client, staff or site names, TINs or individual pay. */
export function aiSummary(d: ExecData) {
  const r = (n: number | null | undefined, k = 2) => (n === null || n === undefined ? null : Math.round(n * 10 ** k) / 10 ** k);
  return {
    as_of: d.asOf, currency: 'PHP (₱)',
    monthly: d.months.map((m) => ({ month: m.month, revenue_ex_vat: m.revenue, collected: m.collected, gross_profit: m.grossProfit, operating_expenses: m.opex, jobs: m.jobs, partial_month: !!m.partial })),
    forecast: { method: d.forecastMethod, next_months: d.forecast.map((f) => ({ month: f.month, booked: f.booked, run_rate: f.runRate, base: f.base, low: f.low, high: f.high, booked_share: r(f.bookedShare) })) },
    last_90_days: { ...d.kpis, grossMargin90: r(d.kpis.grossMargin90), netMargin90: r(d.kpis.netMargin90), overduePct: r(d.kpis.overduePct), repeatRate: r(d.kpis.repeatRate), top3Share: r(d.kpis.top3Share), winRate: r(d.kpis.winRate), cancelRate: r(d.kpis.cancelRate), lateRate: r(d.kpis.lateRate), backJobRate: r(d.kpis.backJobRate) },
    services_last_90_days: d.services.map((s) => ({ service: s.name, revenue: s.revenue, share: r(s.share), gross_margin: r(s.grossMargin) })),
    revenue_by_customer_segment_last_90_days: d.segments.rows.map((x) => ({ segment: x.segment, revenue: x.revenue, share: r(x.share), jobs: x.jobs, avg_job_value: x.avgJob, gross_margin: r(x.grossMargin) })),
    capacity_next_28_days: { field_staff: d.capacity.fieldStaff, average_team_size: d.capacity.avgTeamSize, vehicles: d.capacity.vehicles, utilization_next_28: r(d.capacity.avgUtilNext28), utilization_last_28: r(d.capacity.avgUtilLast28), busiest_day_pct: r(d.capacity.peakPct), overbooked_days: d.capacity.overbookedDays, tight_days: d.capacity.tightDays, first_open_day: d.capacity.firstOpenDay, booking_lead_time_days: d.capacity.leadTimeDays, max_crews_at_once: d.capacity.maxCrewsAtOnce, busiest_weekday: d.capacity.peakWeekday },
    constraint_findings: d.constraints.map((c) => ({ area: c.title, severity: c.severity, metric: c.metric, detail: c.detail })),
    computed_verdict: d.verdict,
  };
}

/* ---------- Residential vs Commercial vs Other ---------- */
const segmentOf = (type: string | undefined): Segment => (type === 'Residential' ? 'Residential' : type === 'Commercial' ? 'Commercial' : 'Other');

/** Revenue (billed, net of VAT) split by who the customer is: Residential, Commercial, and everything else (property managers, government, hospitality …). */
export function segmentReport(db: DB, from: string, to: string): SegmentReport {
  const typeOf = new Map(db.clients.map((c) => [c.id, c.type] as const));
  const inv = live(db.invoices).filter((i) => i.status === 'Approved' && i.issue_date >= from && i.issue_date <= to);
  const segs: Segment[] = ['Residential', 'Commercial', 'Other'];
  const total = sum(inv, (i) => invoiceTotals(i).net);
  const rows: SegmentRow[] = segs.map((g) => {
    const mine = inv.filter((i) => segmentOf(typeOf.get(i.client_id)) === g);
    const ids = [...new Set(mine.map((i) => i.client_id))];
    const revenue = sum(mine, (i) => invoiceTotals(i).net);
    const jobs = live(db.jobs).filter((j) => j.start_at.slice(0, 10) >= from && j.start_at.slice(0, 10) <= to && !OFF.has(j.status) && segmentOf(typeOf.get(j.client_id)) === g).length;
    const gp = sum(ids, (id) => profitAndLoss(db, from, to, { client: id }).grossProfit);
    const collected = sum(live(db.payments).filter((p) => paymentCounts(p) && p.date >= from && p.date <= to && segmentOf(typeOf.get(p.client_id)) === g), (p) => p.amount + p.wht_amount);
    const receivables = sum(mine, (i) => invoiceBalance(db, i));
    return { segment: g, revenue: round2(revenue), share: total > 0 ? revenue / total : 0, jobs, avgJob: jobs > 0 ? round2(revenue / jobs) : null, clients: ids.length, grossMargin: revenue > 0 ? gp / revenue : null, collected: round2(collected), receivables: round2(receivables) };
  });
  const byType = new Map<string, { rev: number; ids: Set<string> }>();
  for (const i of inv) { const t = typeOf.get(i.client_id) ?? 'Unknown'; if (segmentOf(t) !== 'Other') continue; const e = byType.get(t) ?? { rev: 0, ids: new Set<string>() }; e.rev += invoiceTotals(i).net; e.ids.add(i.client_id); byType.set(t, e); }
  const other: TypeRow[] = [...byType.entries()].map(([type, e]) => ({ type, revenue: round2(e.rev), share: total > 0 ? e.rev / total : 0, clients: e.ids.size })).sort((a, b) => b.revenue - a.revenue);
  // six months trend, same rule
  const cur = to.slice(0, 7); const months = Array.from({ length: 6 }, (_, k) => {
    const m = monthShift(cur, k - 5); const mi = live(db.invoices).filter((i) => i.status === 'Approved' && i.issue_date.slice(0, 7) === m);
    const by = (g: Segment) => round2(sum(mi.filter((i) => segmentOf(typeOf.get(i.client_id)) === g), (i) => invoiceTotals(i).net));
    return { month: m, Residential: by('Residential'), Commercial: by('Commercial'), Other: by('Other') };
  });
  const top = [...rows].sort((a, b) => b.revenue - a.revenue)[0];
  const best = rows.filter((r) => r.grossMargin !== null && r.revenue > 0).sort((a, b) => (b.grossMargin ?? 0) - (a.grossMargin ?? 0))[0];
  const headline = total <= 0 ? 'No billed revenue in this period yet.'
    : `${top.segment} is the biggest segment at ${Math.round(top.share * 100)}% of revenue.${best && best.segment !== top.segment ? ` ${best.segment} earns the best margin (${Math.round((best.grossMargin ?? 0) * 100)}%).` : best ? ` It also has the best margin (${Math.round((best.grossMargin ?? 0) * 100)}%).` : ''}`;
  return { from, to, total: round2(total), rows, other, months, headline };
}
