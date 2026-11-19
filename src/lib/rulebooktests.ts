// The conversation tests every rulebook draft must pass before it can be published. They check the parts of the chat that are code (prices, dates, wording rules),
// so a change to a rate, a rule or a message can never go live unnoticed. They never contain customer data.
import { estimate } from '../../supabase/functions/_shared/estimate';
import { DEFAULT_RULES, bookedReply, checkAvailability, pick, type Facts } from '../../supabase/functions/chat-availability/logic';
import { resolveReviewItems } from './business';
import type { QuoteItem, ServiceDef } from './types';

export interface TestResult { name: string; ok: boolean; detail: string }
const today = '2026-11-16';
const job = (date: string, id: string) => ({ start_at: `${date}T08:00`, end_at: `${date}T17:00`, status: 'Confirmed', leader_id: id, crew_ids: [], vehicle_id: null });
const facts = (jobs: Facts['jobs'] = []): Facts => ({ jobs, field: [], vehicles: [], holidays: [] });
const svc = { code: 'SOLAR', name: 'Solar', unit: 'panel', rate: 245, minimum_qty: 20, custom_quote: false } as unknown as ServiceDef;
const solar = (qty: number): QuoteItem => ({ service_code: 'SOLAR', category: 'solar', description: 'x', qty, entered_qty: qty, unit: 'panel', rate: 245, discount: 0 }) as QuoteItem;
const eq = (got: unknown, want: unknown, what: string) => (got === want ? null : `${what}: expected ${String(want)}, got ${String(got)}`);
const has = (text: string, re: RegExp, what: string) => (re.test(text) ? null : `${what}: the text does not say it ("${text.slice(0, 80)}…")`);
const lacks = (text: string, re: RegExp, what: string) => (re.test(text) ? `${what}: the text must not contain it` : null);
const first = (...r: (string | null)[]) => r.find((x) => x) ?? null;

export const CASES: { name: string; run: () => string | null }[] = [
  { name: 'Residential, Makati, about 40 panels = ₱6,059 (package + 9 extra at ₱140)', run: () => first(eq(estimate('Makati', 'window cleaning', 40).estimate, 6059, 'estimate'), has(estimate('Makati', '', 40).estimate_en, /final amount is confirmed on site/, 'final amount note')) },
  { name: '21 panels is inside the package: ₱4,799, nothing extra, nothing off', run: () => first(eq(estimate('Makati', '', 21).estimate, 4799, 'estimate'), eq(estimate('Makati', '', 21).extra_qty, 0, 'extra panels')) },
  { name: 'Every estimate says the final amount is confirmed on site, in English for every language', run: () => first(...[estimate('Imus', '', 50), estimate('Imus', 'roof', 150), estimate('Makati', 'solar', 25)].flatMap((e) => [has(e.estimate_en, /final amount is confirmed on site/, 'English'), has(e.estimate_tglish, /final amount is confirmed on site/, 'every language')])) },
  { name: 'A city that is not in the rate list: no price is invented, a person verifies', run: () => first(eq(estimate('Baguio', '', 30).ok, false, 'ok'), eq(estimate('Baguio', '', 30).estimate, undefined, 'estimate'), has(estimate('Baguio', '', 30).estimate_en, /team verify/, 'verify wording')) },
  { name: 'A commercial property is never priced from the residential packages', run: () => first(eq(estimate('Makati', 'window cleaning', 80, 'Commercial').kind, 'commercial', 'kind'), eq(estimate('Makati', '', 80, 'office building').estimate, undefined, 'estimate')) },
  { name: 'Gutter, ACP, ceiling, indoor, facade, post-construction, rope access: assessment, no price', run: () => first(...['gutter cleaning', 'ACP cladding', 'ceiling', 'indoor wall', 'facade', 'post-construction', 'rope access high-rise'].map((s) => eq(estimate('Makati', s, 40).estimate, undefined, s))) },
  { name: 'Roof, wall, floor and solar are billed at the minimum until measured', run: () => first(eq(estimate('Imus', 'roof cleaning', 60).estimate, 14500, 'roof 60 sqm'), eq(estimate('Makati', 'solar panels', 17).estimate, 4900, 'solar 17'), eq(estimate('Makati', 'floor', 30).estimate, 6250, 'floor 30')) },
  { name: 'A second service booked with a main service has no minimum (rate × quantity)', run: () => first(eq(estimate('Makati', 'floor cleaning', 30, 'residential', true).estimate, 3750, 'floor with a main service'), eq(resolveReviewItems({ services: [svc] }, [], [solar(10)], undefined, true)[0].qty, 10, 'final quote line'), eq(resolveReviewItems({ services: [svc] }, [], [solar(10)], undefined, false)[0].qty, 20, 'alone')) },
  { name: 'A full date offers the nearest open dates, never an invented one', run: () => { const r = checkAvailability('2026-11-21', today, DEFAULT_RULES, facts([job('2026-11-21', 'a'), job('2026-11-21', 'b')])); return first(eq(r.status, 'full', 'status'), eq(r.alternatives.length > 0, true, 'alternatives'), eq(r.alternatives.some((a) => a.date === '2026-11-21'), false, 'full day offered again')); } },
  { name: 'Sunday is closed and too-soon dates are refused', run: () => first(eq(checkAvailability('2026-11-22', today, DEFAULT_RULES, facts()).status, 'closed', 'Sunday'), eq(checkAvailability('2026-11-17', today, DEFAULT_RULES, facts()).status, 'too_soon', 'tomorrow')) },
  { name: 'A date that looks open is never confirmed by the chat text alone', run: () => has(checkAvailability('2026-11-21', today, DEFAULT_RULES, facts()).reply_en, /confirm/, 'a person confirms') },
  { name: 'The booked message names the date and reference, never a price, and says the final price follows', run: () => { const b = bookedReply('Sat, 21 Nov', 'JOB-1'); return first(lacks(b.reply_en, /₱|\d,\d{3}/, 'price'), has(b.reply_en, /final price/, 'final price'), has(b.reply_tglish, /Your booking is set for/, 'every language')); } },
  { name: 'Taglish customers get the same dates and figures (the tools answer in English; the AI adds the polite "po")', run: () => { const r = checkAvailability('2026-11-21', today, DEFAULT_RULES, facts([job('2026-11-21', 'a'), job('2026-11-21', 'b')])); return first(has(pick(r, 'taglish'), /po/, 'po'), ...r.alternatives.map((a) => has(pick(r, 'taglish'), new RegExp(a.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), a.label))); } },
];
export function runRulebookTests(): TestResult[] { return CASES.map((c) => { try { const m = c.run(); return { name: c.name, ok: !m, detail: m ?? 'passed' }; } catch (e) { return { name: c.name, ok: false, detail: `error: ${(e as Error).message}` }; } }); }
