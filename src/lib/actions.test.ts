import { beforeAll, describe, expect, it } from 'vitest';

// minimal browser storage stub so the store singleton can boot under node
const mem = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } });

type Mods = { store: typeof import('./store').store; A: typeof import('./actions'); B: typeof import('./business'); RuleError: typeof import('./store').RuleError; PermissionError: typeof import('./store').PermissionError };
let m: Mods;
beforeAll(async () => {
  const s = await import('./store'); const A = await import('./actions'); const B = await import('./business');
  m = { store: s.store, A, B, RuleError: s.RuleError, PermissionError: s.PermissionError };
});
const as = async (email: string) => { await m.store.login(email, 'topmop123'); };
const db = () => m.store.getDB();

describe('business rules enforced by the store', () => {
  it('rejects bad credentials', async () => {
    await expect(m.store.login('owner@topmop.ph', 'nope')).rejects.toThrow('Invalid');
  });

  it('blocks double-booking crew, vehicle and equipment', async () => {
    await as('owner@topmop.ph');
    const j = db().jobs.find((x) => x.status === 'Confirmed')!;
    const dup = { ...j, id: undefined, number: undefined } as never;
    expect(() => m.A.saveJob(dup)).toThrow(/Double-booking blocked/);
  });

  it('allows a job on a free day and then blocks a drag onto a busy slot', async () => {
    await as('owner@topmop.ph');
    const j = db().jobs.find((x) => x.status === 'Pending')!;
    const clash = db().jobs.find((x) => x.id !== j.id && x.leader_id === j.leader_id && x.status === 'Confirmed')!;
    expect(() => m.A.moveJob(j.id, clash.start_at)).toThrow(/Double-booking/);
  });

  it('never releases one asset to two jobs at once', async () => {
    await as('owner@topmop.ph');
    const active = db().checkouts.find((c) => c.status === 'Released')!;
    const other = db().jobs.find((j) => j.id !== active.job_id && ['Pending', 'Confirmed'].includes(j.status))!;
    const co = m.store.insert('checkouts', { asset_id: active.asset_id, job_id: other.id, requested_by: other.leader_id!, responsible_id: other.leader_id!, status: 'Requested', expected_return: `${other.end_at}`, out_photos: [], in_photos: [] } as never);
    expect(() => m.A.releaseCheckout(co.id, { condition: 'Good', photos: [] })).toThrow(/still checked out/);
  });

  it('opens a repair ticket and takes the asset out of service when damage is reported on return', async () => {
    await as('owner@topmop.ph');
    const active = db().checkouts.find((c) => c.status === 'Released' && db().assets.find((a) => a.id === c.asset_id)!.category !== 'Vehicle')!;
    const before = db().tickets.length;
    m.A.returnCheckout(active.id, { condition: 'Damaged', damage_notes: 'Cracked hose fitting', missing: '', photos: [] });
    expect(db().tickets.length).toBe(before + 1);
    expect(db().assets.find((a) => a.id === active.asset_id)!.status).toBe('Damaged');
    expect(() => m.store.remove('checkouts', active.id)).toThrow(/cannot be deleted/);
    expect(() => m.store.update('checkouts', active.id, { note: 'x' })).toThrow(/locked/);
  });

  it('prevents negative stock and makes stock transactions immutable', async () => {
    await as('owner@topmop.ph');
    const it = db().items[0];
    const job = db().jobs.find((j) => j.status === 'Confirmed')!;
    expect(() => m.A.issueToJob({ item_id: it.id, qty: 1e6, job_id: job.id, location_id: it.location_id })).toThrow(/on hand/);
    const tx = db().stock.find((t) => t.type === 'Purchase')!;
    expect(() => m.store.remove('stock', tx.id)).toThrow(/cannot be deleted/);
    expect(() => m.store.update('stock', tx.id, { qty: 999 })).toThrow(/immutable/);
    const before = m.B.onHand(db(), tx.item_id, tx.location_id);
    m.A.reverseStockTx(tx.id, 'entered twice');
    expect(m.B.onHand(db(), tx.item_id, tx.location_id)).toBeCloseTo(before - tx.qty, 2);
    expect(() => m.A.reverseStockTx(tx.id, 'again')).toThrow(/already been reversed/);
  });

  it('requires approval by a second person for stock adjustments', async () => {
    await as('ops@topmop.ph');
    const it = db().items[3];
    m.A.requestAdjustment({ item_id: it.id, qty: -1, location_id: it.location_id, reason: 'spillage' });
    const tx = db().stock.filter((t) => t.approval === 'Pending' && t.item_id === it.id && t.reason === 'spillage')[0];
    expect(() => m.A.decideAdjustment(tx.id, true)).toThrow(/Someone else/);
    await as('owner@topmop.ph');
    m.A.decideAdjustment(tx.id, true);
    expect(db().stock.find((t) => t.id === tx.id)!.approval).toBe('Approved');
  });

  it('locks approved invoices, blocks overpayment, and only allows reversal', async () => {
    await as('finance@topmop.ph');
    const inv = db().invoices.find((i) => i.status === 'Approved' && m.B.invoiceBalance(db(), i) > 100)!;
    expect(() => m.store.remove('invoices', inv.id)).toThrow(/cannot be deleted/);
    expect(() => m.store.update('invoices', inv.id, { discount: 5 })).toThrow(/locked/);
    const bal = m.B.invoiceBalance(db(), inv);
    expect(() => m.A.recordPayment({ invoice_id: inv.id, date: '2026-01-01', amount: bal + 1000, wht_amount: 0, method: 'Cash', reference: '' })).toThrow(/exceeds/);
    const p = m.A.recordPayment({ invoice_id: inv.id, date: '2026-01-01', amount: 100, wht_amount: 0, method: 'GCash', reference: 'T' });
    expect(m.B.invoiceBalance(db(), db().invoices.find((i) => i.id === inv.id)!)).toBeCloseTo(bal - 100, 2);
    expect(() => m.A.reverseInvoice(inv.id, 'oops')).toThrow(/Reverse the payments/);
    m.A.reversePayment(p.id, 'wrong invoice');
    expect(m.B.invoiceBalance(db(), db().invoices.find((i) => i.id === inv.id)!)).toBeCloseTo(bal, 2);
  });

  it('runs payroll through approval, posts the expense and locks the period', async () => {
    await as('finance@topmop.ph');
    const cur = db().periods.find((p) => p.status === 'Draft')!;
    // draft period has pending attendance → submit must be blocked until approved
    m.A.generateRun(cur.id);
    expect(() => m.A.submitPayroll(cur.id)).toThrow(/pending approval/);
    // finance cannot approve
    const waiting = db().periods.find((p) => p.status === 'For Approval')!;
    expect(() => m.A.approvePayroll(waiting.id)).toThrow(m.PermissionError);
    await as('owner@topmop.ph');
    const exp0 = db().expenses.filter((e) => e.category === 'Payroll').length;
    m.A.approvePayroll(waiting.id);
    expect(db().expenses.filter((e) => e.category === 'Payroll').length).toBe(exp0 + 1);
    expect(() => m.A.finalizePayroll(cur.id)).toThrow(/Approve the payroll/);
    m.A.finalizePayroll(waiting.id);
    const fin = db().periods.find((p) => p.id === waiting.id)!;
    expect(fin.locked).toBe(true);
    expect(() => m.store.remove('periods', fin.id)).toThrow(/locked|Only draft/);
    expect(() => m.store.update('periods', fin.id, { label: 'hack' })).toThrow(/locked/);
    const run = db().runs.find((r) => r.period_id === fin.id)!;
    expect(() => m.store.update('runs', run.id, { lines: [] })).toThrow(/locked/);
    expect(db().audit.some((a) => a.action === 'lock')).toBe(true);
  });

  it('enforces role permissions', async () => {
    await as('field@topmop.ph');
    const inv = db().invoices.find((i) => i.status === 'Draft') ?? db().invoices[0];
    expect(() => m.A.approveInvoice(inv.id)).toThrow(m.PermissionError);
    expect(() => m.A.saveExpense({ date: '2026-01-01', payee: 'x', category: 'Other', branch_id: 'b', amount: 5, vat: 0, wht: 0, method: 'Cash', approval: 'Pending', paid: true, petty_cash: false })).toThrow(m.PermissionError);
    await as('accountant@topmop.ph');
    expect(m.store.can('reports.finance')).toBe(true);
    expect(m.store.can('payroll.view')).toBe(false);
    expect(() => m.A.saveJob({} as never)).toThrow(m.PermissionError);
  });

  it('blocks clocking in twice and validates corrections', async () => {
    await as('field@topmop.ph');
    const emp = m.store.user!.employee_id!;
    const already = db().attendance.find((a) => a.employee_id === emp && a.clock_in && a.date === new Date().toISOString().slice(0, 10));
    if (already) expect(() => m.A.clockIn(emp, {})).toThrow(/Already clocked in/);
    expect(() => m.A.requestCorrection({ employee_id: emp, date: '2026-01-05', clock_in: '2026-01-05T09:00', clock_out: '2026-01-05T08:00', reason: 'x' })).toThrow(/after clock-in/);
  });

  it('writes an audit entry for every mutation with before/after', async () => {
    await as('owner@topmop.ph');
    const n = db().audit.length;
    const c = db().clients[0];
    m.store.update('clients', c.id, { notes: 'audit test' });
    const last = db().audit[0];
    expect(db().audit.length).toBe(n + 1);
    expect(last.table).toBe('clients'); expect(last.user_name).toBeTruthy();
    expect(db().clients.find((x) => x.id === c.id)!.updated_at >= c.updated_at).toBe(true);
    m.store.remove('clients', c.id);
    expect(db().clients.find((x) => x.id === c.id)!.deleted_at).toBeTruthy(); // soft delete
  });
});

describe('record creation', () => {
  it('assigns ids and numbers even when callers pass undefined ids', async () => {
    await as('owner@topmop.ph');
    const q = m.A.saveQuotation({ client_id: db().clients[0].id, issue_date: '2026-01-01', valid_until: '2026-01-31', scope: 's', items: [{ service_code: 'ROOF', description: 'r', qty: 100, unit: 'sqm', rate: 145, discount: 0 }], vat_mode: 'exclusive', vat_rate: 12, discount: 0, terms: '', status: 'Draft', branch_id: db().branches[0].id, id: undefined, number: undefined });
    expect(q.id).toBeTruthy(); expect(q.number).toMatch(/^QT-/); expect(q.created_by).toBe(m.store.user!.id); expect(q.created_at).toBeTruthy();
  });
});
