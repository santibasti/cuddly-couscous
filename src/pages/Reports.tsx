import { useMemo, useState } from 'react';
import { useAuth, live } from '@/lib/store';
import { Badge, Card, Field, PageHead, attempt } from '@/components/ui';
import { paymentCounts, paymentStatusLabel, finalContract, panelTotals, isDone, AGING_BUCKETS, agingBucket, aggregateProfit, satisfactionStats, RATING_LABEL, discountAggregate, discountRows, type DiscountView, docTotals, invoiceBalance, invoiceSettled, invoiceTotals, jobProfitRows, nextDue, onHand, profitAndLoss, scorecard, serviceProfitRows, stockSummary } from '@/lib/business';
import { exportCsv, exportPdf, exportXlsx, payslipPdf, serviceReportPdf, statementPdf, type ExportTable } from '@/lib/export';
import { round2, addDays, dow, fmtDate, fmtDateTime, fmtTime, monthEnd, monthStart, money, pct, sum, today } from '@/lib/util';
import type { DB } from '@/lib/types';

type Param = 'range' | 'date' | 'month' | 'period' | 'client' | 'job';
interface P { from: string; to: string; date: string; month: string; period: string; client: string; job: string }
interface Def { id: string; title: string; group: 'Operations' | 'Sales' | 'HR & Payroll' | 'Inventory & assets' | 'Finance'; perm: string; params: Param[]; desc: string; build: (db: DB, p: P) => ExportTable }

const cn = (db: DB, id: string) => db.clients.find((c) => c.id === id)?.name ?? '—';
const en = (db: DB, id?: string) => db.employees.find((e) => e.id === id)?.full_name ?? '—';
const rng = (p: P) => `${fmtDate(p.from)} – ${fmtDate(p.to)}`;
const T = (title: string, headers: string[], types: ExportTable['types'], rows: ExportTable['rows'], subtitle?: string, totals?: ExportTable['totals']): ExportTable => ({ title, headers, types, rows, subtitle, totals });
const svcName = (db: DB, codes: string[]) => codes.map((c) => db.services.find((s) => s.code === c)?.name.split(' ')[0]).join(', ');

