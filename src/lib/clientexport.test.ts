import { describe, expect, it } from 'vitest';
import { clientJobsTable } from './clientexport';
import { seedDB } from './seed';
describe('client list for the ad platform', () => {
  it('lists each client with a booked job once, with address, contact and the approved invoices total; cancelled bookings do not count', () => {
    const db = seedDB(); const t = clientJobsTable(db);
    expect(t.headers).toEqual(['Name', 'Contact person', 'Address', 'Mobile', 'Email', 'Jobs', 'Last job', 'Invoices', 'Final billing (PHP)']);
    expect(new Set(t.rows.map((r) => r[0])).size).toBe(t.rows.length); expect(t.rows.length).toBeGreaterThan(0);
    const withJobs = new Set((db.jobs ?? []).filter((j) => !j.deleted_at && !['Cancelled', 'Rescheduled'].includes(j.status)).map((j) => j.client_id)); expect(t.rows.length).toBe((db.clients ?? []).filter((c) => !c.deleted_at && withJobs.has(c.id)).length);
    expect(t.totals![8]).toBe(Math.round(t.rows.reduce((s, r) => s + Number(r[8]), 0) * 100) / 100); expect(Number(t.rows[0][8])).toBeGreaterThanOrEqual(Number(t.rows[t.rows.length - 1][8]));
  });
  it('a client whose only job was cancelled is left out', () => {
    const db = seedDB(); const c = db.clients[0]; const only = { ...db, jobs: db.jobs.filter((j) => j.client_id !== c.id) .concat(db.jobs.filter((j) => j.client_id === c.id).map((j) => ({ ...j, status: 'Cancelled' as never }))) };
    expect(clientJobsTable(only).rows.some((r) => r[0] === c.name)).toBe(false);
  });
});
