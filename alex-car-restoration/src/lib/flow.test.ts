import { describe, expect, it } from 'vitest';
import { defaultQc, PAYMENT_KINDS, PAYMENT_LABEL, QC_ITEMS, releaseGates, smsText } from './crm';
import { defaultEstimate, estimateTotals } from './estimate';
import { buildSeed } from './seed';
import { reducer } from './store';

const TODAY = '2026-10-26';
const d = buildSeed(TODAY);

describe('estimate', () => {
  const est = { labor: [{ label: 'Labour', qty: 10, unit: 500 }], parts: [{ label: 'Fender', qty: 2, unit: 1000 }], materials: [{ label: 'Paint', qty: 1, unit: 3000 }], outside: [], markupPct: 20, discount: 1000, vat: true, createdOn: TODAY };
  it('adds cost, markup, discount and VAT in that order', () => {
    const t = estimateTotals(est);
    expect(t.cost).toBe(10000);
    expect(t.markup).toBe(2000);
    expect(t.net).toBe(11000);
    expect(t.vat).toBeCloseTo(1320);
    expect(t.total).toBeCloseTo(12320);
    expect(t.marginPct).toBe(9);
  });
  it('never goes below zero and ignores empty or bad numbers', () => {
    expect(estimateTotals({ ...est, discount: 1e9 }).total).toBe(0);
    expect(estimateTotals({ ...est, labor: [{ label: '', qty: NaN, unit: 5 }], parts: [], materials: [] }).cost).toBe(0);
  });
  it('starts a service from the shop\'s usual labour charge', () => {
    const e = defaultEstimate('paint', d, TODAY);
    expect(e.labor[0].unit).toBeGreaterThan(0);
  });
});

describe('quality check and release', () => {
  it('has a list for every service', () => {
    for (const k of Object.keys(QC_ITEMS) as (keyof typeof QC_ITEMS)[]) expect(defaultQc(k).length).toBeGreaterThan(4);
  });
  it('holds the car until the check is signed, it is paid and the OR/CR is in', () => {
    const p = d.projects.find((x) => x.id === 'p7')!; // OR/CR missing, not paid
    const g = releaseGates(p);
    expect(g.ok).toBe(false);
    expect(g.gates.map((x) => x.ok)).toEqual([false, false, false]);
  });
  it('opens once all three are true', () => {
    let s = d;
    const id = 'p7';
    s = reducer(s, { type: 'updateIntake', projectId: id, patch: { orcr: true } });
    s = reducer(s, { type: 'addPayment', projectId: id, date: TODAY, amount: 1e9 });
    s = reducer(s, { type: 'updateQc', projectId: id, patch: { signedBy: 'Alex', signedOn: TODAY } });
    expect(releaseGates(s.projects.find((x) => x.id === id)!).ok).toBe(true);
  });
  it('records the quality check with its photo and sign-off', () => {
    const s = reducer(d, { type: 'updateQc', projectId: 'p8', patch: { after: 'data:image/jpeg;base64,xx' } });
    expect(s.projects.find((x) => x.id === 'p8')!.qc!.items.length).toBe(QC_ITEMS.detailing.length);
    expect(s.projects.find((x) => x.id === 'p8')!.qc!.after).toBeTruthy();
  });
});

describe('payments', () => {
  it('records how the money came in', () => {
    let s = d;
    for (const kind of ['cash', 'deposit', 'full', 'cheque'] as const) s = reducer(s, { type: 'addPayment', projectId: 'p7', date: TODAY, amount: 100, kind });
    expect(s.projects.find((x) => x.id === 'p7')!.payments.slice(-4).map((x) => x.kind)).toEqual(['cash', 'deposit', 'full', 'cheque']);
  });
  it('labels the four kinds', () => {
    expect(PAYMENT_KINDS.map((k) => PAYMENT_LABEL[k])).toEqual(['Cash', 'Deposit', 'Full pay', 'Cheque']);
  });
});

describe('intake and texts', () => {
  it('creates a job with its own id, checklist, photo, estimate and deposit', () => {
    let s = reducer(d, { type: 'addCustomer', customer: { id: 'cx', name: 'Dana Lee', phone: '1', email: '' } });
    s = reducer(s, { type: 'addProject', project: { id: 'px', service: 'paint', customerId: 'cx', title: 'Respray', year: 2020, make: 'Honda', model: 'City', color: 'Red', vin: '', scope: '', priority: 'normal', bay: 'Unassigned', startDate: TODAY, targetDate: '2026-11-05', budget: 50000, intake: { orcr: true, items: [] }, status: 'active', payments: [{ id: 'x', date: TODAY, amount: 15000, kind: 'cheque' }] } });
    const p = s.projects.find((x) => x.id === 'px')!;
    expect(p.status).toBe('active');
    expect(p.payments[0].amount).toBe(15000);
    expect(p.payments[0].kind).toBe('cheque');
    expect(p.intake!.orcr).toBe(true);
    expect(p.code).toMatch(/^ACR-/);
  });
  it('writes a stage update and an estimate text', () => {
    const c = d.customers[0];
    expect(smsText('stage', c, d.projects[0], 'Bodywork is done, Paint is next')).toContain('Bodywork is done');
    expect(smsText('estimate', c, d.projects[0], '₱50,000')).toContain('₱50,000');
  });
  it('records feedback at the check-up', () => {
    const s = reducer(d, { type: 'updateGatepass', projectId: 'p11', patch: { checkupDone: TODAY, feedback: { score: 2, note: 'Streaks' } } });
    expect(s.projects.find((x) => x.id === 'p11')!.gatepass!.feedback!.score).toBe(2);
  });
});
