import type {
  DispatchItem,
  Dispatch,
  JobStatus,
  Asset, Attendance, DB, Employee, Holiday, Invoice, Job, PayrollAdjustment, PayrollLine, PayrollPeriod,
  Payment, QuoteItem, ServiceDef, Settings, StatutoryRate,
} from './types';
import { addDays, diffDays, dow, eachDay, minutesBetween, round2, sum, today } from './util';

/* ============ Job status groups ============ */
/** Work finished (legacy 'Completed' counts as closed). */
export const DONE_JOB: JobStatus[] = ['Completed', 'Work Completed', 'Return Checklist Pending', 'Returned to HQ', 'Closed'];
/** Crew on the road or on site, work not yet complete. */
export const FIELD_JOB: JobStatus[] = ['Departed from HQ', 'Arrived at Site', 'In Progress'];
/** Booked and not yet finished — these hold crew, vehicle and equipment. */
export const OPEN_JOB: JobStatus[] = ['Pending', 'Confirmed', 'Dispatch Checklist Pending', ...FIELD_JOB];
/** Crew still away from headquarters. */
export const AWAY_JOB: JobStatus[] = [...FIELD_JOB, 'Work Completed', 'Return Checklist Pending'];
/** Statuses where the day's attendance / dispatch is relevant. */
export const LIVE_JOB: JobStatus[] = ['Confirmed', 'Dispatch Checklist Pending', ...FIELD_JOB];
export const isDone = (s: JobStatus) => DONE_JOB.includes(s);
export const isOpen = (s: JobStatus) => OPEN_JOB.includes(s);
/** The forward-only operating flow (Cancelled / Rescheduled are side exits before departure). */
export const JOB_FLOW: JobStatus[] = ['Confirmed', 'Dispatch Checklist Pending', 'Departed from HQ', 'Arrived at Site', 'In Progress', 'Work Completed', 'Return Checklist Pending', 'Returned to HQ', 'Closed'];

/* ============ Glass panel counting & service pricing ============ */
export interface GlassRow { w: number; h: number; qty: number; grouped?: boolean }

/** Up to 2 m × 1 m (2 m²) = 1 panel; larger = 2 panels. Small panels (≤0.5 m²) marked "grouped" are bundled `groupSize` to 1 panel. */
export function countPanels(rows: GlassRow[], groupSize: number): { panels: number; detail: { label: string; panels: number }[] } {
  const detail = rows.map((r) => {
    const area = r.w * r.h;
    if (r.grouped && area <= 0.5) {
      const p = Math.ceil(r.qty / Math.max(1, groupSize));
      return { label: `${r.qty} small panels (${r.w}×${r.h} m) grouped by ${groupSize}`, panels: p };
    }
    const per = area <= 2 ? 1 : 2;
    return { label: `${r.qty} × ${r.w}×${r.h} m (${per}/panel)`, panels: per * r.qty };
  });
  return { panels: sum(detail, (d) => d.panels), detail };
}

export interface PriceResult { lines: QuoteItem[]; billableQty: number; note: string }

/** Apply TopMop's default pricing rules for one service and quantity. Returns quotation line(s). */
export function priceService(s: ServiceDef, qty: number): PriceResult {
  if (s.custom_quote) {
    return { lines: [{ service_code: s.code, description: s.name, qty, unit: s.unit, rate: s.rate, discount: 0 }], billableQty: qty, note: 'Custom-quoted service – set the rate manually.' };
  }
  if (s.package_price && s.package_qty) {
    const lines: QuoteItem[] = [{
      service_code: s.code, description: `${s.name} – Starter Package (up to ${s.package_qty} panels)`,
      qty: 1, unit: 'package', rate: s.package_price, discount: 0,
    }];
    const excess = Math.max(0, qty - s.package_qty);
    if (excess > 0) lines.push({ service_code: s.code, description: `Excess panels beyond ${s.package_qty}`, qty: excess, unit: 'panel', rate: s.excess_rate ?? s.rate, discount: 0 });
    return { lines, billableQty: qty, note: `${qty} panels: package + ${excess} excess.` };
  }
  const billable = Math.max(qty, s.minimum_qty);
  return {
    lines: [{ service_code: s.code, description: s.name, qty: billable, unit: s.unit, rate: s.rate, discount: 0 }],
    billableQty: billable,
    note: qty < s.minimum_qty ? `Minimum of ${s.minimum_qty} ${s.unit} applied.` : '',
  };
}

