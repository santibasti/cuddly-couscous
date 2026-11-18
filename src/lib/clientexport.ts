// The list of clients that have jobs, for an ad platform (names, address, contact, final billing). Pure: the Jobs page downloads it as CSV or Excel.
import { invoiceTotals } from './business';
import type { ExportTable } from './export';
import type { DB, Job } from './types';

const off = (j: Job) => ['Cancelled', 'Rescheduled'].includes(j.status);
const money = (n: number) => Math.round((n || 0) * 100) / 100;

/** One row per client with at least one booked job (cancelled and rescheduled bookings do not count). "Final billing" = the total of the client's approved invoices (VAT and discounts as invoiced). */
export function clientJobsTable(db: DB): ExportTable {
  const jobs = (db.jobs ?? []).filter((j) => !j.deleted_at && !off(j));
  const rows = (db.clients ?? []).filter((c) => !c.deleted_at).map((c) => {
    const mine = jobs.filter((j) => j.client_id === c.id); if (!mine.length) return null;
    const invs = (db.invoices ?? []).filter((i) => !i.deleted_at && i.client_id === c.id && i.status === 'Approved');
    const billed = invs.reduce((s, i) => s + invoiceTotals(i).total, 0);
    const last = mine.map((j) => j.start_at.slice(0, 10)).sort().at(-1) ?? '';
    return { c, jobs: mine.length, last, billed: money(billed), invoices: invs.length };
  }).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => b.billed - a.billed || a.c.name.localeCompare(b.c.name));
  return {
    title: 'Clients with jobs', subtitle: 'for the ad platform', headers: ['Name', 'Contact person', 'Address', 'Mobile', 'Email', 'Jobs', 'Last job', 'Invoices', 'Final billing (PHP)'],
    types: ['text', 'text', 'text', 'text', 'text', 'num', 'text', 'num', 'money'],
    rows: rows.map((r) => [r.c.name, r.c.contact_person ?? '', r.c.address || r.c.billing_address || '', r.c.mobile ?? '', r.c.email ?? '', r.jobs, r.last, r.invoices, r.billed]),
    totals: ['Total', '', '', '', '', rows.reduce((s, r) => s + r.jobs, 0), '', rows.reduce((s, r) => s + r.invoices, 0), money(rows.reduce((s, r) => s + r.billed, 0))],
  };
}
