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

import { cardForLog, cardUrl } from '../../supabase/functions/_shared/estimatecard';
describe('card address', () => {
  it('builds a card address from the last estimate the AI asked for, never for a person-needed answer', () => {
    const u = cardForLog([{ tool: 'check_date', input: {} }, { tool: 'estimate', input: { address: 'Pasay', service: 'window cleaning', qty: 50 } }], 'https://ops.topmop.ph/');
    expect(u).toBe('https://ops.topmop.ph/api/estimate-card?address=Pasay&qty=50&service=window+cleaning&property=Residential');
    expect(cardForLog([{ tool: 'estimate', input: { address: 'Atlantis', qty: 40 } }], 'https://x')).toBeNull();
    expect(cardForLog([{ tool: 'estimate', input: { address: 'Makati', qty: 40, property_type: 'Commercial' } }], 'https://x')).toBeNull();
    expect(cardForLog([{ tool: 'estimate', input: { address: 'Makati' } }], 'https://x')).toBeNull();
    expect(cardUrl('https://a.b', { address: 'Las Piñas', qty: 33.4 })).toContain('qty=33');
  });
});

import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
describe('card server bundle', () => {
  it('api/_cardcore.mjs is up to date (run: npm run build:card)', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'card-')), '_cardcore.mjs'); execSync(`npx rolldown src/lib/cardserver.ts --format esm --platform neutral -o ${out}`, { cwd: process.cwd(), stdio: 'pipe' });
    expect(readFileSync('api/_cardcore.mjs', 'utf8').trim()).toBe(readFileSync(out, 'utf8').trim());
  }, 60_000);
});

import { explainsPanelCount, panelGuideUrl } from '../../supabase/functions/_shared/estimatecard';
describe('panel guide picture', () => {
  it('goes with the reply when panel counting is asked about or explained', () => {
    expect(explainsPanelCount('Paano po kayo magbilang ng panels?', '')).toBe(true); expect(explainsPanelCount('How do you count the panels?', '')).toBe(true); expect(explainsPanelCount('ilan po ba ang panels ng 10 windows', '')).toBe(true);
    expect(explainsPanelCount('hi', 'A glass panel is counted by side, not by its size.')).toBe(true); expect(explainsPanelCount('Magkano po sa Makati?', 'The package is 4,799')).toBe(false);
    expect(panelGuideUrl('https://ops.topmop.ph/')).toBe('https://ops.topmop.ph/panel-guide.png');
  });
});