/* ============ Quotation / invoice totals ============ */
export interface Totals { gross: number; lineDiscount: number; discount: number; net: number; vat: number; total: number }
export function docTotals(items: QuoteItem[], discount: number, mode: 'exclusive' | 'inclusive' | 'none', vatRate: number): Totals {
  const gross = sum(items, (i) => i.qty * i.rate);
  const lineDiscount = sum(items, (i) => i.discount || 0);
  const after = Math.max(0, gross - lineDiscount - (discount || 0));
  const r = vatRate / 100;
  let net = after, vat = 0, total = after;
  if (mode === 'exclusive') { vat = after * r; total = after + vat; }
  else if (mode === 'inclusive') { net = after / (1 + r); vat = after - net; }
  return { gross: round2(gross), lineDiscount: round2(lineDiscount), discount: round2((discount || 0) + lineDiscount), net: round2(net), vat: round2(vat), total: round2(total) };
}

export const invoiceTotals = (i: Pick<Invoice, 'items' | 'discount' | 'vat_mode' | 'vat_rate' | 'withholding_rate'>) => {
  const t = docTotals(i.items, i.discount, i.vat_mode, i.vat_rate);
  const wht = round2(t.net * (i.withholding_rate / 100));
  return { ...t, wht, collectible: round2(t.total - wht) };
};

export function invoiceSettled(db: Pick<DB, 'payments'>, inv: Invoice) {
  const pays = db.payments.filter((p) => p.invoice_id === inv.id && !p.deleted_at && !p.reversed);
  const cash = sum(pays, (p) => p.amount);
  const wht = sum(pays, (p) => p.wht_amount);
  return { cash, wht, settled: round2(cash + wht) };
}
export function invoiceBalance(db: Pick<DB, 'payments'>, inv: Invoice): number {
  if (inv.status !== 'Approved') return 0;
  return round2(invoiceTotals(inv).total - invoiceSettled(db, inv).settled);
}
export type AgingBucket = 'Current' | '1–30' | '31–60' | '61–90' | '90+';
export const AGING_BUCKETS: AgingBucket[] = ['Current', '1–30', '31–60', '61–90', '90+'];
export function agingBucket(due: string, asOf = today()): AgingBucket {
  const d = diffDays(asOf, due);
  if (d <= 0) return 'Current';
  if (d <= 30) return '1–30';
  if (d <= 60) return '31–60';
  if (d <= 90) return '61–90';
  return '90+';
}
export function invoiceState(db: Pick<DB, 'payments'>, inv: Invoice): 'Draft' | 'Reversed' | 'Unpaid' | 'Partially Paid' | 'Paid' | 'Overdue' {
  if (inv.status !== 'Approved') return inv.status;
  const bal = invoiceBalance(db, inv);
  const tot = invoiceTotals(inv).total;
  if (bal <= 0.005) return 'Paid';
  if (inv.due_date < today()) return 'Overdue';
  return bal < tot ? 'Partially Paid' : 'Unpaid';
}

/* ============ Inventory ============ */
export const activeStock = (db: Pick<DB, 'stock'>) => db.stock.filter((t) => t.approval === 'Approved');
export function onHand(db: Pick<DB, 'stock'>, itemId: string, locationId?: string): number {
  return round2(sum(activeStock(db).filter((t) => t.item_id === itemId && (!locationId || t.location_id === locationId)), (t) => t.qty));
}
/** Materials planned on open jobs that have not yet been issued. */
export function reservedQty(db: Pick<DB, 'jobs' | 'stock'>, itemId: string): number {
  let r = 0;
  for (const j of db.jobs) {
    if (j.deleted_at || !(isOpen(j.status) || j.status === 'Rescheduled')) continue;
    const m = j.materials.find((x) => x.item_id === itemId);
    if (!m) continue;
    const issued = sum(activeStock(db).filter((t) => t.job_id === j.id && t.item_id === itemId && (t.type === 'Issue to Job' || t.type === 'Return from Job')), (t) => -t.qty);
    r += Math.max(0, m.planned_qty - issued);
  }
  return round2(r);
}
export function stockSummary(db: DB, itemId: string) {
  const tx = activeStock(db).filter((t) => t.item_id === itemId);
  const beginning = sum(tx.filter((t) => t.type === 'Opening'), (t) => t.qty);
  const stockIn = sum(tx.filter((t) => t.type !== 'Opening' && t.qty > 0), (t) => t.qty);
  const stockOut = -sum(tx.filter((t) => t.qty < 0), (t) => t.qty);
  const oh = round2(beginning + stockIn - stockOut);
  const reserved = reservedQty(db, itemId);
  return { beginning, stockIn, stockOut, onHand: oh, reserved, available: round2(oh - reserved) };
}

