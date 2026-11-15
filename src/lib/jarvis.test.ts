import { describe, expect, it } from 'vitest';
import { crewBonus, cityOf, parseProposals, weatherRisk, knowledgeBlock, pickSections, splitKnowledge, cleanNote, memoryBlock, addDays, alertIsInstant, alertLine, chunks, invoiceBalance, invoiceTotal, manilaDay, ownerIds, personaPrompt, speakable } from '../../supabase/functions/jarvis/logic';

describe('jarvis helpers', () => {
  it('works in Manila time', () => {
    expect(manilaDay(Date.parse('2026-11-14T17:00:00Z'))).toBe('2026-11-15');       // 1 AM Manila the next day
    expect(manilaDay(Date.parse('2026-11-14T15:59:00Z'))).toBe('2026-11-14');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01'); expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('reads the owner ids', () => {
    expect(ownerIds('123456, 789')).toEqual([123456, 789]); expect(ownerIds('')).toEqual([]); expect(ownerIds(undefined)).toEqual([]); expect(ownerIds('abc,-5,0,12')).toEqual([12]);
  });
  it('speaks instantly only for discounts and accepted quotations', () => {
    expect(alertIsInstant('discount')).toBe(true); expect(alertIsInstant('quotation')).toBe(true);
    expect(alertIsInstant('lead')).toBe(false); expect(alertIsInstant('variation')).toBe(false);
  });
  it('cleans text for the voice: pesos spelled out, no links, no phone numbers, no markdown', () => {
    const s = speakable('**Discount** requested: ₱1,200.50 off. Call 0917 123 4567 or see https://ops.topmop.ph/x now');
    expect(s).toContain('1,200.50 pesos'); expect(s).not.toMatch(/https?:|0917|\*/);
    expect(speakable('a'.repeat(3000), 100).length).toBeLessThanOrEqual(100);
  });
  it('turns an alert into one short line', () => {
    expect(alertLine({ kind: 'discount', title: 'Discount requested', body: 'DR-1 · JOB-9 · Ana: ₱500 off ₱5,000' })).toBe('Discount requested. DR-1 · JOB-9 · Ana: 500 pesos off 5,000 pesos');
  });
  it('splits long messages for Telegram', () => {
    const parts = chunks(('word '.repeat(2000)).trim(), 3800); expect(parts.length).toBeGreaterThan(1); expect(parts.every((p) => p.length <= 3800)).toBe(true);
    expect(chunks('short')).toEqual(['short']);
  });
  it('computes invoice totals and balances like the app', () => {
    const inv = { items: [{ qty: 1, rate: 5000, discount: 0 }, { qty: 2, rate: 1000, discount: 100 }], discount: 400, vat_mode: 'exclusive', vat_rate: 12 };
    expect(invoiceTotal(inv)).toBe(7280);                                              // (5000 + 2000 - 100 - 400) = 6500 × 1.12
    const pays = [{ amount: 3000, wht_amount: 130, status: 'Verified', reversed: false, method: 'Cash', cheque_status: null }, { amount: 999, wht_amount: 0, status: 'Pending Verification', reversed: false, method: 'Cash', cheque_status: null },
      { amount: 500, wht_amount: 0, status: 'Verified', reversed: true, method: 'Cash', cheque_status: null }, { amount: 700, wht_amount: 0, status: 'Verified', reversed: false, method: 'Cheque', cheque_status: 'Pending' }];
    expect(invoiceBalance(inv, pays)).toBe(4150);                                      // only the first payment counts
    expect(invoiceTotal({ items: [{ qty: 1, rate: 100, measure: true }, { qty: 1, rate: 50 }], discount: null, vat_mode: 'none', vat_rate: null })).toBe(50);
  });
  it('tells the assistant to stay read-only and keep names out when asked', () => {
    expect(personaPrompt('Boss', true)).toContain('"Boss"'); expect(personaPrompt('', false)).toContain('Do not say client names');
    expect(personaPrompt('', true)).toContain('You can only read information'); expect(personaPrompt('', true)).toContain('honorific'); expect(personaPrompt('Boss', true)).not.toContain('honorific');
    expect(personaPrompt('', true)).not.toContain('search the web'); expect(personaPrompt('', true, true)).toMatch(/search the web[\s\S]*NEVER put a client name/);
  });
});

