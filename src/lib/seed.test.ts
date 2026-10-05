import { describe, expect, it } from 'vitest';
import { seedDB } from './seed';
import { findConflicts, invoiceBalance, jobCost, onHand, profitAndLoss } from './business';
import { monthEnd, monthStart, today } from './util';

describe('seed data integrity', () => {
  const db = seedDB();
  it('has data in every module', () => {
    for (const k of ['clients', 'sites', 'jobs', 'employees', 'attendance', 'items', 'stock', 'assets', 'checkouts', 'quotations', 'invoices', 'payments', 'expenses', 'periods', 'runs'] as const) {
      expect(db[k].length, k).toBeGreaterThan(0);
    }
  });
  it('has no scheduling conflicts', () => {
    for (const j of db.jobs.filter((x) => !['Cancelled', 'Rescheduled'].includes(x.status))) {
      const others = { jobs: db.jobs.filter((x) => x.id !== j.id) };
      expect(findConflicts(others, j).map((c) => `${c.kind}:${c.refId}:${j.number}/${c.job.number}`)).toEqual([]);
    }
  });
  it('never has negative stock', () => {
    for (const i of db.items) expect(onHand(db, i.id), i.code).toBeGreaterThanOrEqual(0);
  });
  it('has no asset released to two jobs', () => {
    const rel = db.checkouts.filter((c) => c.status === 'Released');
    expect(new Set(rel.map((c) => c.asset_id)).size).toBe(rel.length);
  });
  it('invoice balances are sane', () => {
    for (const i of db.invoices) expect(invoiceBalance(db, i)).toBeGreaterThanOrEqual(-0.01);
  });
  it('produces a P&L for the month', () => {
    const p = profitAndLoss(db, monthStart(today()), monthEnd(today()));
    console.log('P&L', p);
    expect(p.revenue).toBeGreaterThanOrEqual(0);
  });
  it('costs a completed job', () => {
    const j = db.jobs.find((x) => x.status === 'Completed')!;
    const c = jobCost(db, j);
    console.log(j.number, c);
    expect(c.total).toBeGreaterThan(0);
  });
});