/* ============ Scheduling conflicts ============ */
export const overlaps = (aS: string, aE: string, bS: string, bE: string) => aS < bE && bS < aE;
export interface Conflict { kind: 'crew' | 'vehicle' | 'equipment'; refId: string; job: Job }
export function findConflicts(db: Pick<DB, 'jobs'>, j: Pick<Job, 'start_at' | 'end_at' | 'leader_id' | 'crew_ids' | 'vehicle_id' | 'equipment_ids'> & { id?: string }): Conflict[] {
  const people = new Set([...(j.crew_ids || []), ...(j.leader_id ? [j.leader_id] : [])]);
  const out: Conflict[] = [];
  for (const o of db.jobs) {
    if (o.id === j.id || o.deleted_at || o.status === 'Cancelled' || o.status === 'Rescheduled' || isDone(o.status)) continue;
    if (!overlaps(j.start_at, j.end_at, o.start_at, o.end_at)) continue;
    for (const p of [...o.crew_ids, ...(o.leader_id ? [o.leader_id] : [])]) if (people.has(p) && !out.some((c) => c.kind === 'crew' && c.refId === p && c.job.id === o.id)) out.push({ kind: 'crew', refId: p, job: o });
    if (j.vehicle_id && o.vehicle_id === j.vehicle_id) out.push({ kind: 'vehicle', refId: j.vehicle_id, job: o });
    for (const e of j.equipment_ids || []) if (o.equipment_ids.includes(e)) out.push({ kind: 'equipment', refId: e, job: o });
  }
  return out;
}

/* ============ Attendance ============ */
export function dailyEquivalent(e: Employee, s: Settings): number {
  return e.pay_basis === 'daily' ? e.daily_rate : e.monthly_salary / s.monthly_divisor_days;
}
export const hourlyRate = (e: Employee, s: Settings) => dailyEquivalent(e, s) / s.std_hours_per_day;

const hm = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
/** Derive late / undertime / overtime / worked-hours from a clock-in and clock-out. */
export function computeTimes(e: Pick<Employee, 'shift_start' | 'shift_end'>, inAt?: string, outAt?: string, graceMin = 0) {
  if (!inAt) return { late_min: 0, undertime_min: 0, ot_min: 0, worked_hours: 0 };
  const day = inAt.slice(0, 10);
  const startMin = minutesBetween(`${day}T00:00`, `${day}T${e.shift_start}`);
  const inMin = minutesBetween(`${day}T00:00`, inAt);
  const late = inMin - startMin > graceMin ? Math.max(0, inMin - startMin) : 0;
  if (!outAt) return { late_min: late, undertime_min: 0, ot_min: 0, worked_hours: 0 };
  const span = minutesBetween(inAt, outAt);
  const breakMin = span > 300 ? 60 : 0;
  const worked = Math.max(0, span - breakMin) / 60;
  const endMin = minutesBetween(`${day}T00:00`, outAt);
  const shiftEnd = hm(e.shift_end);
  const undertime = Math.max(0, shiftEnd - endMin);
  const ot = Math.max(0, endMin - shiftEnd);
  return { late_min: late, undertime_min: undertime, ot_min: ot >= 30 ? Math.floor(ot / 30) * 30 : 0, worked_hours: round2(worked) };
}

/* ============ Payroll ============ */
export const PERIODS_PER_MONTH_FACTOR: Record<string, number> = { monthly: 1, biweekly: 0.5, weekly: 12 / 52 };

function statutory(rate: StatutoryRate | undefined, base: number): number {
  if (!rate) return 0;
  let v = rate.mode === 'fixed' ? rate.value : (base * rate.value) / 100;
  if (rate.min) v = Math.max(v, rate.min);
  if (rate.max) v = Math.min(v, rate.max);
  return base > 0 ? round2(v) : 0;
}

