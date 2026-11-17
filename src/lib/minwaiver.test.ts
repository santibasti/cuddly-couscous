import { describe, expect, it } from 'vitest';
import { resolveReviewItems } from './business';
import { estimate } from '../../supabase/functions/_shared/estimate';
import { seedDB } from './seed';
import type { QuoteItem } from './types';

const db = seedDB();
const line = (category: QuoteItem['category'], qty: number, extra: Partial<QuoteItem> = {}): QuoteItem => ({ service_code: category === 'solar' ? 'SOLAR' : category === 'roof' ? 'ROOF' : 'WALL', category, description: 'x', qty, entered_qty: qty, unit: category === 'solar' ? 'panel' : 'sqm', rate: 245, discount: 0, ...extra } as QuoteItem);

describe('the minimum charge is waived for add-ons booked with a glass package', () => {
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
    const e = estimate('Makati', 'solar panels', 10, 'residential', true); expect(e.estimate).toBe(2450); expect(e.estimate_en).not.toMatch(/minimum applies/); expect(e.rates_en).toMatch(/no minimum charge/); expect(e.rates_tglish).toMatch(/walang minimum/);
    expect(estimate('Makati', 'solar panels', 10).estimate).toBe(4900);
  });
});
