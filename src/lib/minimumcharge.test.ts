// MINIMUM PACKAGE CHARGE (owner rule). The calculation itself enforces it; the AI only quotes the tool's figure.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUNDLE_REPLY, MIN_CHARGE_REPLY, TOOLS, buildSystem, guardReply } from '../../supabase/functions/_shared/brain';
import { makeExec } from '../../supabase/functions/_shared/chatexec';
import { bundleWaives, estimate, estimateBundle } from '../../supabase/functions/_shared/estimate';
import { emptyContext } from '../../supabase/functions/_shared/chatcontext';
import { validateReply } from '../../supabase/functions/_shared/validate';

const price = (city: string, service: string, qty: number) => estimate(city, service, qty).estimate;
const bundle = (items: { service: string; qty?: number }[], city = 'Makati') => estimateBundle(city, items);

describe('every package has a minimum charge (standalone services)', () => {
  it('window cleaning, Makati: ₱4,799 up to 31 panels, never less, then ₱140 per extra panel', () => {
    for (const n of [1, 15, 30, 31]) expect(price('Makati', 'window cleaning', n), `${n} panels`).toBe(4799);
    expect(price('Makati', 'window cleaning', 40)).toBe(6059); expect(price('Makati', 'window cleaning', 32)).toBe(4939);
    expect(price('Imus', 'window cleaning', 41)).toBe(5799); expect(price('Imus', 'window cleaning', 50)).toBe(7059);
  });
  it('roof ₱145/sqm, minimum 100 sqm: 60 sqm is ₱14,500; 150 sqm is ₱21,750', () => { for (const n of [1, 60, 99, 100]) expect(price('Makati', 'roof cleaning', n), `${n} sqm`).toBe(14500); expect(price('Makati', 'roof cleaning', 150)).toBe(21750); });
  it('wall and floor ₱125/sqm, minimum 50 sqm: 20 sqm is ₱6,250; 80 sqm is ₱10,000', () => {
    for (const s of ['wall cleaning', 'floor cleaning', 'driveway']) { for (const n of [1, 20, 49, 50]) expect(price('Makati', s, n), `${s} ${n}`).toBe(6250); expect(price('Makati', s, 80), s).toBe(10000); }
  });
  it('solar ₱245/panel, minimum 20 panels: 10 panels is ₱4,900; 25 panels is ₱6,125', () => { for (const n of [1, 10, 19, 20]) expect(price('Makati', 'solar panels', n), `${n} panels`).toBe(4900); expect(price('Makati', 'solar panels', 25)).toBe(6125); });
  it('without a quantity the minimum is what is billed (the tool says so; no total is invented)', () => {
    const r = estimate('Makati', 'roof cleaning'); expect(r.estimate).toBeUndefined(); expect(r.rates_en).toMatch(/minimum of 100 sqm/);
  });
  it('the minimum is never waived for a standalone service, even when asked for', () => {
    expect(estimate('Makati', 'solar panels', 10, 'residential', false).estimate).toBe(4900);
    expect(bundleWaives('solar', [])).toBe(false); expect(bundleWaives('solar', ['solar'])).toBe(false); expect(bundleWaives('roof', ['roof'])).toBe(false); expect(bundleWaives('window', ['window'])).toBe(false);
  });
});