export interface PayrollInput {
  emp: Employee; period: PayrollPeriod; attendance: Attendance[]; holidays: Holiday[];
  adjustments: PayrollAdjustment[]; settings: Settings; asOf?: string;
}
export function computePayrollLine(inp: PayrollInput): { line: PayrollLine; pendingAttendance: number } {
  const { emp, period, holidays, settings: s } = inp;
  const asOf = inp.asOf ?? today();
  const daily = dailyEquivalent(emp, s);
  const hourly = daily / s.std_hours_per_day;
  const holidayOn = (d: string) => holidays.find((h) => h.date === d && !h.deleted_at);
  const atts = inp.attendance.filter((a) => a.employee_id === emp.id && a.date >= period.start && a.date <= period.end && !a.deleted_at);
  const pending = atts.filter((a) => a.approval === 'Pending').length;
  const ok = atts.filter((a) => a.approval === 'Approved');
  const byDate = new Map(ok.map((a) => [a.date, a]));

  let regular = 0, lateDed = 0, ot = 0, holPay = 0, restPay = 0, leavePay = 0, days = 0;
  const laborByJob: Record<string, number> = {};
  const isMonthly = emp.pay_basis === 'monthly';

  for (const a of ok) {
    const worked = a.clock_in && a.clock_out;
    const hol = holidayOn(a.date);
    const isRest = dow(a.date) === emp.rest_day;
    const dayFraction = worked ? Math.min(a.worked_hours, s.std_hours_per_day) / s.std_hours_per_day : 0;
    if (a.kind === 'Leave' && a.paid_leave) { leavePay += isMonthly ? 0 : daily; continue; }
    if (!worked) continue;
    days += 1;
    if (a.job_id) laborByJob[a.job_id] = round2((laborByJob[a.job_id] || 0) + daily * dayFraction);
    const otPay = (a.ot_min / 60) * hourly * s.multipliers.overtime;
    ot += otPay;
    if (hol) {
      const m = hol.kind === 'Regular' ? s.multipliers.regular_holiday : s.multipliers.special_holiday;
      holPay += isMonthly ? daily * (m - 1) * dayFraction : daily * m * dayFraction;
    } else if (isRest) {
      restPay += isMonthly ? daily * (s.multipliers.rest_day - 1) * dayFraction : daily * s.multipliers.rest_day * dayFraction;
    } else if (!isMonthly) {
      regular += daily * dayFraction;
    }
    lateDed += ((a.late_min + a.undertime_min) / 60) * hourly * (isMonthly ? 1 : 0); // daily-paid: fraction already reflects hours worked
  }

  if (isMonthly) {
    regular = emp.monthly_salary * (PERIODS_PER_MONTH_FACTOR[period.type] ?? 1);
    // unexcused missing workdays up to today count as absences
    let absent = 0;
    for (const d of eachDay(period.start, period.end)) {
      if (d > asOf || dow(d) === emp.rest_day || holidayOn(d)) continue;
      const a = byDate.get(d);
      if (!a || a.kind === 'Absent' || (a.kind === 'Leave' && !a.paid_leave)) absent += 1;
    }
    lateDed += absent * daily;
  } else {
    // daily-paid staff earn an unworked regular holiday
    for (const d of eachDay(period.start, period.end)) {
      const h = holidayOn(d);
      if (h && h.kind === 'Regular' && d <= asOf && !byDate.get(d)?.clock_in) holPay += daily;
    }
  }

  const applicable = inp.adjustments.filter((a) => a.employee_id === emp.id && a.active && !a.deleted_at && (a.period_id ? a.period_id === period.id : (a.balance === undefined || a.balance > 0)));
  const sumKind = (k: PayrollAdjustment['kind']) => applicable.filter((a) => a.kind === k).reduce((t, a) => t + (a.balance !== undefined && a.period_id == null ? Math.min(a.amount, a.balance) : a.amount), 0);
  const allowances = sumKind('Allowance'), incentives = sumKind('Incentive'), reimb = sumKind('Reimbursement');
  const cashAdv = sumKind('Cash Advance'), loan = sumKind('Loan'), otherDed = sumKind('Other Deduction');

  regular = round2(regular); lateDed = round2(Math.min(lateDed, regular + holPay + restPay));
  ot = round2(ot); holPay = round2(holPay); restPay = round2(restPay); leavePay = round2(leavePay);
  const basic = round2(regular - lateDed);
  const gross = round2(basic + ot + holPay + restPay + leavePay + allowances + incentives + reimb);
  const rate = (k: StatutoryRate['key']) => s.statutory.find((r) => r.key === k);
  const contribBase = basic + holPay + restPay + leavePay;
  const sss = statutory(rate('sss'), contribBase), ph = statutory(rate('philhealth'), contribBase), pi = statutory(rate('pagibig'), contribBase);
  const wr = rate('wtax');
  const taxable = Math.max(0, gross - reimb - sss - ph - pi);
  const wtax = wr && taxable > wr.threshold ? round2(Math.max(0, ((taxable - wr.threshold) * (wr.mode === 'percent' ? wr.value : 0)) / 100)) : 0;
  const totalDed = round2(sss + ph + pi + wtax + cashAdv + loan + otherDed);
  return {
    pendingAttendance: pending,
    line: {
      employee_id: emp.id, days_worked: days, regular_pay: regular, late_undertime_deduction: lateDed, overtime_pay: ot,
      holiday_pay: holPay, rest_day_pay: restPay, leave_pay: leavePay, allowances, incentives, reimbursements: reimb, gross,
      sss, philhealth: ph, pagibig: pi, wtax, cash_advance: cashAdv, loan, other_deductions: otherDed,
      total_deductions: totalDed, net: round2(gross - totalDed),
      adjustment_ids: applicable.map((a) => a.id), direct_labor_by_job: laborByJob,
    },
  };
}

/* ============ Job costing & profitability ============ */
export interface JobCost {
  labor: number; materials: number; transport: number; equipment: number; subcontractor: number; other: number;
  total: number; revenue: number; revenueBasis: 'billed' | 'expected' | 'none'; grossProfit: number; margin: number;
  laborEstimated: boolean; materialsEstimated: boolean; estimated: boolean;
}
export function jobDays(j: Pick<Job, 'start_at' | 'end_at'>) { return Math.max(1, diffDays(j.end_at.slice(0, 10), j.start_at.slice(0, 10)) + 1); }

