import { describe, expect, it } from 'vitest';
import { estimate } from '../../supabase/functions/_shared/estimate';
import { RATES } from '../../supabase/functions/_shared/rates';
import { findRate, planQuote } from './quickbooking';

describe('the chat estimate', () => {
  it('matches the rulebook example: Makati, about 40 panels = 4,799 + 9 x 140 = 6,059', () => {
    const e = estimate('12 Ayala Ave, Makati', 'window cleaning', 40); expect(e).toMatchObject({ ok: true, kind: 'glass', place: 'Makati', package_price: 4799, included: 31, extra_qty: 9, estimate: 6059 });
    expect(e.rates_en).toContain('starts at ₱4,799'); expect(e.estimate_en).toContain('₱6,059');
  });
  it('charges nothing extra inside the package, and never goes below the package price', () => {
    expect(estimate('Makati', '', 20)).toMatchObject({ extra_qty: 0, estimate: 4799 }); expect(estimate('Makati', '', 31).estimate).toBe(4799); expect(estimate('Makati', '', 32).estimate).toBe(4939);
  });
  it('knows the reference cities of the rulebook', () => {
    for (const [city, price, panels] of [['Caloocan', 4799, 31], ['Valenzuela', 4799, 31], ['Las Piñas', 5799, 41], ['Muntinlupa', 5799, 41], ['Bacoor', 5799, 41], ['Imus', 5799, 41], ['Dasmariñas', 5799, 41], ['General Trias', 6799, 41], ['Laguna', 12799, 51], ['Batangas', 12799, 51], ['Quezon City', 4799, 31], ['Parañaque', 5799, 41]] as [string, number, number][])
      expect(estimate(city, '', 1)).toMatchObject({ package_price: price, included: panels });
  });
  it('every estimate says the final amount is confirmed on site, in one short sentence', () => {
    for (const e of [estimate('Makati', '', 40), estimate('Imus', 'roof cleaning', 150), estimate('Makati', 'solar panels', 25)]) { expect(e.estimate_en).toMatch(/final amount is confirmed on site/); expect(e.estimate_tl).toBe(e.estimate_en); }
  });
  it('other services bill the minimum until measured', () => {
    expect(estimate('Imus', 'roof cleaning', 60)).toMatchObject({ kind: 'area', estimate: 14500 }); expect(estimate('Imus', 'roof', 150).estimate).toBe(21750); expect(estimate('Makati', 'solar panels', 17).estimate).toBe(4900); expect(estimate('Makati', 'solar', 17).estimate_en).toContain('minimum');
  });
  it('without a quantity it gives only the rates, and an unknown city is left to a person', () => {
    expect(estimate('Makati', '').estimate_en).toBe(''); expect(estimate('Makati', '').rates_en).toContain('₱140 each');
    const u = estimate('Hong Kong', '', 30); expect(u.ok).toBe(false); expect(u.estimate_en).toMatch(/team verify/); expect(u.estimate).toBeUndefined();
  });
  it('the app and the chat use the very same rate table', () => { expect(findRate('Makati')).toBe(RATES.find((r) => r.place === 'Makati')); expect(planQuote({ services: [] } as never, { address: 'Makati', service: '' }).rate?.price).toBe(estimate('Makati', '', 1).package_price); });
});

describe('English-first for every language', () => {
  it('Taglish and Tagalog customers get the same short English text, with the same figures', () => {
    const e = estimate('Makati', '', 40); expect(e.rates_tglish).toBe(e.rates_en); expect(e.estimate_tglish).toBe(e.estimate_en); expect(e.rates_en).toContain('starts at ₱4,799'); expect(e.estimate_en).toContain('₱6,059'); expect(e.estimate_en).not.toMatch(/nagsisimula|Estimate lang/);
    expect(estimate('Makati', '', 21).estimate_en).toMatch(/within the ₱4,799 package|₱4,799/); expect(estimate('Hong Kong', '', 5).estimate_tl).toMatch(/team verify/);
  });
});

describe('what the rate table does not cover', () => {
  it('services with no list price are never priced as a glass package', () => {
    for (const svc of ['gutter cleaning', 'ACP cladding', 'ceiling cleaning', 'indoor wall cleaning', 'facade cleaning', 'post-construction cleaning', 'swimming pool', 'rope access high-rise']) { const e = estimate('Makati', svc, 40); expect(e.ok).toBe(false); expect(e.kind).toBe('custom'); expect(e.estimate).toBeUndefined(); expect(e.estimate_en).toMatch(/assessment/); }
  });
  it('a commercial property is quoted by a person, not from the residential packages', () => {
    for (const p of ['Commercial', 'office building', 'warehouse']) { const e = estimate('Makati', 'window cleaning', 80, p); expect(e.ok).toBe(false); expect(e.kind).toBe('commercial'); expect(e.estimate).toBeUndefined(); expect(e.estimate_en).toMatch(/ocular fee is ₱2,500/); }
    expect(estimate('Makati', 'window cleaning', 40, 'Residential').estimate).toBe(6059);
  });
  it('glass words, floors and solar still get their rates; the wording is correct for one panel', () => {
    expect(estimate('Makati', 'salamin / bintana', 10).kind).toBe('glass'); expect(estimate('Makati', 'driveway pressure washing', 60).kind).toBe('area'); expect(estimate('Makati', 'Solar Panel Cleaning', 25).estimate).toBe(6125); expect(estimate('Makati', 'solar', 1).estimate_en).toMatch(/For 1 panel /);
  });
});
