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
  it('every estimate says it is only an estimate and the crew counts on site', () => {
    for (const e of [estimate('Makati', '', 40), estimate('Imus', 'roof cleaning', 150), estimate('Makati', 'solar panels', 25)]) { expect(e.estimate_en).toMatch(/only an estimate/); expect(e.estimate_en).toMatch(/crew does the final count on site/); expect(e.estimate_tl).toMatch(/final count/); }
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

describe('Taglish', () => {
  it('speaks Taglish for a Taglish customer, with the same figures and the same warning', () => {
    const e = estimate('Makati', '', 40); expect(e.rates_tglish).toContain('nagsisimula sa ₱4,799'); expect(e.estimate_tglish).toContain('₱6,059'); expect(e.estimate_tglish).toMatch(/Estimate lang po/); expect(e.estimate_tglish).toMatch(/crew namin ang magbibilang ng final count/);
    expect(estimate('Makati', '', 21).estimate_tglish).toMatch(/sakop pa po siya ng package, so ang estimate ay ₱4,799/);
    expect(estimate('Hong Kong', '', 5).estimate_tglish).toMatch(/Paki-verify/);
  });
});
