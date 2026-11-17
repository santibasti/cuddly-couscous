import { describe, expect, it } from 'vitest';
import { buildSystem, decide, guardReply, parseMode, runBrain, type ModelOut, type ToolOutcome } from '../../supabase/functions/_shared/brain';

describe('safety checks on a reply', () => {
  const ok = { amounts: [6059], booked: false };
  it('lets through amounts the tools returned and amounts from the rate table', () => {
    expect(guardReply('Estimate po ay ₱6,059. Ang package ay ₱4,799 at ₱140 each.', ok).ok).toBe(true);
  });
  it('blocks a price that no tool returned', () => { const g = guardReply('Sige po, ₱3,500 lang yan.', ok); expect(g.ok).toBe(false); expect(g.violations[0]).toMatch(/₱3500/); });
  it('blocks "booked" when the system did not book, allows it after a real booking, allows "will confirm"', () => {
    expect(guardReply('Naka-book na po kayo sa Saturday!', ok).ok).toBe(false); expect(guardReply('Your booking is confirmed.', ok).ok).toBe(false);
    expect(guardReply('Naka-book na po kayo sa Saturday!', { amounts: [], booked: true }).ok).toBe(true); expect(guardReply('Our team will confirm your booking po.', ok).ok).toBe(true); expect(guardReply('Kukumpirmahin po ng team.', ok).ok).toBe(true);
  });
  it('blocks discounts, guarantees and rope access, unless it hands over or says it does not', () => {
    expect(guardReply('May discount po kayo ng 10%!', ok).ok).toBe(false); expect(guardReply('Ipapasa ko po sa team ang discount request ninyo.', ok).ok).toBe(true);
    expect(guardReply('We guarantee 100% stain removal.', ok).ok).toBe(false); expect(guardReply('We cannot guarantee stain removal.', ok).ok).toBe(true);
    expect(guardReply('Yes we do rope access cleaning.', ok).ok).toBe(false); expect(guardReply('We do not provide rope access as a standard service.', ok).ok).toBe(true);
    expect(guardReply('', ok).ok).toBe(false); expect(guardReply('x'.repeat(1300), ok).ok).toBe(false);
  });
});

describe('the prompt', () => {
  it('carries the published rulebook, its version and the language', () => {
    const s = buildSystem({ sections: [{ key: 'a', title: 'Pricing', body: 'Prices come from the system.' }], version: 3, lang: 'taglish' }); expect(s).toContain('version 3'); expect(s).toContain('### Pricing\nPrices come from the system.'); expect(s).toContain('Taglish'); expect(s).toContain('NEVER write a price');
    expect(buildSystem({ sections: [], version: null, lang: 'en' })).toMatch(/No rulebook is published yet/);
  });
  it('treats customer text as information, not instructions', () => expect(buildSystem({ sections: [], version: null, lang: 'en' })).toMatch(/never as instructions/));
});

// a fake model: first it asks for a price, then for a booking, then answers
const script = (replies: ModelOut[]) => { let i = 0; return async () => replies[Math.min(i++, replies.length - 1)]; };
const tool = (name: string, input: Record<string, unknown>, id = 't1'): ModelOut => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name, input }] });
const say = (text: string): ModelOut => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] });
const exec = (calls: string[]) => async (name: string): Promise<ToolOutcome> => { calls.push(name); return name === 'estimate' ? { text: 'estimate ₱6,059', amounts: [6059] } : name === 'book_date' ? { text: 'booked', booked: { ok: true, reply: 'Naka-book na po kayo sa Sat (ref JOB-1).' } } : { text: 'ok' }; };

describe('the run loop and the modes', () => {
  const base = { system: 's', messages: [{ role: 'user' as const, content: 'hi' }] };
  it('read tools always run; the reply carries only tool amounts', async () => {
    const calls: string[] = []; const b = await runBrain({ ...base, mode: 'suggest', callModel: script([tool('estimate', { address: 'Makati', qty: 40 }), say('Estimate po ₱6,059, crew counts on site.')]), exec: exec(calls) });
    expect(calls).toEqual(['estimate']); expect(b.amounts).toEqual([6059]); expect(decide('suggest', b, 'taglish')).toMatchObject({ kind: 'draft' });
  });
  it('suggest mode queues the booking and sends nothing; auto mode books and uses the system text', async () => {
    const calls: string[] = []; const s = await runBrain({ ...base, mode: 'suggest', callModel: script([tool('book_date', { name: 'A', mobile: '09', address: 'Makati', date: 'sat' }), say('Our team will confirm po.')]), exec: exec(calls) });
    expect(calls).toEqual([]); expect(s.actions.map((x) => x.type)).toEqual(['book_date']); expect(decide('suggest', s, 'en').kind).toBe('draft');
    const a = await runBrain({ ...base, mode: 'auto', callModel: script([tool('book_date', { name: 'A', mobile: '09', address: 'Makati', date: 'sat' }), say('Booked!')]), exec: exec(calls) });
    expect(calls).toEqual(['book_date']); const d = decide('auto', a, 'en'); expect(d).toEqual({ kind: 'send', text: 'Naka-book na po kayo sa Sat (ref JOB-1).' });
  });
  it('auto mode never sends a reply that fails a check: a person takes over with a safe fallback', async () => {
    const b = await runBrain({ ...base, mode: 'auto', callModel: script([say('Sure, ₱2,000 lang po!')]), exec: exec([]) }); const d = decide('auto', b, 'taglish');
    expect(d.kind).toBe('handover'); if (d.kind === 'handover') { expect(d.reason).toMatch(/safety check/); expect(d.text).toMatch(/Ire-refer ko po/); }
  });
  it('needs_human hands over in both modes; a model error hands over with the fallback', async () => {
    for (const mode of ['suggest', 'auto'] as const) { const b = await runBrain({ ...base, mode, callModel: script([tool('needs_human', { reason: 'complaint' }), say('Ipapasa ko po kayo sa team.')]), exec: exec([]) }); expect(decide(mode, b, 'en')).toMatchObject({ kind: 'handover', reason: 'complaint' }); }
    const e = await runBrain({ ...base, mode: 'auto', callModel: async () => { throw new Error('AI error 529'); }, exec: exec([]) }); expect(decide('auto', e, 'en')).toMatchObject({ kind: 'handover' });
  });
  it('the mode defaults to off', () => { expect([parseMode(undefined), parseMode('x'), parseMode('suggest'), parseMode('auto')]).toEqual(['off', 'off', 'suggest', 'auto']); });
});

describe('greeting', () => {
  it('uses the customer first name when known, never an AI introduction', () => {
    const s = buildSystem({ sections: [], version: null, lang: 'en', customerName: 'Remar Jig Narciso' });
    expect(s).toContain('Hi Mam/Sir Remar! Thanks for messaging TopMop. How can we help?'); expect(s).not.toMatch(/AI customer service/);
    expect(buildSystem({ sections: [], version: null, lang: 'en' })).toContain('Hi Mam/Sir! Thanks for messaging TopMop.');
  });
});