describe('bundled services: the first keeps its minimum, the second is billed on the actual quantity', () => {
  it('the owner example: Makati windows ₱4,799 + 10 solar panels × ₱245 = ₱2,450, combined ₱7,249', () => {
    const b = bundle([{ service: 'window cleaning', qty: 15 }, { service: 'solar panels', qty: 10 }]); expect(b.ok).toBe(true); expect(b.kind).toBe('bundle'); expect(b.estimate).toBe(7249);
    expect(b.lines).toMatchObject([{ role: 'first', amount: 4799 }, { role: 'second', qty: 10, rate: 245, amount: 2450 }]);
    expect(bundle([{ service: 'window cleaning' }, { service: 'solar panels', qty: 10 }]).estimate).toBe(7249);      // glass count not known yet: the package minimum applies
    expect(bundle([{ service: 'window cleaning', qty: 31 }, { service: 'solar panels', qty: 10 }]).estimate).toBe(7249);
  });
  it('extra panels on the first service are still charged; the second stays at actual quantity', () => {
    expect(bundle([{ service: 'window cleaning', qty: 40 }, { service: 'solar panels', qty: 10 }]).estimate).toBe(6059 + 2450);
    expect(bundle([{ service: 'window cleaning', qty: 20 }, { service: 'solar panels', qty: 30 }]).estimate).toBe(4799 + 7350);
  });
  it('windows + roof 60 sqm: the roof minimum (100 sqm) is waived because it is the second service', () => { expect(bundle([{ service: 'window cleaning' }, { service: 'roof cleaning', qty: 60 }]).estimate).toBe(4799 + 8700); });
  it('windows + wall 20 sqm and + floor 20 sqm: 20 × ₱125 = ₱2,500, not ₱6,250', () => { for (const s of ['wall cleaning', 'floor cleaning']) expect(bundle([{ service: 'window cleaning' }, { service: s, qty: 20 }]).estimate, s).toBe(4799 + 2500); });
  it('the window package is always the first service, wherever it is listed', () => { const b = bundle([{ service: 'solar panels', qty: 10 }, { service: 'window cleaning', qty: 15 }]); expect(b.estimate).toBe(7249); expect(b.lines![0].role).toBe('first'); expect(b.lines![0].amount).toBe(4799); });
  it('two per-unit services: the first one listed keeps its full minimum, the second is waived', () => {
    expect(bundle([{ service: 'roof cleaning', qty: 60 }, { service: 'solar panels', qty: 10 }]).estimate).toBe(14500 + 2450);
    expect(bundle([{ service: 'solar panels', qty: 10 }, { service: 'roof cleaning', qty: 60 }]).estimate).toBe(4900 + 8700);
  });
  it('the second service is never free, never at a lower rate, and the first minimum is never waived', () => {
    const b = bundle([{ service: 'window cleaning', qty: 15 }, { service: 'solar panels', qty: 10 }]); const [f, sec] = b.lines!; expect(sec.amount).toBe(sec.qty! * sec.rate!); expect(sec.amount).toBeGreaterThan(0); expect(sec.rate).toBe(245); expect(f.amount).toBeGreaterThanOrEqual(4799);
    expect(b.estimate_en + b.rates_en).not.toMatch(/free|discount|% off|libre/i);
  });
  it('the text says the second service has no minimum and that special equipment or access charges may apply', () => { const b = bundle([{ service: 'window cleaning', qty: 15 }, { service: 'solar panels', qty: 10 }]); expect(b.estimate_en).toMatch(/no minimum\)/); expect(b.estimate_en).toMatch(/special equipment or access charges may apply/); expect(b.estimate_en).toContain('₱7,249'); });
  it('only eligible services bundle: custom services in the list, a single service, six items, the same service twice, an unknown city, a commercial property are priced by a person', () => {
    expect(bundle([{ service: 'gutter cleaning', qty: 10 }, { service: 'solar panels', qty: 10 }]).ok).toBe(false);
    expect(bundle([{ service: 'window cleaning' }, { service: 'solar panels', qty: 10 }, { service: 'gutter cleaning', qty: 5 }]).ok).toBe(false);
    expect(bundle([{ service: 'window cleaning' }]).ok).toBe(false); expect(bundle([{ service: 'window cleaning' }, { service: 'roof cleaning', qty: 60 }, { service: 'solar panels', qty: 10 }, { service: 'wall cleaning', qty: 20 }, { service: 'floor cleaning', qty: 20 }, { service: 'window cleaning' }]).ok).toBe(false);
    expect(bundle([{ service: 'roof cleaning', qty: 60 }, { service: 'roof cleaning', qty: 60 }]).ok).toBe(false);
    expect(bundle([{ service: '', qty: 10 }, { service: 'solar panels', qty: 10 }]).ok).toBe(false);
    expect(bundle([{ service: 'window cleaning' }, { service: 'solar panels', qty: 10 }], 'Baguio').ok).toBe(false);
    expect(estimateBundle('Makati', [{ service: 'window cleaning' }, { service: 'solar panels', qty: 10 }], 'office building').kind).toBe('commercial');
    expect(bundle([{ service: 'window cleaning' }, { service: 'solar panels', qty: 10 }], 'Baguio').estimate).toBeUndefined();
  });
  it('without the second quantity there is no total, only the rate and the waived minimum', () => { const b = bundle([{ service: 'window cleaning' }, { service: 'solar panels' }]); expect(b.ok).toBe(true); expect(b.estimate).toBeUndefined(); expect(b.rates_en).toMatch(/₱245 per panel, with no minimum/); });
});

