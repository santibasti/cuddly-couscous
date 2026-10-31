import { describe, expect, it } from 'vitest';
import { checkupsDue, customerStats, daysToBirthday, ownerOf, rangeOf, salesByMonth, smsText, teamFor, unitsFor, upcomingBirthdays } from './crm';
import { reducer } from './store';
import { buildSeed } from './seed';
import { addDays } from './dates';

const TODAY = '2026-10-25';

describe('birthdays', () => {
  it('counts days to the next birthday, wrapping into next year', () => {
    expect(daysToBirthday('1990-10-25', TODAY)).toBe(0);
    expect(daysToBirthday('1990-10-28', TODAY)).toBe(3);
    expect(daysToBirthday('1990-10-20', TODAY)).toBe(360);
    expect(daysToBirthday('1990-01-02', '2026-12-30')).toBe(3);
  });
  it('keeps a Feb 29 birthday on Feb 28 in other years', () => {
    expect(daysToBirthday('2000-02-29', '2027-02-27')).toBe(1);
  });
  it('lists the customers whose birthday is close', () => {
    const d = buildSeed(TODAY);
    const soon = upcomingBirthdays(d, TODAY, 14);
    expect(soon.map((x) => x.customer.id)).toEqual(['c2', 'c6']);
    expect(soon[0].daysAway).toBe(3);
  });
});

describe('date ranges', () => {
  it('ends today and compares with an equal stretch before it', () => {
    const r = rangeOf('7d', TODAY);
    expect(r.start).toBe('2026-10-19');
    expect(r.prevStart).toBe('2026-10-12');
    expect(r.prevEnd).toBe('2026-10-18');
  });
  it('compares the month so far with the same days of last month', () => {
    const r = rangeOf('month', TODAY);
    expect(r.start).toBe('2026-10-01');
    expect(r.prevStart).toBe('2026-09-01');
    expect(r.prevEnd).toBe('2026-09-25');
  });
  it('starts the quarter and year at the right dates', () => {
    expect(rangeOf('quarter', TODAY).start).toBe('2026-10-01');
    expect(rangeOf('quarter', TODAY).prevStart).toBe('2026-07-01');
    expect(rangeOf('year', TODAY).start).toBe('2026-01-01');
    expect(rangeOf('year', TODAY).prevStart).toBe('2025-01-01');
  });
});

describe('insights', () => {
  const d = buildSeed(TODAY);
  it('counts cars in, out, late and back jobs inside a range', () => {
    const r = rangeOf('year', TODAY);
    const u = unitsFor(d, r.start, r.end, TODAY);
    expect(u.received.length).toBeGreaterThan(10);
    expect(u.released.length).toBeGreaterThan(5);
    expect(u.backjobs.every((p) => p.backjobOf)).toBe(true);
    expect(u.delayed.length).toBeGreaterThan(0);
    expect(Object.values(u.byService).reduce((a, b) => a + b, 0)).toBe(u.received.length);
    expect(u.byBrand.reduce((s, b) => s + b.count, 0)).toBe(u.received.length);
  });
  it('has something to compare in the earlier period', () => {
    const r = rangeOf('year', TODAY);
    expect(unitsFor(d, r.prevStart, r.prevEnd, TODAY).received.length).toBeGreaterThan(0);
  });
  it('does not count quotes as received', () => {
    const u = unitsFor(d, '2000-01-01', TODAY, TODAY);
    expect(u.received.some((p) => p.status === 'quote')).toBe(false);
  });
  it('adds up cash by month and by service to the same total', () => {
    const r = rangeOf('year', TODAY);
    const u = unitsFor(d, r.start, r.end, TODAY);
    expect(Object.values(u.billedByService).reduce((a, b) => a + b, 0)).toBe(u.billed);
    expect(salesByMonth(d, TODAY, 12)).toHaveLength(12);
  });
  it('gives a back job to the mechanic who did the most hours on the first job', () => {
    const bj = d.projects.find((p) => p.backjobOf === 'h5')!;
    expect(ownerOf(d, bj.backjobOf!)).toBe('m3');
    const rows = teamFor(d, '2026-01-01', TODAY);
    expect(rows.reduce((s, t) => s + t.backjobs, 0)).toBeGreaterThan(0);
  });
});

describe('customers', () => {
  const d = buildSeed(TODAY);
  it('adds up lifetime value from payments and tells new from past clients', () => {
    const c = d.customers.find((x) => x.id === 'c5')!;
    const st = customerStats(d, c);
    expect(st.ltv).toBe(st.jobs.reduce((s, p) => s + p.payments.reduce((a, x) => a + x.amount, 0), 0));
    expect(st.kind).toBe('past');
  });
  it('writes a message in the customer’s first name', () => {
    const c = d.customers[1];
    expect(smsText('birthday', c)).toContain('Maria');
  });
});

describe('release and follow-up', () => {
  it('marks the car out, releases it and sets the check-up a week later', () => {
    let s = buildSeed(TODAY);
    const id = 'p7';
    s = reducer(s, { type: 'markOut', projectId: id, date: TODAY });
    const p = s.projects.find((x) => x.id === id)!;
    expect(p.status).toBe('delivered');
    expect(p.releasedOn).toBe(TODAY);
    expect(checkupsDue(s, addDays(TODAY, 7), 0).some((x) => x.project.id === id)).toBe(true);
    expect(checkupsDue(s, TODAY, 0).some((x) => x.project.id === id)).toBe(false);
  });
  it('lets a stage be approved, and takes the approval back when it is reopened', () => {
    let s = buildSeed(TODAY);
    const ph = s.projects.find((p) => p.id === 'p2')!.phases.find((x) => x.status === 'done' && !x.approvedBy)!;
    s = reducer(s, { type: 'approvePhase', projectId: 'p2', key: ph.key, by: 'Alex' });
    expect(s.projects.find((p) => p.id === 'p2')!.phases.find((x) => x.key === ph.key)!.approvedBy).toBe('Alex');
    s = reducer(s, { type: 'setPhaseStatus', projectId: 'p2', key: ph.key, status: 'in_progress' });
    expect(s.projects.find((p) => p.id === 'p2')!.phases.find((x) => x.key === ph.key)!.approvedBy).toBeUndefined();
  });
  it('keeps a text in the outbox and a checklist that lists what is missing', () => {
    let s = buildSeed(TODAY);
    s = reducer(s, { type: 'sendSms', customerId: 'c2', kind: 'custom', text: 'hello' });
    expect(s.messages[0].text).toBe('hello');
    s = reducer(s, { type: 'updateIntake', projectId: 'p5', patch: { orcr: false } });
    expect(s.projects.find((p) => p.id === 'p5')!.intake!.items.length).toBeGreaterThan(3);
  });
});
