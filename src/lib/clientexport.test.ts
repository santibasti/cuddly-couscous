import { describe, expect, it } from 'vitest';
import { clientJobsTable, jobBilling } from './clientexport';
import { seedDB } from './seed';
describe('client list for the ad platform', () => {
  it('lists each client with a booked job once, with address, contact and billing; cancelled bookings do not count', () => {
    const db = seedDB(); const t = clientJobsTable(db);
    expect(t.headers).toEqual(['Name', 'Contact person', 'Address', 'Mobile', 'Email', 'Jobs', 'Last job', 'Invoiced (PHP)', 'Not yet invoiced (PHP)', 'Final billing (PHP)']);
    expect(new Set(t.rows.map((r) => r[0])).size).toBe(t.rows.length); expect(t.rows.length).toBeGreaterThan(0);
    const withJobs = new Set((db.jobs ?? []).filter((j) => !j.deleted_at && !['Cancelled', 'Rescheduled'].includes(j.status)).map((j) => j.client_id)); expect(t.rows.length).toBe((db.clients ?? []).filter((c) => !c.deleted_at && withJobs.has(c.id)).length);
    for (const r of t.rows) expect(Number(r[9])).toBeCloseTo(Number(r[7]) + Number(r[8]), 2);
    expect(Number(t.rows[0][9])).toBeGreaterThanOrEqual(Number(t.rows[t.rows.length - 1][9]));
  });
  it('includes the billing of jobs that have no invoice yet (the final contract value)', () => {
    const db = seedDB(); const open = db.jobs.find((j) => !j.deleted_at && !['Cancelled', 'Rescheduled'].includes(j.status) && !db.invoices.some((i) => i.job_id === j.id && i.status === 'Approved' && !i.deleted_at) && jobBilling(db, j).amount > 0);
    expect(open).toBeTruthy(); expect(jobBilling(db, open!).invoiced).toBe(false);
    const t = clientJobsTable({ ...db, jobs: [open!], invoices: [] }); expect(Number(t.rows[0][8])).toBe(jobBilling(db, open!).amount); expect(Number(t.rows[0][9])).toBe(jobBilling(db, open!).amount);
  });
  it('the date filter keeps only clients with a job starting in the period', () => {
    const db = seedDB(); const all = clientJobsTable(db); const d = db.jobs.find((j) => !j.deleted_at && !['Cancelled', 'Rescheduled'].includes(j.status))!.start_at.slice(0, 10);
    const one = clientJobsTable(db, { from: d, to: d }); expect(one.rows.length).toBeGreaterThan(0); expect(one.rows.length).toBeLessThanOrEqual(all.rows.length);
    expect(clientJobsTable(db, { from: '2099-01-01' }).rows).toHaveLength(0); expect(clientJobsTable(db, { to: '1999-01-01' }).rows).toHaveLength(0);
    expect(one.title).toContain(d);
  });
  it('a client whose only job was cancelled is left out', () => {
    const db = seedDB(); const c = db.clients[0]; const only = { ...db, jobs: db.jobs.filter((j) => j.client_id !== c.id).concat(db.jobs.filter((j) => j.client_id === c.id).map((j) => ({ ...j, status: 'Cancelled' as never }))) };
    expect(clientJobsTable(only).rows.some((r) => r[0] === c.name)).toBe(false);
  });
});