describe('three or more services: when one package is taken, every other package has no minimum (owner)', () => {
  it('windows + 10 solar panels + 60 sqm of roof = ₱4,799 + ₱2,450 + ₱8,700 = ₱15,949', () => {
    const b = bundle([{ service: 'window cleaning', qty: 15 }, { service: 'solar panels', qty: 10 }, { service: 'roof cleaning', qty: 60 }]); expect(b.ok).toBe(true); expect(b.estimate).toBe(4799 + 2450 + 8700);
    expect(b.lines!.map((l) => [l.role, l.amount])).toEqual([['first', 4799], ['second', 2450], ['second', 8700]]);
    expect(b.estimate_en).toContain('₱15,949'); expect(b.estimate_en + b.rates_en).not.toMatch(/free|discount|% off|libre/i);
  });
  it('only the first keeps its minimum, wherever the window package is listed; all five eligible services can bundle', () => {
    expect(bundle([{ service: 'roof cleaning', qty: 60 }, { service: 'solar panels', qty: 10 }, { service: 'wall cleaning', qty: 20 }]).estimate).toBe(14500 + 2450 + 2500);
    expect(bundle([{ service: 'solar panels', qty: 10 }, { service: 'roof cleaning', qty: 60 }, { service: 'window cleaning', qty: 40 }]).estimate).toBe(6059 + 2450 + 8700);
    expect(bundle([{ service: 'window cleaning' }, { service: 'roof cleaning', qty: 60 }, { service: 'solar panels', qty: 10 }, { service: 'wall cleaning', qty: 20 }, { service: 'floor cleaning', qty: 20 }]).estimate).toBe(4799 + 8700 + 2450 + 2500 + 2500);
  });
  it('bundleWaives: every service after the first is waived, the first never is', () => {
    expect(bundleWaives('solar', ['window', 'solar', 'roof'])).toBe(true); expect(bundleWaives('roof', ['window', 'solar', 'roof'])).toBe(true); expect(bundleWaives('window', ['window', 'solar', 'roof'])).toBe(false);
    expect(bundleWaives('roof', ['roof', 'solar', 'wall'])).toBe(false); expect(bundleWaives('solar', ['roof', 'solar', 'wall'])).toBe(true); expect(bundleWaives('wall', ['roof', 'solar', 'wall'])).toBe(true);
  });
});

describe('bundleWaives: the code, not the AI, decides who qualifies', () => {
  it('only a per-sqm / per-panel service, and only behind a first service', () => {
    expect(bundleWaives('solar', ['window', 'solar'])).toBe(true); expect(bundleWaives('solar', ['solar', 'window'])).toBe(true);     // the glass package is always first
    expect(bundleWaives('roof', ['roof', 'wall'])).toBe(false); expect(bundleWaives('wall', ['roof', 'wall'])).toBe(true);             // two per-unit services: the one mentioned first keeps its minimum
    expect(bundleWaives('window', ['window', 'solar'])).toBe(false);                                                                  // the glass package is never waived
    expect(bundleWaives('gutter', ['window', 'gutter'])).toBe(false); expect(bundleWaives('solar', ['window', 'gutter'])).toBe(false); expect(bundleWaives('solar', ['window'])).toBe(false); expect(bundleWaives('wall', [])).toBe(false);
  });
});

describe('the tool runner enforces it, whatever the model asks for', () => {
  const calls: Record<string, unknown>[] = [];
  const fakeFetch = async (_u: string, init: { body: string }) => {
    const b = JSON.parse(init.body); calls.push(b);
    const e = Array.isArray(b.items) ? estimateBundle(String(b.address), b.items, String(b.property_type ?? '')) : estimate(String(b.address), String(b.service ?? ''), Number(b.qty), String(b.property_type ?? ''), b.with_main === true);
    return new Response(JSON.stringify({ ...e, reply: e.estimate_en || e.rates_en }), { status: 200 });
  };
  afterEach(() => { vi.unstubAllGlobals(); calls.length = 0; });
  const run = (services: string[], input: Record<string, unknown>) => { vi.stubGlobal('fetch', fakeFetch); return makeExec({ sb: {}, base: 'https://x', key: 'k', conv: { id: 'c', channel: 'messenger', subscriber_id: 's' }, lang: 'en', services })('estimate', { address: 'Makati', ...input }); };
  it('a standalone service: with_main from the model is ignored, the minimum applies', async () => {
    const r = await run([], { service: 'solar panels', qty: 10, with_main: true }); expect(calls[0].with_main).toBe(false); expect(r.text).toMatch(/4,900/); expect(r.amounts).toContain(4900);
    const r2 = await run(['solar'], { service: 'solar panels', qty: 10, with_main: true }); expect(r2.text).toMatch(/4,900/);
  });
  it('a real second service after the window package: with_main is accepted', async () => { const r = await run(['window', 'solar'], { service: 'solar panels', qty: 10, with_main: true }); expect(calls[0].with_main).toBe(true); expect(r.text).toMatch(/2,450/); });
  it('two services: the code returns the combined total and its parts as allowed amounts', async () => {
    const r = await run(['window', 'solar'], { items: [{ service: 'window cleaning', qty: 15 }, { service: 'solar panels', qty: 10 }] }); expect(r.text).toContain('₱7,249'); expect(r.amounts).toEqual(expect.arrayContaining([7249, 4799, 2450, 245]));
    expect(guardReply('For both it comes to ₱7,249 po.', { amounts: r.amounts ?? [], booked: false }).violations).toEqual([]);
    expect(guardReply('For both it comes to ₱7,249 po.', { amounts: [], booked: false }).violations.join()).toMatch(/no tool returned/);        // the AI cannot invent the total
  });
});