export function jobRevenue(db: DB, j: Job): { revenue: number; basis: 'billed' | 'expected' | 'none' } {
  const inv = db.invoices.filter((i) => i.job_id === j.id && i.status === 'Approved' && !i.deleted_at);
  if (inv.length) return { revenue: sum(inv, (i) => invoiceTotals(i).net), basis: 'billed' };
  if (j.status === 'Cancelled') return { revenue: 0, basis: 'none' };
  return { revenue: j.contract_amount, basis: j.contract_amount ? 'expected' : 'none' };
}

export function jobCost(db: DB, j: Job): JobCost {
  const s = db.settings;
  const att = db.attendance.filter((a) => a.job_id === j.id && a.approval !== 'Rejected' && !a.deleted_at && a.clock_in && a.clock_out);
  let labor = 0, laborEstimated = false;
  if (att.length) {
    labor = sum(att, (a) => {
      const e = db.employees.find((x) => x.id === a.employee_id);
      return e ? dailyEquivalent(e, s) * Math.min(1, a.worked_hours / s.std_hours_per_day) + (a.ot_min / 60) * hourlyRate(e, s) * s.multipliers.overtime : 0;
    });
  } else {
    laborEstimated = true;
    const crew = new Set([...j.crew_ids, ...(j.leader_id ? [j.leader_id] : [])]);
    labor = sum([...crew], (id) => { const e = db.employees.find((x) => x.id === id); return e ? dailyEquivalent(e, s) : 0; }) * jobDays(j);
  }
  const tx = activeStock(db).filter((t) => t.job_id === j.id);
  let materials = sum(tx.filter((t) => ['Issue to Job', 'Return from Job', 'Damaged / Wasted'].includes(t.type)), (t) => -t.qty * t.unit_cost);
  let materialsEstimated = false;
  if (!tx.length) {
    materialsEstimated = true;
    materials = sum(j.materials, (m) => m.planned_qty * (db.items.find((i) => i.id === m.item_id)?.cost ?? 0));
  }
  const exp = db.expenses.filter((e) => e.job_id === j.id && !e.deleted_at && !e.reversed && e.approval !== 'Rejected');
  const net = (e: { amount: number; vat: number }) => e.amount - e.vat;
  const transport = sum(exp.filter((e) => e.category === 'Transportation' || e.category === 'Fuel'), net);
  const subcontractor = sum(exp.filter((e) => e.category === 'Subcontractor'), net);
  const other = sum(exp.filter((e) => !['Transportation', 'Fuel', 'Subcontractor'].includes(e.category)), net);
  const equipment = sum([...j.equipment_ids, ...(j.vehicle_id ? [j.vehicle_id] : [])], (id) => (db.assets.find((a: Asset) => a.id === id)?.daily_allocation ?? 0) * jobDays(j));
  const { revenue, basis } = jobRevenue(db, j);
  const total = labor + materials + transport + equipment + subcontractor + other;
  const estimated = !isDone(j.status) || laborEstimated || materialsEstimated;
  return {
    labor: round2(labor), materials: round2(materials), transport: round2(transport), equipment: round2(equipment),
    subcontractor: round2(subcontractor), other: round2(other), total: round2(total), revenue: round2(revenue), revenueBasis: basis,
    grossProfit: round2(revenue - total), margin: revenue ? round2(((revenue - total) / revenue) * 100) : 0,
    laborEstimated, materialsEstimated, estimated,
  };
}

