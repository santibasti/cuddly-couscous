// "Previous years": the bills entered on clients from before the system, set against what the system billed. For comparison only:
// these are not invoices, so they never enter Finance, the BIR lists, the books or the dashboard totals.
import type { DB } from './types';
import { invoiceTotals } from './business';
import { round2 } from './util';

export interface EarlierYear { year: number; total: number; bills: number; clients: number; avg: number; months: number[]; bestMonth: number; top: { name: string; total: number; bills: number }[] }

export function earlierYears(db: Pick<DB, 'clients'>): EarlierYear[] {
  const by = new Map<number, { months: number[]; per: Map<string, { name: string; total: number; bills: number }>; bills: number; total: number }>();
  for (const c of db.clients) {
    if (c.deleted_at) continue;
    for (const b of c.past_bills ?? []) {
      const y = +b.date.slice(0, 4), m = +b.date.slice(5, 7) - 1; if (!y || m < 0 || m > 11 || !(b.total > 0)) continue;
      const e = by.get(y) ?? { months: Array(12).fill(0), per: new Map(), bills: 0, total: 0 }; by.set(y, e);
      e.months[m] += b.total; e.bills += 1; e.total += b.total;
      const p = e.per.get(c.id) ?? { name: c.name, total: 0, bills: 0 }; p.total += b.total; p.bills += 1; e.per.set(c.id, p);
    }
  }
  return [...by.entries()].sort((a, b) => b[0] - a[0]).map(([year, e]) => {
    const months = e.months.map(round2);
    return { year, total: round2(e.total), bills: e.bills, clients: e.per.size, avg: round2(e.total / e.bills), months, bestMonth: months.indexOf(Math.max(...months)), top: [...e.per.values()].map((p) => ({ ...p, total: round2(p.total) })).sort((a, b) => b.total - a.total).slice(0, 5) };
  });
}

/** What the system billed in each month of a year (approved invoices, ex-VAT: the same basis as the dashboard revenue). */
export function systemMonths(db: Pick<DB, 'invoices'>, year: number): number[] {
  const out: number[] = Array(12).fill(0);
  for (const i of db.invoices) { if (i.deleted_at || i.status !== 'Approved' || +i.issue_date.slice(0, 4) !== year) continue; out[+i.issue_date.slice(5, 7) - 1] += invoiceTotals(i).net; }
  return out.map(round2);
}