const DEFS: Def[] = [
  { id: 'attendance', title: 'Daily attendance', group: 'HR & Payroll', perm: 'reports.hr', params: ['date'], desc: 'Clock in/out, hours, late, overtime and approval by employee.', build: (db, p) => {
    const rows = live(db.employees).filter((e) => e.status !== 'inactive').map((e) => { const a = db.attendance.find((x) => x.employee_id === e.id && x.date === p.date && !x.deleted_at); const j = db.jobs.find((x) => x.id === a?.job_id); return [e.code, e.full_name, j ? `${j.number} ${db.sites.find((s) => s.id === j.site_id)?.name}` : a?.clock_in ? 'Yard / office' : '—', a ? a.kind : dow(p.date) === e.rest_day ? 'Rest day' : 'No record', fmtTime(a?.clock_in), fmtTime(a?.clock_out), a?.worked_hours ?? 0, a?.late_min ?? 0, a?.undertime_min ?? 0, (a?.ot_min ?? 0) / 60, a?.approval ?? '']; });
    return T('Daily attendance', ['ID', 'Employee', 'Job site', 'Status', 'In', 'Out', 'Hours', 'Late (min)', 'Undertime (min)', 'OT (h)', 'Approval'], ['text', 'text', 'text', 'text', 'text', 'text', 'num', 'num', 'num', 'num', 'text'], rows, fmtDate(p.date));
  } },
  { id: 'payroll', title: 'Payroll register', group: 'HR & Payroll', perm: 'reports.hr', params: ['period'], desc: 'Earnings, deductions and net pay per employee. Payslips are generated per employee below.', build: (db, p) => {
    const per = db.periods.find((x) => x.id === p.period); const run = db.runs.find((r) => r.period_id === p.period);
    const lines = run?.lines ?? [];
    const k = ['regular_pay', 'late_undertime_deduction', 'overtime_pay', 'holiday_pay', 'rest_day_pay', 'leave_pay', 'allowances', 'incentives', 'reimbursements', 'gross', 'sss', 'philhealth', 'pagibig', 'wtax', 'cash_advance', 'loan', 'other_deductions', 'total_deductions', 'net'] as const;
    return T('Payroll register', ['Employee', 'Days', 'Regular', 'Late/UT/absent', 'Overtime', 'Holiday', 'Rest day', 'Paid leave', 'Allowances', 'Incentives', 'Reimb.', 'Gross', 'SSS', 'PhilHealth', 'Pag-IBIG', 'W/tax', 'Cash adv.', 'Loan', 'Other ded.', 'Total ded.', 'Net pay'], ['text', 'num', ...k.map(() => 'money' as const)], lines.map((l) => [en(db, l.employee_id), l.days_worked, ...k.map((x) => l[x])]), per ? `${per.label} · ${per.status}` : '', ['Total', sum(lines, (l) => l.days_worked), ...k.map((x) => sum(lines, (l) => l[x]))]);
  } },
  { id: 'scorecards', title: 'Employee performance scorecards', group: 'HR & Payroll', perm: 'reports.hr', params: ['month'], desc: 'Monthly score and tier per field employee.', build: (db, p) => {
    const rows = live(db.employees).filter((e) => e.status !== 'inactive' && e.department === 'Field Operations').map((e) => { const s = scorecard(db, e, p.month); return [e.full_name, e.position, s.attendanceRate, s.punctuality, s.jobsCompleted, s.clientRating, s.safety, s.equipmentCare, s.wastage, s.teamwork, s.supervisor, s.training, s.incentive, s.penalty, s.score, s.tier]; }).sort((a, b) => +b[14] - +a[14]);
    return T('Employee performance scorecards', ['Employee', 'Position', 'Attendance %', 'Punctuality %', 'Jobs', 'Client rating', 'Safety', 'Equip. care', 'Wastage ctl', 'Teamwork', 'Supervisor', 'Trainings', 'Incentive', 'Penalty', 'Score', 'Tier'], ['text', 'text', 'num', 'num', 'num', 'num', 'num', 'num', 'num', 'num', 'num', 'num', 'money', 'money', 'num', 'text'], rows, p.month);
  } },
  { id: 'stockmove', title: 'Inventory stock movement', group: 'Inventory & assets', perm: 'reports.ops', params: ['range'], desc: 'Every stock transaction in the period.', build: (db, p) => T('Inventory stock movement', ['Date', 'Type', 'Item', 'Location', 'Qty', 'Unit cost', 'Value', 'Job', 'Reference / reason', 'Approval'], ['text', 'text', 'text', 'text', 'num', 'money', 'money', 'text', 'text', 'text'],
    db.stock.filter((t) => !t.deleted_at && t.date >= p.from && t.date <= p.to).sort((a, b) => a.date.localeCompare(b.date)).map((t) => [fmtDate(t.date), t.type, db.items.find((i) => i.id === t.item_id)?.name ?? '', db.locations.find((l) => l.id === t.location_id)?.name ?? '', t.qty, t.unit_cost, t.qty * t.unit_cost, db.jobs.find((j) => j.id === t.job_id)?.number ?? '', t.reference ?? t.reason ?? '', t.approval]), rng(p)) },
  { id: 'valuation', title: 'Inventory valuation', group: 'Inventory & assets', perm: 'reports.ops', params: [], desc: 'Beginning, in, out, reserved, available and value per item.', build: (db) => {
    const rows = live(db.items).map((i) => { const s = stockSummary(db, i.id); return [i.code, i.name, i.category, i.uom, s.beginning, s.stockIn, s.stockOut, s.reserved, s.onHand, s.available, i.cost, s.onHand * i.cost]; });
    return T('Inventory valuation', ['Code', 'Item', 'Category', 'UoM', 'Beginning', 'Stock in', 'Stock out', 'Reserved', 'On hand', 'Available', 'Unit cost', 'Valuation'], ['text', 'text', 'text', 'text', 'num', 'num', 'num', 'num', 'num', 'num', 'money', 'money'], rows, `As of ${fmtDate(today())}`, ['Total', '', '', '', '', '', '', '', '', '', '', sum(rows, (r) => +r[11])]);
  } },
  { id: 'lowstock', title: 'Low-stock and expiry', group: 'Inventory & assets', perm: 'reports.ops', params: [], desc: 'Items at/below reorder level and materials expiring soon.', build: (db) => {
    const lim = addDays(today(), db.settings.reminder_days.chemical_expiry);
    const rows = live(db.items).map((i) => ({ i, s: stockSummary(db, i.id) })).filter(({ i, s }) => s.available <= i.reorder_level || (i.track_expiry && i.expiry_date && i.expiry_date <= lim)).map(({ i, s }) => [i.code, i.name, i.category, s.available, i.reorder_level, i.supplier, i.expiry_date ? fmtDate(i.expiry_date) : '—', i.batch_no ?? '—', [s.available <= i.reorder_level ? 'LOW STOCK' : '', i.expiry_date && i.expiry_date <= lim ? (i.expiry_date < today() ? 'EXPIRED' : 'EXPIRING') : ''].filter(Boolean).join(' + ')]);
    return T('Low-stock and expiry', ['Code', 'Item', 'Category', 'Available', 'Reorder at', 'Supplier', 'Expiry', 'Batch', 'Alert'], ['text', 'text', 'text', 'num', 'num', 'text', 'text', 'text', 'text'], rows, `As of ${fmtDate(today())}`);
  } },
  { id: 'outin', title: 'Machine out/in', group: 'Inventory & assets', perm: 'reports.ops', params: ['range'], desc: 'Equipment release and return log with conditions and damage.', build: (db, p) => T('Machine out-in report', ['Asset', 'Job', 'Responsible', 'Out', 'Out condition', 'Due back', 'In', 'Return condition', 'Damage / missing', 'Status'], ['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text'],
    live(db.checkouts).filter((c) => (c.out_at ?? c.expected_return).slice(0, 10) >= p.from && (c.out_at ?? c.expected_return).slice(0, 10) <= p.to).map((c) => [db.assets.find((a) => a.id === c.asset_id)?.name ?? '', db.jobs.find((j) => j.id === c.job_id)?.number ?? '', en(db, c.responsible_id), fmtDateTime(c.out_at), c.out_condition ?? '', fmtDateTime(c.expected_return), fmtDateTime(c.in_at), c.in_condition ?? '', [c.damage_notes, c.missing_accessories].filter(Boolean).join(' | '), c.status]), rng(p)) },
  { id: 'maint', title: 'Equipment maintenance', group: 'Inventory & assets', perm: 'reports.ops', params: [], desc: 'Repair tickets and next scheduled maintenance per asset.', build: (db) => T('Equipment maintenance report', ['Asset', 'Source', 'Issue', 'Opened', 'Closed', 'Cost', 'Status', 'Next scheduled maintenance'], ['text', 'text', 'text', 'text', 'text', 'money', 'text', 'text'],
    live(db.tickets).map((t) => { const a = db.assets.find((x) => x.id === t.asset_id)!; return [a.name, t.source, t.description, fmtDate(t.opened_on), fmtDate(t.closed_on), t.cost, t.status, a ? fmtDate(nextDue(a)) : '']; })) },
  { id: 'calendar', title: 'Booking calendar', group: 'Operations', perm: 'reports.ops', params: ['range'], desc: 'All bookings by date with crew, vehicle and status.', build: (db, p) => T('Booking calendar', ['Date', 'Time', 'Job', 'Client', 'Site', 'Services', 'Leader', 'Crew', 'Vehicle', 'Status'], ['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text'],
    live(db.jobs).filter((j) => j.start_at.slice(0, 10) >= p.from && j.start_at.slice(0, 10) <= p.to).sort((a, b) => a.start_at.localeCompare(b.start_at)).map((j) => [fmtDate(j.start_at), `${fmtTime(j.start_at)}–${fmtTime(j.end_at)}`, j.number, cn(db, j.client_id), db.sites.find((s) => s.id === j.site_id)?.name ?? '', svcName(db, j.service_codes), en(db, j.leader_id), j.crew_ids.map((id) => en(db, id)).join(', '), db.assets.find((a) => a.id === j.vehicle_id)?.name ?? '', j.status]), rng(p)) },
  { id: 'dispatch', title: 'Job workflow log', group: 'Operations', perm: 'dispatch.view', params: ['range'], desc: 'Every job through the 7-step workflow: step times, scope-approval route, original quote, approved variations and final contract value.', build: (db, p) => T('Job workflow log', ['Job', 'Client', 'Status', 'Leader', 'Job prep', 'Departed', 'Checked in', 'Scope approval', 'Scope route', 'Work started', 'Work finished', 'Handover signed', 'Left site', 'Arrived HQ', 'Closed', 'Panels counted', 'Original quote', 'Approved variations', 'Final contract'], ['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'num', 'money', 'money', 'money'],
    live(db.workflows).filter((w) => w.created_at.slice(0, 10) >= p.from && w.created_at.slice(0, 10) <= p.to).map((w) => { const j = db.jobs.find((x) => x.id === w.job_id); const fc = j ? finalContract(db, j) : undefined; return [j?.number ?? '', cn(db, j?.client_id ?? ''), j?.status ?? '', en(db, j?.leader_id), fmtDateTime(w.hq_at), fmtDateTime(w.disp_at), fmtTime(w.arr_at), fmtTime(w.conf_at), w.conf_mode === 'confirmed' ? 'Confirmed – no changes' : w.conf_mode === 'approval' ? 'Client signed' : '', fmtTime(w.start_at), fmtTime(w.finish_at), fmtTime(w.rep_at), fmtTime(w.leave_at), fmtTime(w.hqa_at), fmtDateTime(w.closed_at), panelTotals(w.panels).total, fc?.originalTotal ?? 0, fc?.variationsTotal ?? 0, fc?.finalTotal ?? 0]; }), rng(p)) },
  { id: 'incidents', title: 'Incident reports', group: 'Operations', perm: 'dispatch.view', params: ['range'], desc: 'Missing / damaged assets, shortages and other incidents with status and resolution.', build: (db, p) => T('Incident reports', ['No.', 'Raised', 'Type', 'Severity', 'Job', 'Asset', 'Description', 'Status', 'Resolution'], ['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text'],
    live(db.incidents).filter((i) => i.created_at.slice(0, 10) >= p.from && i.created_at.slice(0, 10) <= p.to).map((i) => [i.number, fmtDate(i.created_at.slice(0, 10)), i.type, i.severity, db.jobs.find((j) => j.id === i.job_id)?.number ?? '', db.assets.find((a) => a.id === i.asset_id)?.code ?? '', i.description, i.status, i.resolution ?? '']), rng(p)) },
  { id: 'jobdone', title: 'Job completion', group: 'Operations', perm: 'reports.ops', params: ['range'], desc: 'Completed jobs with timing, rating and findings.', build: (db, p) => T('Job completion report', ['Job', 'Client', 'Site', 'Services', 'Scheduled', 'Completed', 'Leader', 'Rating', 'Findings', 'Signed off by'], ['text', 'text', 'text', 'text', 'text', 'text', 'text', 'num', 'text', 'text'],
    live(db.jobs).filter((j) => isDone(j.status) && (j.completed_at ?? '').slice(0, 10) >= p.from && (j.completed_at ?? '').slice(0, 10) <= p.to).map((j) => [j.number, cn(db, j.client_id), db.sites.find((s) => s.id === j.site_id)?.name ?? '', svcName(db, j.service_codes), fmtDateTime(j.start_at), fmtDateTime(j.completed_at), en(db, j.leader_id), j.client_rating ?? 0, j.findings, j.signoff_name ?? '']), rng(p)) },
  { id: 'service', title: 'Service report (per job)', group: 'Operations', perm: 'reports.ops', params: ['job'], desc: 'Client-facing service report PDF with photos, checklist, findings and sign-off.', build: (db, p) => { const j = db.jobs.find((x) => x.id === p.job); return T('Service report', ['Field', 'Detail'], ['text', 'text'], j ? [['Job', j.number], ['Client', cn(db, j.client_id)], ['Scope', j.scope], ['Findings', j.findings || '—'], ['Damage report', j.damage_report || '—'], ['Completed', fmtDateTime(j.completed_at)], ['Signed off by', j.signoff_name ?? '—'], ['Rating', j.client_rating ? `${j.client_rating}/5` : '—']] : []); } },
  { id: 'quotes', title: 'Quotations sent / won / lost', group: 'Sales', perm: 'sales.view', params: ['range'], desc: 'Quotation outcomes with value and reasons.', build: (db, p) => {
    const q = live(db.quotations).filter((x) => x.issue_date >= p.from && x.issue_date <= p.to);
    return T('Quotations sent-won-lost', ['Quotation', 'Client', 'Issued', 'Valid until', 'Total', 'Status', 'Outcome', 'Reason'], ['text', 'text', 'text', 'text', 'money', 'text', 'text', 'text'],
      q.map((x) => [x.number, cn(db, x.client_id), fmtDate(x.issue_date), fmtDate(x.valid_until), docTotals(x.items, x.discount, x.vat_mode, x.vat_rate).total, x.status, x.status === 'Approved' ? 'Won' : x.status === 'Rejected' || x.status === 'Expired' ? 'Lost' : x.status === 'Sent' ? 'Open' : 'Draft', x.reject_reason ?? '']), `${rng(p)} · won ${q.filter((x) => x.status === 'Approved').length}, lost ${q.filter((x) => ['Rejected', 'Expired'].includes(x.status)).length}`);
  } },
  { id: 'revenue', title: 'Revenue report', group: 'Finance', perm: 'reports.finance', params: ['range'], desc: 'Approved invoices with VAT, withholding and collections.', build: (db, p) => {
    const inv = live(db.invoices).filter((i) => i.status === 'Approved' && i.issue_date >= p.from && i.issue_date <= p.to);
    const rows = inv.map((i) => { const t = invoiceTotals(i); return [i.number, cn(db, i.client_id), fmtDate(i.issue_date), fmtDate(i.due_date), t.net, t.vat, t.total, t.wht, invoiceSettled(db, i).cash, invoiceBalance(db, i)]; });
    return T('Revenue report', ['Invoice', 'Client', 'Issued', 'Due', 'Net of VAT', 'VAT', 'Total', 'Expected WHT', 'Collected', 'Balance'], ['text', 'text', 'text', 'text', 'money', 'money', 'money', 'money', 'money', 'money'], rows, rng(p), ['Total', '', '', '', ...[4, 5, 6, 7, 8, 9].map((k) => sum(rows, (r) => +r[k]))]);
  } },
  { id: 'expenses', title: 'Expense report', group: 'Finance', perm: 'reports.finance', params: ['range'], desc: 'Approved expenses by category and payee.', build: (db, p) => {
    const ex = live(db.expenses).filter((e) => !e.reversed && e.approval === 'Approved' && e.date >= p.from && e.date <= p.to);
    const rows = ex.sort((a, b) => a.date.localeCompare(b.date)).map((e) => [fmtDate(e.date), e.payee, e.category, db.jobs.find((j) => j.id === e.job_id)?.number ?? '', e.method, e.amount, e.vat, e.wht, e.paid ? 'Paid' : 'Unpaid']);
    return T('Expense report', ['Date', 'Payee', 'Category', 'Job', 'Method', 'Amount', 'VAT', 'WHT', 'Payment'], ['text', 'text', 'text', 'text', 'text', 'money', 'money', 'money', 'text'], rows, rng(p), ['Total', '', '', '', '', sum(rows, (r) => +r[5]), sum(rows, (r) => +r[6]), sum(rows, (r) => +r[7]), '']);
  } },
  { id: 'aging', title: 'Receivables aging', group: 'Finance', perm: 'reports.finance', params: [], desc: 'Outstanding invoices in Current, 1–30, 31–60, 61–90 and 90+ days overdue buckets.', build: (db) => {
    const m = new Map<string, Record<string, number>>();
    for (const i of live(db.invoices).filter((x) => x.status === 'Approved')) { const b = invoiceBalance(db, i); if (b <= 0.005) continue; const e = m.get(i.client_id) ?? {}; const k = agingBucket(i.due_date); e[k] = (e[k] || 0) + b; m.set(i.client_id, e); }
    const rows = [...m.entries()].map(([id, e]) => [cn(db, id), ...AGING_BUCKETS.map((b) => e[b] || 0), sum(Object.values(e), (x) => x)]).sort((a, b) => +b[6] - +a[6]);
    return T('Receivables aging', ['Client', 'Current', '1–30 days', '31–60 days', '61–90 days', '90+ days', 'Total'], ['text', 'money', 'money', 'money', 'money', 'money', 'money'], rows, `As of ${fmtDate(today())}`, ['Total', ...[1, 2, 3, 4, 5, 6].map((k) => sum(rows, (r) => +r[k]))]);
  } },
  { id: 'statement', title: 'Client statement of account', group: 'Finance', perm: 'reports.finance', params: ['client'], desc: 'Charges, payments and running balance for one client.', build: (db, p) => {
    let bal = 0; const ev = [...live(db.invoices).filter((i) => i.client_id === p.client && i.status === 'Approved').map((i) => ({ d: i.issue_date, r: i.number, t: 'Invoice', dr: invoiceTotals(i).total, cr: 0 })), ...live(db.payments).filter((x) => x.client_id === p.client && paymentCounts(x)).map((x) => ({ d: x.date, r: x.receipt_no, t: `Payment (${x.method})`, dr: 0, cr: x.amount + x.wht_amount }))].sort((a, b) => a.d.localeCompare(b.d));
    return T('Client statement of account', ['Date', 'Reference', 'Description', 'Charges', 'Payments', 'Balance'], ['text', 'text', 'text', 'money', 'money', 'money'], ev.map((e) => { bal += e.dr - e.cr; return [fmtDate(e.d), e.r, e.t, e.dr, e.cr, bal]; }), cn(db, p.client));
  } },
  { id: 'pnl', title: 'Profit and loss summary', group: 'Finance', perm: 'reports.finance', params: ['range'], desc: 'Revenue, direct costs, gross profit, operating expenses and net profit.', build: (db, p) => {
    const x = profitAndLoss(db, p.from, p.to);
    const rows: (string | number)[][] = [['Revenue (billed, ex-VAT)', x.revenue, ''], ['Direct labor', -x.direct.labor, ''], ['Materials used', -x.direct.materials, ''], ['Transport & fuel', -x.direct.transport, ''], ['Equipment allocation', -x.direct.equipment, ''], ['Subcontractors', -x.direct.subcontractor, ''], ['Other job costs', -x.direct.other, ''], ['GROSS PROFIT', x.grossProfit, pct(x.grossMargin)], ...Object.entries(x.opexByCategory).map(([k, v]) => [`Opex – ${k}`, -v, '']), ['Total operating expenses', -x.opex, ''], ['NET PROFIT', x.netProfit, pct(x.netMargin)]];
    return T('Profit and loss summary', ['Line', 'Amount', 'Margin'], ['text', 'money', 'text'], rows, rng(p));
  } },
  { id: 'jobprofit', title: 'Job profitability', group: 'Finance', perm: 'reports.finance', params: ['range'], desc: 'Revenue less direct labor, materials, transport, equipment, subcontractors and other job costs.', build: (db, p) => T('Job profitability', ['Job', 'Client', 'Revenue', 'Basis', 'Labor', 'Materials', 'Transport', 'Equipment', 'Subcon', 'Other', 'Total cost', 'Gross profit', 'Margin %', 'Cost basis', 'Collected (verified)', 'Outstanding'], ['text', 'text', 'money', 'text', 'money', 'money', 'money', 'money', 'money', 'money', 'money', 'money', 'pct', 'text', 'money', 'money'],
    jobProfitRows(db, p.from, p.to).map((r) => [r.job.number, cn(db, r.clientId), r.cost.revenue, r.cost.revenueBasis, r.cost.labor, r.cost.materials, r.cost.transport, r.cost.equipment, r.cost.subcontractor, r.cost.other, r.cost.total, r.cost.grossProfit, r.cost.margin, r.cost.estimated ? 'Estimated' : 'Actual', r.cost.collected, r.cost.outstanding]), rng(p)) },
  { id: 'clientprofit', title: 'Client profitability', group: 'Finance', perm: 'reports.finance', params: ['range'], desc: 'Gross profit by client.', build: (db, p) => T('Client profitability', ['Client', 'Jobs', 'Revenue', 'Direct cost', 'Gross profit', 'Margin %', 'Basis'], ['text', 'num', 'money', 'money', 'money', 'pct', 'text'], aggregateProfit(jobProfitRows(db, p.from, p.to).map((r) => ({ key: r.clientId, label: cn(db, r.clientId), revenue: r.cost.revenue, cost: r.cost.total, estimated: r.cost.estimated }))).map((a) => [a.label, a.jobs, a.revenue, a.cost, a.gp, a.margin, a.estimated ? 'Includes estimates' : 'Actual']), rng(p)) },
  { id: 'svcprofit', title: 'Service-type profitability', group: 'Finance', perm: 'reports.finance', params: ['range'], desc: 'Gross profit by service line.', build: (db, p) => T('Service-type profitability', ['Service', 'Jobs', 'Revenue', 'Direct cost', 'Gross profit', 'Margin %', 'Basis'], ['text', 'num', 'money', 'money', 'money', 'pct', 'text'], aggregateProfit(serviceProfitRows(db, p.from, p.to)).map((a) => [a.label, a.jobs, a.revenue, a.cost, a.gp, a.margin, a.estimated ? 'Includes estimates' : 'Actual']), rng(p)) },
  ...([['leader', 'team leader'], ['crew', 'crew member'], ['service', 'service type']] as const).map(([k, nm]): Def => ({ id: `sat-${k}`, title: `Client satisfaction by ${nm}`, group: 'Operations', perm: 'reports.ops', params: ['range'], desc: `Average Client Satisfaction Check rating (1 = Not Satisfied, 3 = Very Satisfied) by ${nm}.`, build: (db, p) => {
    const st = satisfactionStats(db, p.from, p.to); const a = k === 'leader' ? st.byLeader : k === 'crew' ? st.byCrew : st.byService;
    return T(`Client satisfaction by ${nm}`, [nm[0].toUpperCase() + nm.slice(1), 'Responses', 'Average (1-3)', 'Not Satisfied', 'Satisfied', 'Very Satisfied'], ['text', 'num', 'num', 'num', 'num', 'num'], a.map((x) => [x.label, x.n, x.avg, x.notSat, x.sat, x.very]), rng(p), ['TOTAL', st.n, st.avg, st.dist[1], st.dist[2], st.dist[3]] as never);
  } })),
  { id: 'sat-month', title: 'Client satisfaction by month', group: 'Operations', perm: 'reports.ops', params: ['range'], desc: 'Monthly average rating trend.', build: (db, p) => { const st = satisfactionStats(db, p.from, p.to); return T('Client satisfaction by month', ['Month', 'Responses', 'Average (1-3)'], ['text', 'num', 'num'], st.monthly.map((m) => [m.month, m.n, m.avg]), rng(p)); } },
  { id: 'sat-followup', title: 'Client feedback & follow-ups', group: 'Operations', perm: 'reports.ops', params: ['range'], desc: 'Every Client Satisfaction Check with rating, ticked items, comment, issue category and Admin follow-up status.', build: (db, p) =>
    T('Client feedback & follow-ups', ['Service date', 'Job', 'Client', 'Team leader', 'Services', 'Rating', 'Issue', 'Ticked items', 'Comment', 'Follow-up', 'Acknowledged by', 'Follow-up note'], ['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text'],
      live(db.client_feedback).filter((f) => f.service_date >= p.from && f.service_date <= p.to).sort((a, b) => a.service_date.localeCompare(b.service_date)).map((f) => [fmtDate(f.service_date), db.jobs.find((j) => j.id === f.job_id)?.number ?? '', cn(db, f.client_id), en(db, f.leader_id), svcName(db, f.service_codes), RATING_LABEL[f.rating], f.issue_category ?? '', f.aspects.join('; '), f.comment ?? '', f.follow_up === 'None' ? '' : f.follow_up, db.users.find((u) => u.id === f.ack_by)?.name ?? '', f.ack_note ?? '']), rng(p)) },
  { id: 'payments', title: 'Payments register', group: 'Finance', perm: 'reports.finance', params: ['range'], desc: 'Every recorded payment with method details, received by, verification status and cheque clearing. Only Verified (and Cleared cheque) payments reduce balances.', build: (db, p) => {
    const rows = live(db.payments).filter((x) => x.date >= p.from && x.date <= p.to).sort((a, b) => (a.paid_at ?? a.date).localeCompare(b.paid_at ?? b.date));
    return T('Payments register', ['Payment #', 'Date & time', 'Client', 'Job', 'Invoice', 'Method', 'Reference', 'Bank', 'Cheque / transfer date', 'Clearing', 'Received by', 'Amount', 'WHT credited', 'Status', 'Verified by'], ['text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'text', 'money', 'money', 'text', 'text'],
      rows.map((x) => [x.receipt_no, x.paid_at ? fmtDateTime(x.paid_at) : fmtDate(x.date), cn(db, x.client_id), db.jobs.find((j) => j.id === x.job_id)?.number ?? '', db.invoices.find((i) => i.id === x.invoice_id)?.number ?? '', x.method, x.reference, x.bank_name ?? '', x.method === 'Cheque' ? fmtDate(x.cheque_date) : x.method === 'Bank Transfer' ? fmtDate(x.transfer_date) : '', x.cheque_status ?? '', x.received_by ?? '', x.amount, x.wht_amount, paymentStatusLabel(x), db.users.find((u) => u.id === x.verified_by)?.name ?? '']), rng(p),
      ['TOTAL VERIFIED', '', '', '', '', '', '', '', '', '', '', sum(rows.filter(paymentCounts), (x) => x.amount), sum(rows.filter(paymentCounts), (x) => x.wht_amount), '', ''] as never);
  } },
  { id: 'disc-register', title: 'Discount requests register', group: 'Finance', perm: 'reports.finance', params: ['range'], desc: 'Every Discount Request with its status, Team Leader, reason, approved amount and approval note (audit view).', build: (db, p) =>
    T('Discount requests register', ['Request', 'Job', 'Client', 'Team Leader', 'Submitted', 'Original total', 'Type', 'Requested', 'Approved', 'Final amount', 'Status', 'Reason', 'Approved / rejected by', 'Note'], ['text', 'text', 'text', 'text', 'text', 'money', 'text', 'money', 'money', 'money', 'text', 'text', 'text', 'text'],
      live(db.discount_requests).filter((r) => r.submitted_at.slice(0, 10) >= p.from && r.submitted_at.slice(0, 10) <= p.to).sort((a, b) => a.submitted_at.localeCompare(b.submitted_at)).map((r) => { const j = db.jobs.find((x) => x.id === r.job_id); return [r.number, j?.number ?? '', cn(db, r.client_id), en(db, j?.leader_id), fmtDate(r.submitted_at.slice(0, 10)), r.base_total, r.kind === 'percent' ? `${r.value}%` : 'Fixed ₱', r.requested_amount, r.approved_amount ?? 0, r.approved_final ?? r.proposed_final, r.status, r.reason, db.users.find((u) => u.id === r.decided_by)?.name ?? '', r.decision_note ?? '']; }), rng(p)) },
  ...(['client', 'service', 'leader', 'reason', 'month', 'job'] as DiscountView[]).map((view): Def => {
    const nm = { client: 'client', service: 'service type', leader: 'Team Leader', reason: 'reason', month: 'month', job: 'job' }[view];
    return { id: `disc-${view}`, title: `Discounts by ${nm}`, group: 'Finance', perm: 'reports.finance', params: ['range'], desc: `Management-approved discounts granted, grouped by ${nm}, with the effect on revenue, gross profit and margin.`, build: (db, p) => {
      const rows = discountRows(db, p.from, p.to); const a = discountAggregate(db, rows, view);
      const tot = ['TOTAL', a.reduce((s, x) => s + x.count, 0), sum(a, (x) => x.granted), '', sum(a, (x) => x.revenueBefore), sum(a, (x) => x.revenueAfter), sum(a, (x) => x.gpBefore), sum(a, (x) => x.gpAfter)];
      return T(`Discounts by ${nm}`, [nm[0].toUpperCase() + nm.slice(1), 'Discounts', 'Granted (incl. VAT)', 'Avg % of bill', 'Revenue before', 'Revenue after', 'GP before', 'GP after', 'Margin before %', 'Margin after %'], ['text', 'num', 'money', 'pct', 'money', 'money', 'money', 'money', 'pct', 'pct'],
        a.map((x) => [x.label, x.count, x.granted, x.avgPct, x.revenueBefore, x.revenueAfter, x.gpBefore, x.gpAfter, x.marginBefore, x.marginAfter]), rng(p), [tot[0], tot[1], tot[2], '', tot[4], tot[5], tot[6], tot[7], '', ''] as never);
    } };
  }),
];

export default function Reports() {
  const { db, can } = useAuth();
  const list = DEFS.filter((d) => can(d.perm));
  const [id, setId] = useState(list[0]?.id ?? '');
  const t = today();
  const [p, setP] = useState<P>({ from: monthStart(addDays(monthStart(t), -1)), to: monthEnd(t) > t ? t : monthEnd(t), date: t, month: t.slice(0, 7), period: db.periods.find((x) => db.runs.some((r) => r.period_id === x.id))?.id ?? '', client: db.clients[0]?.id ?? '', job: db.jobs.find((j) => isDone(j.status))?.id ?? '' });
  const def = DEFS.find((d) => d.id === id);
  const table = useMemo(() => (def && can(def.perm) ? def.build(db, p) : null), [def, db, p, can]);
  const set = <K extends keyof P>(k: K, v: P[K]) => setP((o) => ({ ...o, [k]: v }));
  const groups = [...new Set(list.map((d) => d.group))];
  const per = db.periods.find((x) => x.id === p.period); const run = db.runs.find((r) => r.period_id === p.period);
  const fmt = (v: string | number, ty?: string) => (typeof v === 'number' ? (ty === 'money' ? money(v) : ty === 'pct' ? pct(v) : v.toLocaleString('en-PH', { maximumFractionDigits: 2 })) : v);

  if (!list.length) return <div className="alert warn">No reports are enabled for your role.</div>;
  return (
    <>
      <PageHead title="Reports" sub="Every report downloads as PDF or Excel. Financial reports follow your role's controlled access." />
      <div className="reports-grid">
        <div className="card report-list">
          {groups.map((g) => <div key={g}><div className="small muted" style={{ padding: '10px 14px 4px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>{g}</div>{list.filter((d) => d.group === g).map((d) => <button key={d.id} onClick={() => setId(d.id)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', border: 0, background: d.id === id ? 'var(--teal-bg)' : 'none', borderLeft: d.id === id ? '3px solid var(--teal)' : '3px solid transparent', cursor: 'pointer', color: 'var(--navy)', fontWeight: d.id === id ? 650 : 500 }}>{d.title}</button>)}</div>)}
        </div>
        <div className="stack">
          {def && table && (
            <Card title={def.title} actions={<><Badge tone="blue">{def.group}</Badge></>}>
              <p className="muted" style={{ marginTop: 0 }}>{def.desc}</p>
              <div className="filterbar" style={{ marginBottom: 12 }}>
                {def.params.includes('range') && <><Field label="From"><input type="date" value={p.from} onChange={(e) => set('from', e.target.value)} /></Field><Field label="To"><input type="date" value={p.to} onChange={(e) => set('to', e.target.value)} /></Field></>}
                {def.params.includes('date') && <Field label="Date"><input type="date" value={p.date} onChange={(e) => set('date', e.target.value)} /></Field>}
                {def.params.includes('month') && <Field label="Month"><input type="month" value={p.month} onChange={(e) => set('month', e.target.value)} /></Field>}
                {def.params.includes('period') && <Field label="Payroll period"><select value={p.period} onChange={(e) => set('period', e.target.value)}>{live(db.periods).sort((a, b) => b.start.localeCompare(a.start)).map((x) => <option key={x.id} value={x.id}>{x.label} · {x.status}</option>)}</select></Field>}
                {def.params.includes('client') && <Field label="Client"><select value={p.client} onChange={(e) => set('client', e.target.value)}>{live(db.clients).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
                {def.params.includes('job') && <Field label="Completed job"><select value={p.job} onChange={(e) => set('job', e.target.value)}>{live(db.jobs).filter((j) => isDone(j.status)).sort((a, b) => b.start_at.localeCompare(a.start_at)).map((j) => <option key={j.id} value={j.id}>{j.number} · {cn(db, j.client_id)}</option>)}</select></Field>}
                <span className="grow" />
                <button className="btn primary" onClick={() => attempt(() => exportXlsx(table))}>Download Excel</button>
                <button className="btn navy" onClick={() => attempt(() => exportPdf(table))}>Download PDF</button>
                <button className="btn" onClick={() => attempt(() => exportCsv(table))}>CSV</button>
                {def.id === 'statement' && <button className="btn" onClick={() => attempt(() => statementPdf(db, p.client, t))}>Formal statement (PDF)</button>}
                {def.id === 'service' && <button className="btn" onClick={() => { const j = db.jobs.find((x) => x.id === p.job); if (j) attempt(() => serviceReportPdf(db, j)); }}>Service report (PDF)</button>}
              </div>
              <div className="tbl-wrap" style={{ maxHeight: 460, overflow: 'auto', border: '1px solid var(--line-2)', borderRadius: 6 }}>
                <table className="tbl"><thead><tr>{table.headers.map((h, i) => <th key={h + i} className={table.types?.[i] && table.types[i] !== 'text' ? 'num' : ''}>{h}</th>)}</tr></thead>
                  <tbody>{table.rows.slice(0, 300).map((r, i) => <tr key={i}>{r.map((c, k) => <td key={k} className={table.types?.[k] && table.types[k] !== 'text' ? 'num' : ''}>{fmt(c, table.types?.[k])}</td>)}</tr>)}</tbody>
                  {table.totals && <tfoot><tr>{table.totals.map((c, k) => <td key={k} className={table.types?.[k] && table.types[k] !== 'text' ? 'num' : ''}>{fmt(c, table.types?.[k])}</td>)}</tr></tfoot>}
                </table>
                {!table.rows.length && <div className="empty">No data for the selected filters.</div>}
              </div>
              <div className="small muted" style={{ marginTop: 6 }}>{table.rows.length} row(s){table.rows.length > 300 ? ' — preview shows first 300; exports include all' : ''}</div>
              {def.id === 'payroll' && per && run && (
                <div style={{ marginTop: 14 }}><h3 style={{ marginBottom: 8 }}>Payslips (PDF)</h3><div className="row">{run.lines.map((l) => <button key={l.employee_id} className="btn sm" onClick={() => attempt(() => payslipPdf(db, per, l))}>{en(db, l.employee_id)}</button>)}</div></div>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
void onHand;
