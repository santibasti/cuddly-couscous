// The list of clients that have jobs, for an ad platform (names, address, contact, final billing). Pure: the Jobs page downloads it as CSV.
import { finalContract, invoiceTotals } from './business';
import type { ExportTable } from './export';
import type { DB, Job } from './types';

const off = (j: Job) => ['Cancelled', 'Rescheduled'].includes(j.status);
const money = (n: number) => Math.round((n || 0) * 100) / 100;
export interface ClientExportOpts { from?: string; to?: string }

/** The billing of one job whether or not it has been invoiced: the approved invoices when there are any, otherwise the final contract value (quotation + approved variations − approved discount). */
export function jobBilling(db: DB, j: Job): { amount: number; invoiced: boolean } {
  const invs = (db.invoices ?? []).filter((i) => !i.deleted_at && i.job_id === j.id && i.status === 'Approved');
  if (invs.length) return { amount: money(invs.reduce((s, i) => s + invoiceTotals(i).total, 0)), invoiced: true };
  return { amount: money(finalContract(db, j).payableTotal), invoiced: false };
}

/** One row per client with at least one booked job in the period (job start date, From and To inclusive; empty = no limit). Cancelled and rescheduled bookings do not count. */
export function clientJobsTable(db: DB, o: ClientExportOpts = {}): ExportTable {
  const inRange = (j: Job) => { const d = j.start_at.slice(0, 10); return (!o.from || d >= o.from) && (!o.to || d <= o.to); };
  const jobs = (db.jobs ?? []).filter((j) => !j.deleted_at && !off(j) && inRange(j));
  const rows = (db.clients ?? []).filter((c) => !c.deleted_at).map((c) => {
    const mine = jobs.filter((j) => j.client_id === c.id); if (!mine.length) return null;
    const bills = mine.map((j) => jobBilling(db, j)); const invoiced = money(bills.filter((b) => b.invoiced).reduce((s, b) => s + b.amount, 0)), open = money(bills.filter((b) => !b.invoiced).reduce((s, b) => s + b.amount, 0));
    return { c, jobs: mine.length, last: mine.map((j) => j.start_at.slice(0, 10)).sort().at(-1) ?? '', invoiced, open, total: money(invoiced + open) };
  }).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => b.total - a.total || a.c.name.localeCompare(b.c.name));
  const period = o.from || o.to ? `jobs from ${o.from || 'the start'} to ${o.to || 'today and later'}` : 'all jobs';
  return {
    title: `Clients with jobs ${o.from || o.to ? `${o.from || 'start'} to ${o.to || 'end'}` : 'all dates'}`, subtitle: period,
    headers: ['Name', 'Contact person', 'Address', 'Mobile', 'Email', 'Jobs', 'Last job', 'Invoiced (PHP)', 'Not yet invoiced (PHP)', 'Final billing (PHP)'],
    types: ['text', 'text', 'text', 'text', 'text', 'num', 'text', 'money', 'money', 'money'],
    rows: rows.map((r) => [r.c.name, r.c.contact_person ?? '', r.c.address || r.c.billing_address || '', r.c.mobile ?? '', r.c.email ?? '', r.jobs, r.last, r.invoiced, r.open, r.total]),
    totals: ['Total', '', '', '', '', rows.reduce((s, r) => s + r.jobs, 0), '', money(rows.reduce((s, r) => s + r.invoiced, 0)), money(rows.reduce((s, r) => s + r.open, 0)), money(rows.reduce((s, r) => s + r.total, 0))],
  };
}
