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

  it('an approved quotation can be invoiced straight away, once, without a booking', async () => {
    await as('owner@topmop.ph');
    const q = db().quotations.find((x) => x.status === 'Approved' && !x.deleted_at && !db().jobs.some((j) => j.quotation_id === x.id && !j.deleted_at) && !x.items.some((i) => i.measure))!;
    expect(q).toBeTruthy();
    const draft = m.store.getDB().quotations.find((x) => x.status === 'Draft')!;
    expect(() => m.A.invoiceFromQuotation(draft.id)).toThrow(/approved/);
    const inv = m.A.invoiceFromQuotation(q.id);
    expect(inv).toMatchObject({ quotation_id: q.id, status: 'Draft', client_id: q.client_id });
    expect(inv.job_id).toBeUndefined();
    expect(m.B.invoiceTotals(inv).total).toBe(m.B.docTotals(q.items, q.discount, q.vat_mode, q.vat_rate).total);
    expect(() => m.A.invoiceFromQuotation(q.id)).toThrow(/already invoiced/);
  });

  it('the Owner can re-open a cancelled booking, with the reason on the audit trail', async () => {
    await as('owner@topmop.ph');
    const base = db().jobs.find((x) => x.status === 'Confirmed')!;
    const j = m.A.saveJob({ ...base, id: undefined, number: undefined, status: 'Pending', leader_id: undefined, crew_ids: [], vehicle_id: undefined, equipment_ids: [], start_at: '2031-03-03T08:00', end_at: '2031-03-03T17:00' } as never);
    m.A.setJobStatus(j.id, 'Cancelled', 'client postponed');
    const c = db().jobs.find((x) => x.id === j.id)!;
    expect(c.status).toBe('Cancelled');
    m.A.saveJob({ ...c, status: 'Confirmed' } as never);
    expect(db().jobs.find((x) => x.id === j.id)!.status).toBe('Confirmed');
    expect(db().audit.find((a) => a.record_id === j.id && /Re-opened cancelled/.test(a.summary))?.reason).toMatch(/re-opened/);
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

  /** The demo data only has equipment out on days with a job in progress; make sure there is one whatever day the tests run. */
  const ensureActive = () => {
    const have = db().checkouts.find((c) => c.status === 'Released' && db().jobs.find((j) => j.id === c.job_id)?.status === 'In Progress' && !c.deleted_at);
    if (have) return have;
    const job = db().jobs.find((j) => ['Pending', 'Confirmed'].includes(j.status) && j.leader_id && !j.deleted_at)!;
    const asset = db().assets.find((a) => a.status === 'Available' && !a.deleted_at && !db().checkouts.some((c) => c.asset_id === a.id && ['Requested', 'Released'].includes(c.status)))!;
    m.store.update('jobs', job.id, { status: 'In Progress' } as never);
    const co = m.store.insert('checkouts', { asset_id: asset.id, job_id: job.id, requested_by: job.leader_id!, responsible_id: job.leader_id!, status: 'Requested', expected_return: `${job.end_at}`, out_condition: 'Good' } as never);
    m.A.releaseCheckout(co.id, { condition: 'Good' });
    return db().checkouts.find((c) => c.id === co.id)!;
  };

  it('never releases one asset to two jobs at once', async () => {
    await as('owner@topmop.ph');
    const active = ensureActive();
    const other = db().jobs.find((j) => j.id !== active.job_id && ['Pending', 'Confirmed'].includes(j.status))!;
    const co = m.store.insert('checkouts', { asset_id: active.asset_id, job_id: other.id, requested_by: other.leader_id!, responsible_id: other.leader_id!, status: 'Requested', expected_return: `${other.end_at}`, out_in_photos: [] } as never);
    expect(() => m.A.releaseCheckout(co.id, { condition: 'Good' })).toThrow(/still checked out/);
  });

  it('an asset that is checked out cannot be marked Available by hand; returning it does', async () => {
    await as('owner@topmop.ph');
    const active = ensureActive();
    expect(() => m.store.update('assets', active.asset_id, { status: 'Available' } as never)).toThrow(/checked out to JOB-.*Return it/);
    m.A.returnCheckout(active.id, { condition: 'Good', damage_notes: '', missing: '' });
    expect(db().assets.find((a) => a.id === active.asset_id)!.status).toBe('Available');
  });

  it('opens a repair ticket and takes the asset out of service when damage is reported on return', async () => {
    await as('owner@topmop.ph');
    const active = db().checkouts.find((c) => c.status === 'Released' && db().assets.find((a) => a.id === c.asset_id)!.category !== 'Vehicle')!;
    const before = db().tickets.length;
    m.A.returnCheckout(active.id, { condition: 'Damaged', damage_notes: 'Cracked hose fitting', missing: '' });
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
    expect(() => m.A.recordPayment({ invoice_id: inv.id, amount: bal + 1000, method: 'Cash', received_by: 'Finance', verify_now: true })).toThrow(/exceeds/);
    const p = m.A.recordPayment({ invoice_id: inv.id, amount: 100, method: 'GCash', gcash_ref: 'T', sender: '0917', received_by: 'Finance', verify_now: true });
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

  it('the Owner can undo a mistaken clock-in (even if approved) so the person can clock in again', async () => {
    await as('owner@topmop.ph');
    const emp = db().employees.find((e) => e.status !== 'inactive' && !e.deleted_at)!.id;
    const { today } = await import('./util');
    for (const a of db().attendance.filter((x) => x.employee_id === emp && !x.deleted_at && x.date === today())) m.store.remove('attendance', a.id, { cascade: true });
    m.A.clockIn(emp, {});
    const rec = () => db().attendance.find((a) => a.employee_id === emp && !a.deleted_at && a.clock_in && !a.clock_out)!;
    m.store.update('attendance', rec().id, { approval: 'Approved' } as never);
    expect(() => m.store.remove('attendance', rec().id)).toThrow(/cannot be deleted/);
    m.A.undoClockIn(rec().id);
    expect(db().attendance.some((a) => a.employee_id === emp && !a.deleted_at && a.clock_in && !a.clock_out)).toBe(false);
    m.A.clockIn(emp, {});
    expect(rec()).toBeTruthy();
    await as('leader@topmop.ph');
    expect(() => m.A.undoClockIn(rec().id)).toThrow(/Only the Owner/);
  });

  it('a clean clock-out is approved automatically only when Admin turned that on', async () => {
    await as('owner@topmop.ph');
    const { today, nowLocal } = await import('./util');
    const now = nowLocal(); const hh = +now.slice(11, 13); const mm = +now.slice(14, 16);
    if (hh * 60 + mm < 40) return;   // too close to midnight to build a "clean" shift in this test
    const end = hh * 60 + mm - 5; const hm = `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
    const emp = db().employees.find((e) => e.status !== 'inactive' && !e.deleted_at && e.department === 'Field Operations')!;
    m.store.update('employees', emp.id, { shift_start: '00:00', shift_end: hm } as never);
    for (const on of [false, true]) {
      for (const a of db().attendance.filter((x) => x.employee_id === emp.id && x.date === today() && !x.deleted_at)) m.store.remove('attendance', a.id, { cascade: true });
      m.store.patchSettings({ auto_approve_attendance: on });
      m.store.insert('attendance', { employee_id: emp.id, date: today(), kind: 'Present', clock_in: `${today()}T00:00`, field_work: false, late_min: 0, undertime_min: 0, ot_min: 0, worked_hours: 0, approval: 'Pending' } as never);
      m.A.clockOut(emp.id, {});
      expect(db().attendance.find((x) => x.employee_id === emp.id && x.date === today() && !x.deleted_at)!.approval).toBe(on ? 'Approved' : 'Pending');
    }
    m.store.patchSettings({ auto_approve_attendance: false });
  });

  it('auto-approval rules: late threshold, overtime, undertime and the site check-in', async () => {
    const { autoApproveOk } = await import('./business');
    const on = { auto_approve_attendance: true };
    expect(autoApproveOk({ late_min: 0, ot_min: 0 }, on)).toBe(true);
    expect(autoApproveOk({ late_min: 15, ot_min: 0 }, on)).toBe(true);              // default threshold is 15 minutes
    expect(autoApproveOk({ late_min: 16, ot_min: 0 }, on)).toBe(false);
    expect(autoApproveOk({ late_min: 30, ot_min: 0 }, { ...on, auto_approve_late_min: 45 })).toBe(true);
    expect(autoApproveOk({ late_min: 0, ot_min: 30 }, on)).toBe(false);             // overtime always waits for the Owner
    expect(autoApproveOk({ late_min: 0, ot_min: 0 }, { auto_approve_attendance: false })).toBe(false);
  });

  it('a crew member who clocks in after the site check-in is approved at once and linked to the job', async () => {
    await as('owner@topmop.ph');
    const { today, nowLocal } = await import('./util');
    const job = db().jobs[0]; const emp = db().employees.find((e) => e.status !== 'inactive' && !e.deleted_at && e.department === 'Field Operations')!;
    for (const a of db().attendance.filter((x) => x.employee_id === emp.id && x.date === today() && !x.deleted_at)) m.store.remove('attendance', a.id, { cascade: true });
    m.store.insert('workflows', { id: 'wsite', job_id: job.id, panels: [], arr_at: nowLocal(), arr_crew_present: [emp.id], arr_crew_absent: [] } as never);
    m.A.clockIn(emp.id, {});
    expect(db().attendance.find((x) => x.employee_id === emp.id && x.date === today() && !x.deleted_at)).toMatchObject({ approval: 'Approved', approved_by: 'auto', field_work: true });
    expect(db().attendance.find((x) => x.employee_id === emp.id && x.date === today() && !x.deleted_at)!.job_id).toBeTruthy();
  });

  it('only an assigned employee marked as Driver can be the job driver', async () => {
    await as('owner@topmop.ph');
    const field = db().employees.filter((e) => e.status !== 'inactive' && !e.deleted_at && e.department === 'Field Operations');
    const [x, y] = field; const job = db().jobs.find((j) => !['Cancelled', 'Rescheduled', 'Completed'].includes(j.status) && !j.deleted_at)!;
    const base = { ...job, leader_id: undefined, crew_ids: [x.id], equipment_ids: [], start_at: '2031-05-04T08:00', end_at: '2031-05-04T17:00', status: 'Confirmed' as const };
    m.store.update('employees', x.id, { is_driver: false } as never); m.store.update('employees', y.id, { is_driver: true, driver_incentive: 200 } as never);
    expect(() => m.A.saveJob({ ...base, driver_id: x.id } as never)).toThrow(/marked as Driver/);        // not a driver
    expect(() => m.A.saveJob({ ...base, driver_id: y.id } as never)).toThrow(/not assigned/);            // a driver, but not on this job
    m.store.update('employees', x.id, { is_driver: true, driver_incentive: 150 } as never);
    expect(m.A.saveJob({ ...base, driver_id: x.id } as never).driver_id).toBe(x.id);
  });

  it('lead flow buttons: draft a quotation from the price list, send, client says yes, book with a free team, and refuse a double booking', async () => {
    await as('owner@topmop.ph');
    const F = await import('./flowactions'); const { flowCards, suggestDays, proposeTeam } = await import('./leadflow');
    const client = db().clients.find((c) => !c.deleted_at)!; m.store.update('clients', client.id, { address: 'Poblacion, Makati City' } as never);
    const inq = m.store.insert('inquiries', { client_id: client.id, service_codes: ['GLASS_EXT'], stage: 'Inquiry', source: 'Facebook', details: 'flow test' } as never) as { id: string };
    expect(flowCards(db()).find((c) => c.inquiryId === inq.id)!.step).toBe('new');
    const q = F.draftQuoteForInquiry(inq.id);
    expect(q).toMatchObject({ status: 'Draft', inquiry_id: inq.id }); expect(q.items.length).toBeGreaterThan(0);
    expect(db().inquiries.find((i) => i.id === inq.id)!.stage).toBe('Quotation'); expect(flowCards(db()).find((c) => c.inquiryId === inq.id)!.step).toBe('quote');
    expect(() => F.bookFromQuote(q.id, '2031-05-04', '08:00')).toThrow(/approved by the client/);                                   // cannot skip the client's yes
    F.sendQuote(q.id); expect(flowCards(db()).find((c) => c.inquiryId === inq.id)!.step).toBe('sent');
    F.recordClientDecision(q.id, true); expect(flowCards(db()).find((c) => c.inquiryId === inq.id)!.step).toBe('confirm');
    const need = 2; const slot = suggestDays(db(), { from: '2031-05-04', days: 5, need }).find((x) => x.ok)!; const team = proposeTeam(slot, need);
    const job = F.bookFromQuote(q.id, slot.date, '08:00', { leader: team.leader?.id, crew: team.crew.map((e) => e.id), vehicle: team.vehicle?.id });
    expect(job).toMatchObject({ quotation_id: q.id, status: 'Confirmed', leader_id: team.leader?.id }); expect(['order', 'book']).toContain(flowCards(db()).find((c) => c.jobId === job.id)!.step);
    expect(() => F.bookFromQuote(q.id, slot.date, '08:00')).toThrow(/already booked/);
    const second = F.draftQuoteForInquiry((m.store.insert('inquiries', { client_id: client.id, service_codes: ['GLASS_EXT'], stage: 'Inquiry', source: 'Facebook', details: 'second' } as never) as { id: string }).id);
    F.sendQuote(second.id); F.recordClientDecision(second.id, true);
    expect(() => F.bookFromQuote(second.id, slot.date, '08:00', { leader: team.leader?.id, crew: [], vehicle: team.vehicle?.id })).toThrow(/Double-booking blocked/);   // the same leader and van are already on that day
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
