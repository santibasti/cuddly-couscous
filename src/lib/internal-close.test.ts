import { beforeAll, describe, expect, it } from 'vitest';

const mem = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } });
let store: typeof import('./store').store; let A: typeof import('./actions'); let B: typeof import('./business');
beforeAll(async () => { store = (await import('./store')).store; A = await import('./actions'); B = await import('./business'); });
const db = () => store.getDB();
const exp = { category: 'Toll & Parking' as const, payee: 'NLEX toll', amount: 340, date: '2026-10-01', method: 'Cash' as const };

describe('Stage 8 — job expenses & internal close', () => {
  it('Admin enters the expenses after the service, then closes the job internally; the cost includes them; closed jobs are locked', async () => {
    await store.login('owner@topmop.ph', 'topmop123');
    const noExp = (j: { id: string }) => !db().expenses.some((e) => e.job_id === j.id && !e.deleted_at);
    const job = db().jobs.find((j) => j.status === 'Closed' && !j.deleted_at && !j.internal_closed_at && noExp(j))!;
    expect(job).toBeTruthy();
    const before = B.jobCost(db(), job).total;
    expect(() => A.closeJobInternally(job.id, {})).toThrow(/Enter the job expenses/);
    A.addJobExpense(job.id, exp);
    A.addJobExpense(job.id, { category: 'Meals & Snacks', payee: 'Crew snacks', amount: 250, date: '2026-10-01', method: 'GCash' });
    A.addJobExpense(job.id, { category: 'Fuel', payee: 'Shell', amount: 1200, date: '2026-10-01', method: 'Cash', petty_cash: true });
    expect(() => A.addJobExpense(job.id, { ...exp, payee: ' ' })).toThrow(/for/);
    expect(A.jobExpenses(db(), job.id).filter((e) => e.job_id === job.id).length).toBeGreaterThanOrEqual(3);
    expect(B.jobCost(db(), job).total).toBeGreaterThan(before);
    expect(() => A.closeJobInternally(job.id, { noExpenses: true })).toThrow(/untick/);
    A.closeJobInternally(job.id, { notes: 'receipts filed' });
    const c = db().jobs.find((j) => j.id === job.id)!;
    expect(c.internal_closed_at).toBeTruthy(); expect(c.internal_expense_total).toBeGreaterThanOrEqual(1790);
    expect(() => A.addJobExpense(job.id, exp)).toThrow(/closed internally/);
    expect(() => A.closeJobInternally(job.id, {})).toThrow(/Already/);
    A.reopenJobInternally(job.id, 'missed a receipt');
    expect(db().jobs.find((j) => j.id === job.id)!.internal_closed_at).toBeUndefined();
    A.addJobExpense(job.id, { ...exp, payee: 'Parking' });
  });
  it('a job with no expenses can be closed once "no expenses" is confirmed; only the Owner reopens; others cannot enter before service completion', async () => {
    const job = db().jobs.filter((j) => j.status === 'Closed' && !j.deleted_at && !j.internal_closed_at && !db().expenses.some((e) => e.job_id === j.id && !e.deleted_at))[0];
    if (job) { A.closeJobInternally(job.id, { noExpenses: true }); expect(db().jobs.find((j) => j.id === job.id)!.internal_no_expenses).toBe(true); }
    const open = db().jobs.find((j) => ['Confirmed', 'Pending'].includes(j.status))!;
    expect(() => A.addJobExpense(open.id, exp)).toThrow(/after the service/);
    await store.login('ops@topmop.ph', 'topmop123');
    expect(() => A.closeJobInternally(open.id, {})).toThrow(/not permitted/i);
    const closed = db().jobs.find((j) => j.internal_closed_at)!;
    if (closed) expect(() => A.reopenJobInternally(closed.id, 'x')).toThrow(/Owner/);
  });
});