export interface PnL {
  revenue: number; directCost: number; grossProfit: number; grossMargin: number;
  opex: number; opexByCategory: Record<string, number>; netProfit: number; netMargin: number;
  payrollExpense: number; directLabor: number;
  direct: { labor: number; materials: number; transport: number; equipment: number; subcontractor: number; other: number };
}
/** Period P&L. Revenue = billed net of VAT for invoices issued in range. Direct costs = costs of jobs completed/invoiced in range. */
export function profitAndLoss(db: DB, from: string, to: string, filter?: { branch?: string; client?: string; service?: string }): PnL {
  const f = filter || {};
  const inv = db.invoices.filter((i) => i.status === 'Approved' && !i.deleted_at && i.issue_date >= from && i.issue_date <= to
    && (!f.branch || i.branch_id === f.branch) && (!f.client || i.client_id === f.client)
    && (!f.service || i.items.some((it) => it.service_code === f.service)));
  const revenue = sum(inv, (i) => invoiceTotals(i).net);
  const jobIds = new Set(inv.map((i) => i.job_id).filter(Boolean) as string[]);
  let directCost = 0, directLabor = 0;
  const direct = { labor: 0, materials: 0, transport: 0, equipment: 0, subcontractor: 0, other: 0 };
  for (const id of jobIds) {
    const j = db.jobs.find((x) => x.id === id); if (!j) continue;
    const c = jobCost(db, j); directCost += c.total; directLabor += c.labor;
    for (const k of Object.keys(direct) as (keyof typeof direct)[]) direct[k] += c[k];
  }
  const exps = db.expenses.filter((e) => !e.deleted_at && !e.reversed && e.approval === 'Approved' && e.date >= from && e.date <= to && (!f.branch || e.branch_id === f.branch));
  // Approved payroll is posted as an expense; periods submitted but not yet approved are accrued so margins are not overstated.
  const accrued = sum(db.periods.filter((p) => !p.deleted_at && p.status === 'For Approval' && p.end >= from && p.end <= to), (p) => sum(db.runs.find((r) => r.period_id === p.id)?.lines ?? [], (l) => l.gross));
  const payrollExpense = sum(exps.filter((e) => e.category === 'Payroll'), (e) => e.amount - e.vat) + accrued;
  const jobLinkedIds = jobIds;
  const opexByCategory: Record<string, number> = {};
  for (const e of exps) {
    if (e.job_id && jobLinkedIds.has(e.job_id)) continue; // already in direct cost
    if (e.category === 'Payroll') continue;
    opexByCategory[e.category] = round2((opexByCategory[e.category] || 0) + (e.amount - e.vat));
  }
  // payroll not attributed to invoiced jobs is overhead
  const unallocatedPayroll = Math.max(0, payrollExpense - directLabor);
  if (unallocatedPayroll) opexByCategory['Payroll (unallocated)'] = round2(unallocatedPayroll);
  const wasted = sum(activeStock(db).filter((t) => t.type === 'Damaged / Wasted' && !t.job_id && t.date >= from && t.date <= to), (t) => -t.qty * t.unit_cost);
  if (wasted) opexByCategory['Inventory wastage'] = round2(wasted);
  const opex = sum(Object.values(opexByCategory), (x) => x);
  const gp = revenue - directCost;
  const net = gp - opex;
  return {
    revenue: round2(revenue), directCost: round2(directCost), grossProfit: round2(gp), grossMargin: revenue ? round2((gp / revenue) * 100) : 0,
    opex: round2(opex), opexByCategory, netProfit: round2(net), netMargin: revenue ? round2((net / revenue) * 100) : 0,
    payrollExpense: round2(payrollExpense), directLabor: round2(directLabor),
    direct: Object.fromEntries(Object.entries(direct).map(([k, v]) => [k, round2(v)])) as PnL['direct'],
  };
}

/* ============ Scorecard ============ */
export interface Scorecard {
  attendanceRate: number; punctuality: number; jobsCompleted: number; clientRating: number; safety: number;
  equipmentCare: number; wastage: number; teamwork: number; supervisor: number; training: number;
  incentive: number; penalty: number; disciplinary: string; score: number; tier: string; hasReview: boolean;
}
export function scorecard(db: DB, emp: Employee, month: string): Scorecard {
  const s = db.settings;
  const from = `${month}-01`, to = `${month}-31`;
  const atts = db.attendance.filter((a) => a.employee_id === emp.id && a.date >= from && a.date <= to && !a.deleted_at && a.approval === 'Approved');
  const present = atts.filter((a) => a.clock_in);
  const workdays = eachDay(from, to.slice(0, 8) + String(new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate()).padStart(2, '0'))
    .filter((d) => d <= today() && dow(d) !== emp.rest_day).length;
  const attendanceRate = workdays ? Math.min(100, (present.length / workdays) * 100) : 100;
  const lateDays = present.filter((a) => a.late_min > s.grace_minutes).length;
  const punctuality = present.length ? (1 - lateDays / present.length) * 100 : 100;
  const jobs = db.jobs.filter((j) => isDone(j.status) && !j.deleted_at && j.completed_at?.slice(0, 7) === month && (j.crew_ids.includes(emp.id) || j.leader_id === emp.id));
  const rated = jobs.filter((j) => j.client_rating);
  const clientRating = rated.length ? (sum(rated, (j) => j.client_rating!) / rated.length) * 20 : 0;
  const rv = db.reviews.find((r) => r.employee_id === emp.id && r.month === month && !r.deleted_at);
  const wasteCost = sum(activeStock(db).filter((t) => t.type === 'Damaged / Wasted' && t.job_id && jobs.some((j) => j.id === t.job_id)), (t) => -t.qty * t.unit_cost);
  const matCost = sum(jobs, (j) => jobCost(db, j).materials) || 1;
  const wastage = Math.max(0, 100 - (wasteCost / matCost) * 500);
  const training = rv ? Math.min(100, rv.training_completed * 50) : 0;
  const parts: [number, number, boolean][] = [
    [attendanceRate, 15, true], [punctuality, 10, true], [clientRating, 15, rated.length > 0], [rv?.quality ?? 0, 5, !!rv],
    [rv?.safety ?? 0, 15, !!rv], [rv?.equipment_care ?? 0, 10, !!rv], [wastage, 5, jobs.length > 0],
    [rv?.teamwork ?? 0, 10, !!rv], [rv?.supervisor ?? 0, 10, !!rv], [training, 5, !!rv],
  ];
  const used = parts.filter((p) => p[2]);
  const w = sum(used, (p) => p[1]);
  const score = w ? round2(sum(used, (p) => p[0] * p[1]) / w) : 0;
  const tier = score >= 90 ? 'Tier A – Elite' : score >= 80 ? 'Tier B – Strong' : score >= 70 ? 'Tier C – Standard' : 'Tier D – Needs Improvement';
  return {
    attendanceRate: round2(attendanceRate), punctuality: round2(punctuality), jobsCompleted: jobs.length, clientRating: round2(clientRating),
    safety: rv?.safety ?? 0, equipmentCare: rv?.equipment_care ?? 0, wastage: round2(wastage), teamwork: rv?.teamwork ?? 0,
    supervisor: rv?.supervisor ?? 0, training: rv?.training_completed ?? 0, incentive: rv?.incentive ?? 0, penalty: rv?.penalty ?? 0,
    disciplinary: rv?.disciplinary ?? '', score, tier, hasReview: !!rv,
  };
}

