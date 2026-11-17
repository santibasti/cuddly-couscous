import { describe, expect, it } from 'vitest';
import { estimate } from '../../supabase/functions/_shared/estimate';
import { cardLines, estimateCardSvg, wrapText } from '../../supabase/functions/_shared/estimatecard';
import { writeFileSync } from 'node:fs';
describe('estimate card', () => {
  it('draws the same figures as the estimate (Pasay, 50 panels = 4,799 + 19 x 140 = 7,459)', () => {
    const e = estimate('Pasay', 'window cleaning', 50); const svg = estimateCardSvg(e)!;
    expect(svg).toContain('₱7,459'); expect(svg).toContain('19 extra × ₱140 = ₱2,660'); expect(svg).toContain('₱4,799 package includes up to 31 panels'); expect(svg).toContain('Total entered: 50 panels');
    if (process.env.CARD_OUT) writeFileSync(process.env.CARD_OUT, svg);
  });
  it('no card for an unknown city, a commercial property or a custom service', () => {
    expect(estimateCardSvg(estimate('Atlantis', 'window cleaning', 40))).toBeNull(); expect(estimateCardSvg(estimate('Makati', 'window cleaning', 40, 'commercial'))).toBeNull(); expect(estimateCardSvg(estimate('Makati', 'gutter cleaning', 40))).toBeNull();
  });
  it('within the package there are no extra panels, and wrapping never loses words', () => {
    expect(cardLines(estimate('Makati', 'window cleaning', 21))!.lines.join(' ')).toContain('No extra panels'); expect(wrapText('a b c d e f', 5).join(' ')).toBe('a b c d e f');
  });
});
