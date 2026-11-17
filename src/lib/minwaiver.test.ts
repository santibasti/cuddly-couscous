import { describe, expect, it } from 'vitest';
import { baseBooked, resolveReviewItems } from './business';
import { estimate } from '../../supabase/functions/_shared/estimate';
import { seedDB } from './seed';
import type { QuoteItem } from './types';

const db = seedDB();
const line = (category: QuoteItem['category'], qty: number, extra: Partial<QuoteItem> = {}): QuoteItem => ({ service_code: category === 'solar' ? 'SOLAR' : category === 'roof' ? 'ROOF' : 'WALL', category, description: 'x', qty, entered_qty: qty, unit: category === 'solar' ? 'panel' : 'sqm', rate: 245, discount: 0, ...extra } as QuoteItem);

describe('the minimum charge is waived for services added to a booked main service', () => {
  it('any booked main service counts, not only glass: e.g. roof booked, floor added', () => {
    expect(resolveReviewItems(db, [], [line('wall', 20)], undefined, true)[0].qty).toBe(20); expect(resolveReviewItems(db, [], [line('wall', 20)], undefined, false)[0].qty).toBe(50);
    expect(baseBooked({ quotations: [{ id: 'q', items: [{ service_code: 'ROOF' }] }] as never }, { quotation_id: 'q' })).toBe(true); expect(baseBooked({ quotations: [] }, { quotation_id: 'q' })).toBe(false); expect(baseBooked({ quotations: [{ id: 'q', items: [] }] as never }, { quotation_id: 'q' })).toBe(false);
  });
  it('bills the counted quantity when a glass package is booked', () => {
    expect(resolveReviewItems(db, [], [line('solar', 10), line('roof', 40), line('wall', 20)], 31).map((i) => i.qty)).toEqual([10, 40, 20]);
  });
  it('applies the minimum when there is no glass package', () => {
    expect(resolveReviewItems(db, [], [line('solar', 10), line('roof', 40), line('wall', 20)], undefined).map((i) => i.qty)).toEqual([20, 100, 50]);
  });
  it('a minimum negotiated for a line still applies, and a count above the minimum is unchanged', () => {
    expect(resolveReviewItems(db, [], [line('solar', 10, { negotiated: true, custom_min: 15 })], 31)[0].qty).toBe(15); expect(resolveReviewItems(db, [], [line('solar', 30)], undefined)[0].qty).toBe(30);
  });
  it('the chat says so and estimates rate x quantity', () => {
    const e = estimate('Makati', 'solar panels', 10, 'residential', true); expect(e.estimate).toBe(2450); expect(e.estimate_en).not.toMatch(/minimum applies/); expect(e.rates_en).toMatch(/no minimum charge/); expect(e.rates_en).toMatch(/roof cleaning/);
    expect(estimate('Makati', 'floor cleaning', 30, 'residential', true).estimate).toBe(3750); expect(estimate('Makati', 'floor cleaning', 30).estimate).toBe(6250);   // floor beside a roof job: 30 sqm x 125; alone the 50 sqm minimum applies expect(e.rates_tglish).toMatch(/walang minimum/);
    expect(estimate('Makati', 'solar panels', 10).estimate).toBe(4900);
  });
});