/* ============ Misc ============ */
export function nextDue(asset: Asset): string | null {
  if (!asset.maintenance_interval_days) return null;
  return addDays(asset.last_maintenance || asset.purchase_date, asset.maintenance_interval_days);
}
export const payMethodList = ['Cash', 'Bank Transfer', 'Check', 'GCash', 'Credit Card', 'Other'] as const;
export type { Payment };

/** Build payroll lines for every eligible employee for a period (pure). */
export function buildPayrollLines(db: DB, period: PayrollPeriod, asOf?: string): { lines: PayrollLine[]; pending: number } {
  const emps = db.employees.filter((e) => !e.deleted_at && e.status !== 'inactive' && e.payroll_type === period.type && e.hire_date <= period.end);
  let pending = 0;
  const lines = emps.map((emp) => {
    const r = computePayrollLine({ emp, period, attendance: db.attendance, holidays: db.holidays, adjustments: db.adjustments, settings: db.settings, asOf });
    pending += r.pendingAttendance;
    return r.line;
  });
  return { lines, pending };
}

/* ============ Profitability tables ============ */
export interface JobProfitRow { job: Job; cost: JobCost; clientId: string }
/** Jobs (completed or already invoiced) whose service date falls in range. */
export function jobProfitRows(db: DB, from: string, to: string): JobProfitRow[] {
  return db.jobs
    .filter((j) => !j.deleted_at && j.start_at.slice(0, 10) >= from && j.start_at.slice(0, 10) <= to && (isDone(j.status) || j.status === 'In Progress'))
    .map((job) => ({ job, cost: jobCost(db, job), clientId: job.client_id }));
}
export interface ProfitAgg { key: string; label: string; jobs: number; revenue: number; cost: number; gp: number; margin: number; estimated: boolean }
export function aggregateProfit(rows: { key: string; label: string; revenue: number; cost: number; estimated: boolean }[]): ProfitAgg[] {
  const m = new Map<string, ProfitAgg>();
  for (const r of rows) {
    const e = m.get(r.key) ?? { key: r.key, label: r.label, jobs: 0, revenue: 0, cost: 0, gp: 0, margin: 0, estimated: false };
    e.jobs += 1; e.revenue += r.revenue; e.cost += r.cost; e.estimated ||= r.estimated; m.set(r.key, e);
  }
  return [...m.values()].map((e) => ({ ...e, revenue: round2(e.revenue), cost: round2(e.cost), gp: round2(e.revenue - e.cost), margin: e.revenue ? round2(((e.revenue - e.cost) / e.revenue) * 100) : 0 })).sort((a, b) => b.gp - a.gp);
}
/** Service-type profitability: each job's revenue and cost are split across its services by billed-line share. */
export function serviceProfitRows(db: DB, from: string, to: string) {
  const out: { key: string; label: string; revenue: number; cost: number; estimated: boolean }[] = [];
  for (const { job, cost } of jobProfitRows(db, from, to)) {
    const q = db.quotations.find((x) => x.id === job.quotation_id);
    const items = q?.items ?? [];
    const total = sum(items, (i) => i.qty * i.rate - i.discount);
    const shares: Record<string, number> = {};
    if (total > 0) for (const i of items) shares[i.service_code] = (shares[i.service_code] || 0) + (i.qty * i.rate - i.discount) / total;
    else for (const c of job.service_codes) shares[c] = 1 / job.service_codes.length;
    for (const [code, sh] of Object.entries(shares)) out.push({ key: code, label: db.services.find((s) => s.code === code)?.name ?? code, revenue: cost.revenue * sh, cost: cost.total * sh, estimated: cost.estimated });
  }
  return out;
}

