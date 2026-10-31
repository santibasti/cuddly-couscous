import { describe, expect, it } from 'vitest';
import { adviseJob, serviceNorms } from './advice';
import { addDays } from './dates';
import { buildSeed } from './seed';
import { reducer } from './store';

const TODAY = '2026-10-26'; // a Monday
const d = buildSeed(TODAY);
const base = { customerId: 'c8', service: 'detailing' as const, budget: 9500, start: addDays(TODAY, 14), target: addDays(TODAY, 14) };

describe('serviceNorms', () => {
  it('learns the usual hours and price from finished jobs', () => {
    const n = serviceNorms(d, 'paint');
    expect(n.jobs).toBeGreaterThanOrEqual(3);
    expect(n.hours).toBeGreaterThan(10);
    expect(n.avgPrice).toBeGreaterThan(40000);
  });
});

describe('adviseJob', () => {
  it('says go ahead for a past client with room in the shop and a fair deadline', () => {
    const a = adviseJob(d, base);
    expect(a.verdict).toBe('go');
    expect(a.reasons.some((r) => r.text.startsWith('Past client'))).toBe(true);
  });
  it('asks a new client for at least half up front', () => {
    const s = reducer(d, { type: 'addCustomer', customer: { id: 'cn', name: 'New Person', phone: '1', email: '' } });
    const a = adviseJob(s, { ...base, customerId: 'cn' });
    expect(a.verdict).toBe('conditions');
    expect(a.deposit).toBeGreaterThanOrEqual(0.5);
  });
  it('says not yet when there is no price or the deadline is far too short', () => {
    expect(adviseJob(d, { ...base, budget: 0 }).verdict).toBe('wait');
    const rush = adviseJob(d, { ...base, service: 'paint', budget: 60000, start: addDays(TODAY, 14), target: addDays(TODAY, 15) });
    expect(rush.verdict).toBe('wait');
  });
  it('flags a price well under the usual for estimate-priced work', () => {
    const a = adviseJob(d, { ...base, service: 'paint', budget: 15000, start: addDays(TODAY, 14), target: addDays(TODAY, 24) });
    expect(a.reasons.some((r) => r.tone === 'bad' && r.text.includes('under your usual'))).toBe(true);
  });
  it('suggests a later start when the team is already booked', () => {
    const a = adviseJob(d, { ...base, service: 'paint', budget: 70000, start: TODAY, target: addDays(TODAY, 10) });
    if (a.reasons.some((r) => r.text.startsWith('The team is busy'))) expect(a.suggestedStart).toBeTruthy();
    else expect(a.suggestedStart).toBeUndefined();
  });
  it('asks for more when the client still owes money on a job in the shop', () => {
    const owing = d.projects.find((p) => p.status === 'active' && p.budget > p.payments.reduce((s, x) => s + x.amount, 0))!;
    const a = adviseJob(d, { ...base, customerId: owing.customerId });
    expect(a.reasons.some((r) => r.text.includes('still owe'))).toBe(true);
    expect(a.deposit).toBeGreaterThanOrEqual(0.5);
  });
});