describe('Jarvis long-term memory', () => {
  it('keeps short plain notes and refuses links, numbers and secrets', () => {
    expect(cleanNote('  Prefers   the brief under 100 words ')).toBe('Prefers the brief under 100 words');
    expect(cleanNote('ok')).toBeNull();
    expect(cleanNote('see https://example.com')).toBeNull();
    expect(cleanNote('call him on 0917 123 4567')).toBeNull();
    expect(cleanNote('the api key is abc')).toBeNull();
    expect(cleanNote('x'.repeat(40) + ' long token')).toBeNull();
    expect(cleanNote(42)).toBeNull();
    expect(cleanNote('word '.repeat(80))!.length).toBe(200);
  });
  it('builds the memory section with ids and favourite topics', () => {
    expect(memoryBlock([], [])).toBe('');
    const b = memoryBlock([{ id: 7, kind: 'preference', text: 'Keep it short' }], [{ topic: 'unpaid invoices', n: 9 }, { topic: 'quotations', n: 1 }, { topic: 'crew attendance', n: 4 }]);
    expect(b).toContain('[#7] Keep it short'); expect(b).toContain('unpaid invoices, crew attendance'); expect(b).not.toContain('quotations');
  });
});

describe('Jarvis company knowledge base', () => {
  const doc = '# TOPMOP KNOWLEDGE BASE\n**Company:** Top Mop\n\n---\n\n# 1. COMPANY OVERVIEW\nSEC-registered.\n\n## History\nFounded 2024.\n\n# 5. CORE SERVICES\n## Solar Panel Cleaning\nPurified water.\n```\n# not a heading\n```\n\n# 24. RULES FOR JARVIS\nNever invent prices.\n';
  it('cuts a document at top-level headings and ignores code fences and rules', () => {
    const s = splitKnowledge(doc);
    expect(s.map((x) => x.title)).toEqual(['TOPMOP KNOWLEDGE BASE', 'COMPANY OVERVIEW', 'CORE SERVICES', 'RULES FOR JARVIS']);
    expect(s[1].body).toContain('## History'); expect(s[2].body).toContain('# not a heading'); expect(s.map((x) => x.num)).toEqual([0, 1, 2, 3]);
    expect(splitKnowledge('')).toEqual([]);
  });
  it('picks the best sections for a question or a number', () => {
    const s = splitKnowledge(doc);
    expect(pickSections('solar panel', s)[0].title).toBe('CORE SERVICES');
    expect(pickSections('section 1', s)[0].title).toBe('COMPANY OVERVIEW');
    expect(pickSections('zzzzz', s)).toEqual([]); expect(pickSections('', s)).toEqual([]);
  });
  it('lists the sections and always includes the rules', () => {
    const b = knowledgeBlock(splitKnowledge(doc));
    expect(b).toContain('2 CORE SERVICES'); expect(b).toContain('Never invent prices.'); expect(knowledgeBlock([])).toBe('');
  });
});

describe('Jarvis weather and learning helpers', () => {
  const h = (hour: number, prob: number, mm = 0, gust = 10, code = 1) => ({ hour, prob, mm, gust, code });
  it('finds the city in a site address, defaulting to Manila', () => {
    expect(cityOf('12 Rizal St., Brgy. Holy Spirit, Quezon City')).toBe('quezon city'); expect(cityOf('Lot 4, Imus, Cavite')).toBe('cavite'); expect(cityOf('somewhere')).toBe('manila'); expect(cityOf(null)).toBe('manila');
  });
  it('rates the weather risk for the working window only', () => {
    expect(weatherRisk([h(9, 10), h(10, 20)]).level).toBe('none');
    expect(weatherRisk([h(9, 45)]).level).toBe('watch');
    expect(weatherRisk([h(9, 80, 6)]).level).toBe('high');
    expect(weatherRisk([h(9, 10, 0, 55)]).reasons[0]).toContain('gusts');
    expect(weatherRisk([h(14, 10, 0, 10, 95)], 13, 17)).toEqual({ level: 'high', reasons: ['thunderstorms'] });
    expect(weatherRisk([h(20, 95, 20)], 7, 17).level).toBe('none');          // storm after the job is not a risk to it
    expect(weatherRisk([]).level).toBe('none');
  });
  it('reads the nightly review reply and drops bad notes', () => {
    const reply = 'Here you go: [{"kind":"preference","text":"Prefers short answers","why":"asked twice"},{"kind":"weird","text":"Likes the weather first"},{"kind":"fact","text":"call 0917 123 4567"},{"text":"x"}]';
    expect(parseProposals(reply).map((p) => [p.kind, p.text])).toEqual([['preference', 'Prefers short answers'], ['preference', 'Likes the weather first']]);
    expect(parseProposals('nothing')).toEqual([]); expect(parseProposals('[not json]')).toEqual([]);
  });
});

describe('Jarvis crew bonus tool', () => {
  it('matches the payroll rule: full thresholds only', () => {
    expect(crewBonus(60, 3)).toEqual({ each: 280, total: 840, threshold: 30, steps: 2 });
    expect(crewBonus(29, 3).each).toBe(0); expect(crewBonus(30, 3).each).toBe(140); expect(crewBonus(80, 4).each).toBe(280);
    expect(crewBonus(50, 2, 10, 200).each).toBe(400); expect(crewBonus(0, 3).each).toBe(0); expect(crewBonus(60, 0).total).toBe(0);
  });
});
