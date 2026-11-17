import { describe, expect, it } from 'vitest';
import { seedDB } from './seed';
import { estimate } from '../../supabase/functions/_shared/estimate';
// The Master Service Pricing List of 13 November 2026: the price records, the chat and Quick booking must all say the same.
describe('master pricing list, 13 Nov 2026', () => {
  const sv = (code: string) => seedDB().services.find((s) => s.code === code)!;
  it('the service records match the list', () => {
    expect(sv('GLASS_EXT')).toMatchObject({ package_price: 4799, package_qty: 31, excess_rate: 140 });
    expect((sv('GLASS_EXT').packages ?? []).map((p) => [p.price, p.qty, p.excess_rate])).toEqual([[5799, 41, 140], [6799, 41, 140], [12799, 51, 140]]);
    expect(sv('ROOF')).toMatchObject({ rate: 145, minimum_qty: 100 }); expect(sv('WALL')).toMatchObject({ rate: 125, minimum_qty: 50, name: 'Exterior Wall Cleaning' });
    expect(sv('FLOOR')).toMatchObject({ rate: 125, minimum_qty: 50, name: 'Floor / Driveway Cleaning' }); expect(sv('SOLAR')).toMatchObject({ rate: 245, minimum_qty: 20 });
    for (const c of ['GUTTER', 'ACP', 'CEILING']) expect(sv(c).custom_quote).toBe(true);
  });
  it('the chat estimates from the same numbers', () => {
    expect(estimate('Pasay', 'window cleaning', 50).estimate).toBe(7459); expect(estimate('Silang', 'window cleaning', 60).estimate).toBe(12799 + 9 * 140); expect(estimate('General Trias City', 'window cleaning', 41).estimate).toBe(6799);
    expect(estimate('Makati', 'roof cleaning', 120).estimate).toBe(17400); expect(estimate('Makati', 'solar panel cleaning', 10).estimate).toBe(4900); expect(estimate('Makati', 'wall cleaning', 80).estimate).toBe(10000);
  });
});