describe('the reply checks and the prompt', () => {
  const ctx = emptyContext(); const check = (r: string, q = 'how much is it?') => validateReply(r, { ctx, intent: ctx.intent, customerText: q, previousAi: [] });
  it('the approved explanations are valid replies', () => { expect(check(MIN_CHARGE_REPLY, 'why do I pay ₱4,799 for 15 panels?')).toEqual([]); expect(check(BUNDLE_REPLY, 'is there a minimum if I bundle two services?')).toEqual([]); });
  it('prorating or "pay only for what is cleaned" is caught; the second service having no minimum is fine', () => {
    for (const bad of ["You'll only pay for the actual 15 panels po.", 'We can prorate it for fewer panels po.', 'There is no minimum charge po.', 'You pay only for the actual count po.']) expect(check(bad).join(), bad).toMatch(/minimum: every package has a minimum charge/);
    for (const ok of ['The second service has no minimum po.', 'For bundled services po, the second one has no minimum.', 'The package rate still applies even if the quantity is lower po.']) expect(check(ok).join(), ok).not.toMatch(/minimum: every package/);
  });
  it('the prompt states the mandatory minimum, the first/second rule, the tool and the equipment note', () => {
    const sys = buildSystem({ sections: [{ key: 'a', title: 'I', body: 'You are TopMop.' }], version: 4, lang: 'en' } as never);
    for (const r of [/every service package has a minimum charge/, /never prorate it/, /15 panels is still ₱4,799/, /60 sqm is ₱14,500/, /20 sqm is ₱6,250/, /10 panels is ₱4,900/, /the FIRST service \(the window package if there is one\) keeps its full minimum charge; EVERY OTHER service has its minimum waived/, /₱4,799 plus 10 solar panels × ₱245 = ₱2,450, a combined ₱7,249/, /Never apply it to a single service or to the first service/, /for two or more services call it ONCE with every service in items/, /Special equipment or access charges may still apply/, /never your own arithmetic/]) expect(sys).toMatch(r);
    const t = (TOOLS as unknown as { name: string; description: string; input_schema: { properties: Record<string, unknown> } }[]).find((x) => x.name === 'estimate')!; expect(t.input_schema.properties.items).toBeTruthy(); expect(t.description).toMatch(/applies the minimum charge of every package/); expect(t.description).toMatch(/never calculate, prorate or add amounts yourself/);
  });
});

describe('"the final amount is confirmed on site" is not a booking confirmation (it handed a real customer to staff in production)', () => {
  it('the standard estimate sentences pass the guard; real booking claims are still caught', () => {
    for (const ok of ['The final amount is confirmed on site.', 'Our team confirms the final area, and the total is confirmed on site po.', 'The price is set once the crew counts the panels on site.']) expect(guardReply(ok, { amounts: [], booked: false }).violations, ok).toEqual([]);
    for (const bad of ['Your booking is confirmed po.', 'You are booked for Saturday po.', 'Nov 21 is confirmed for you po.', 'Your schedule is confirmed po.']) expect(guardReply(bad, { amounts: [], booked: false }).violations.join(), bad).toMatch(/booking is confirmed/);
    expect(guardReply('Your booking is confirmed po.', { amounts: [], booked: true }).violations).toEqual([]);
  });
});

