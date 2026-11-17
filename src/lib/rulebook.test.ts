import { describe, expect, it } from 'vitest';
import { diffSections, joinRulebook, slug, splitRulebook, validateRulebook, type Section } from './rulebook';

// a made-up rulebook (the real one is never in the code)
const md = `# Test Rulebook V1.0

**Company:** Example Co.

## 1. AI Identity and Personality
You are an assistant.

## 3. Pricing — Mandatory Rules
Prices come from the system.

### A sub heading stays inside its section
text

## 5. Booking and Scheduling Rules
Only the system confirms.

## 14. Human Handover Rules
Hand over for complaints.

## 19. Final Non-Negotiable Rules
1. Never invent prices.
`;

describe('splitting a pasted rulebook', () => {
  const r = splitRulebook(md);
  it('takes the title, the introduction and every "##" heading as a section', () => {
    expect(r.title).toBe('Test Rulebook V1.0'); expect(r.sections.map((s) => s.title)).toEqual(['Introduction', '1. AI Identity and Personality', '3. Pricing — Mandatory Rules', '5. Booking and Scheduling Rules', '14. Human Handover Rules', '19. Final Non-Negotiable Rules']);
    expect(r.sections[0].body).toContain('Example Co.'); expect(r.sections[2].body).toContain('### A sub heading stays inside its section');
  });
  it('makes clean, unique keys', () => { expect(slug('3. Pricing — Mandatory Rules')).toBe('3-pricing-mandatory-rules'); expect(new Set(r.sections.map((s) => s.key)).size).toBe(r.sections.length); expect(splitRulebook('## A\nx\n## A\ny').sections.map((s) => s.key)).toEqual(['a', 'a-2']); });
  it('joins back to Markdown that splits into the same sections', () => { const again = splitRulebook(joinRulebook(r.sections, r.title)); expect(again.sections.map((s) => [s.title, s.body])).toEqual(r.sections.map((s) => [s.title, s.body])); });
});

describe('checking a rulebook before it can be published', () => {
  const ok = splitRulebook(md).sections;
  it('passes a complete rulebook', () => expect(validateRulebook(ok)).toEqual([]));
  it('names what is missing, empty or duplicated', () => {
    expect(validateRulebook([])).toEqual(['The rulebook has no sections.']);
    expect(validateRulebook(ok.filter((s) => !/Handover/.test(s.title)))).toContain('Missing: when to hand over to a person.');
    expect(validateRulebook([...ok, { key: 'x', title: 'Extra', body: '  ' }])).toContain('"Extra" is empty.');
    expect(validateRulebook([...ok, { ...ok[1] }]).some((p) => p.includes('share the key'))).toBe(true);
    expect(validateRulebook([{ ...ok[1], body: 'x'.repeat(30_001) }, ...ok.slice(2)]).some((p) => p.includes('too long'))).toBe(true);
  });
});

describe('what changed between versions', () => {
  it('lists added, removed and changed sections', () => {
    const a: Section[] = [{ key: 'a', title: 'A', body: '1' }, { key: 'b', title: 'B', body: '2' }]; const b: Section[] = [{ key: 'a', title: 'A', body: '1 changed' }, { key: 'c', title: 'C', body: '3' }];
    expect(diffSections(a, b)).toEqual({ added: ['C'], removed: ['B'], changed: ['A'] });
  });
});