/* ============ Dispatch checklist ============ */
const TOOL_CATEGORIES = new Set(['Hose', 'Ladder', 'Extension Cord', 'Pump', 'Other']);
export const kindOfAsset = (a: Asset): DispatchItem['kind'] =>
  a.category === 'Vehicle' ? 'vehicle' : a.category === 'Safety Equipment' ? 'ppe' : TOOL_CATEGORIES.has(a.category) ? 'tool' : 'equipment';

/** The issue list for a job: vehicle, machines, tools, PPE and chemicals/materials assigned at booking. */
export function buildDispatchItems(d: Pick<DB, 'assets' | 'items'>, job: Job): DispatchItem[] {
  const items: DispatchItem[] = [];
  const add = (a: Asset | undefined) => { if (a) items.push({ key: `a:${a.id}`, kind: kindOfAsset(a), asset_id: a.id, label: a.name, code: a.code, qty: 1, responsible_id: job.leader_id }); };
  add(d.assets.find((a) => a.id === job.vehicle_id));
  for (const id of job.equipment_ids) add(d.assets.find((a) => a.id === id));
  const headcount = new Set([...job.crew_ids, ...(job.leader_id ? [job.leader_id] : [])]).size || 1;
  for (const p of job.ppe) items.push({ key: `p:${p}`, kind: 'ppe', label: p, qty: headcount, responsible_id: job.leader_id });
  for (const m of job.materials) {
    const it = d.items.find((i) => i.id === m.item_id);
    if (it) items.push({ key: `m:${it.id}`, kind: 'material', item_id: it.id, label: it.name, code: it.code, unit: it.uom, qty: m.planned_qty, responsible_id: job.leader_id });
  }
  return items;
}

export interface DispatchGaps { incomplete: string[]; discrepancies: { key: string; text: string }[]; signature: string }
/** What still blocks departure. `incomplete` can never be waived; `discrepancies` (missing / damaged / short items, absent crew) need an approved exception. */
export function dispatchGaps(job: Job, dp: Pick<Dispatch, 'items' | 'crew_present' | 'dep_veh_condition' | 'dep_veh_notes' | 'dep_veh_photo' | 'dep_fuel' | 'dep_odo' | 'dep_photo' | 'dep_lat' | 'dep_lng' | 'dep_gps_note'>, names: (id: string) => string): DispatchGaps {
  const incomplete: string[] = []; const disc: { key: string; text: string }[] = [];
  const crew = [...new Set([...(job.leader_id ? [job.leader_id] : []), ...job.crew_ids])];
  for (const e of crew) if (!(dp.crew_present ?? []).includes(e)) disc.push({ key: `crew:${e}`, text: `${names(e)} not confirmed present` });
  const veh = dp.items.find((i) => i.kind === 'vehicle');
  if (veh) {
    if (!dp.dep_veh_condition) incomplete.push('Vehicle condition');
    if (dp.dep_veh_condition === 'With Issue' && !dp.dep_veh_notes?.trim()) incomplete.push('Vehicle issue notes');
    if (!dp.dep_veh_photo) incomplete.push('Vehicle photo');
    if (!dp.dep_fuel) incomplete.push('Fuel level');
    if (!(dp.dep_odo && dp.dep_odo > 0)) incomplete.push('Starting odometer');
  }
  for (const i of dp.items) {
    if (i.kind === 'vehicle') { if (!i.out_ok) incomplete.push(`${i.label} – confirm`); continue; }
    if (!i.out_ok) { incomplete.push(`${i.label} – confirm`); continue; }
    const loaded = i.loaded_qty ?? 0;
    const cond = i.kind === 'material' ? i.out_container ?? 'Good' : i.out_condition ?? 'Good';
    if (i.kind !== 'material' && i.out_condition === 'Damaged' && !i.out_photo) incomplete.push(`${i.label} – damage photo`);
    if (loaded < i.qty) disc.push({ key: `qty:${i.key}`, text: `${i.label}: loaded ${loaded} of ${i.qty}${i.unit ? ' ' + i.unit : ''}` });
    if (i.kind !== 'material' && cond === 'Missing') disc.push({ key: `miss:${i.key}`, text: `${i.label} missing` });
    if (cond === 'Damaged' || cond === 'Leaking') disc.push({ key: `dmg:${i.key}`, text: `${i.label} ${String(cond).toLowerCase()}` });
  }
  if (!dp.dep_photo) incomplete.push('Group / equipment loading photo');
  if (dp.dep_lat === undefined && !dp.dep_gps_note?.trim()) incomplete.push('GPS location');
  const uniq = [...new Map(disc.map((d) => [d.key, d])).values()];
  return { incomplete, discrepancies: uniq, signature: uniq.map((d) => d.key).sort().join('|') };
}

export const round2Safe = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
