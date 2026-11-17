import { describe, expect, it } from 'vitest';
import { WELCOME_TEXT, composeFirst, splitMessages, flattenMessages, buildSystem, decide, guardReply, parseMode, runBrain, type ModelOut, type ToolOutcome } from '../../supabase/functions/_shared/brain';

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

describe('welcome message', () => {
  it('the first reply starts with the TopMop welcome (all four services), then the answer; NO_ANSWER gives the welcome alone', () => {
    expect(WELCOME_TEXT).toMatch(/^Hello po, Ma’am\/Sir! Good day\./); for (const t of ['Glass/Window Cleaning', 'Wall Cleaning', 'Roof Cleaning', 'Solar Panel Cleaning', 'May we know your location po, Ma’am/Sir?']) expect(WELCOME_TEXT).toContain(t);
    expect(composeFirst('NO_ANSWER')).toBe(WELCOME_TEXT); expect(composeFirst('')).toBe(WELCOME_TEXT); expect(composeFirst('For 21 panels the package is ₱4,799 po.')).toBe(WELCOME_TEXT + '\n\n---\n\nFor 21 panels the package is ₱4,799 po.'); expect(splitMessages(composeFirst('Answer po.'))).toEqual([WELCOME_TEXT, 'Answer po.']);
  });
  it('the system prompt tells the AI not to greet when the welcome is added, and never to introduce itself as an AI', () => {
    const f = buildSystem({ sections: [], version: null, lang: 'en', firstMessage: true }); expect(f).toMatch(/FIRST MESSAGE/); expect(f).toMatch(/NO_ANSWER/); expect(f).not.toMatch(/AI customer service/);
    expect(buildSystem({ sections: [], version: null, lang: 'en' })).toMatch(/Do not greet again/);
  });
});

describe('a reply is never empty after tools', () => {
  const tool = (name: string, input: unknown) => ({ content: [{ type: 'tool_use', id: 't' + Math.random(), name, input: input as Record<string, unknown> }], stop_reason: 'tool_use' });
  it('asks once for the words, and falls back to the system sentence', async () => {
    let calls = 0; const exec = async () => ({ text: 'Nov 18 is too soon for us to schedule. The nearest open dates are Nov 19, Nov 20 and Nov 21 po.', amounts: [] });
    const b1 = await runBrain({ mode: 'suggest', system: 's', messages: [{ role: 'user', content: 'Nov 18' }], maxRounds: 3, exec, callModel: async (_s, _m, tools) => { calls++; return (tools as unknown[]).length ? tool('check_date', { when: 'Nov 18' }) : { content: [{ type: 'text', text: 'Sorry po, Nov 18 is too soon. May I offer Nov 19, 20 or 21?' }], stop_reason: 'end_turn' }; } });
    expect(b1.reply).toMatch(/too soon/); expect(calls).toBe(4);
    const b2 = await runBrain({ mode: 'suggest', system: 's', messages: [{ role: 'user', content: 'Nov 18' }], maxRounds: 3, exec, callModel: async (_s, _m, tools) => (tools as unknown[]).length ? tool('check_date', { when: 'Nov 18' }) : { content: [], stop_reason: 'end_turn' } });
    expect(b2.reply).toMatch(/nearest open dates/);
  });
});

describe('no blank drafts', () => {
  it('an empty model answer becomes a safe holding sentence with a note for staff', async () => {
    const b = await runBrain({ mode: 'suggest', system: 's', messages: [{ role: 'user', content: 'Pasig, home' }], exec: async () => ({ text: '', amounts: [] }), callModel: async () => ({ content: [], stop_reason: 'end_turn' }) });
    expect(b.reply).toBe(''); expect(b.note).toMatch(/no text|empty answer/);
    const d = decide('suggest', b, 'en'); expect(d.kind).toBe('draft'); expect(d.text.length).toBeGreaterThan(10);
  });
});

describe('panel counting rule', () => {
  it('teaches the billable-panel rule: 2 m x 1 m per side, both sides double, larger = 2 per side', () => {
    const s = buildSystem({ sections: [], version: null, lang: 'en' });
    expect(s).toMatch(/up to 2 m x 1 m counts as one billable panel/); expect(s).toMatch(/inside and the outside counts as two/); expect(s).toMatch(/over 2 m x 1 m\) counts as two per side/); expect(s).toMatch(/20 standard panels cleaned on both sides = 40 billable panels/); expect(s).toMatch(/crew confirms the final count/); expect(s).toMatch(/never count per window/);
  });
});

describe('booking flow rules', () => {
  it('reads pasted answers, never re-asks, and always writes a proper reply', () => {
    const s = buildSystem({ sections: [], version: null, lang: 'en' }); expect(s).toMatch(/BOOKING FLOW/); expect(s).toMatch(/never ask again for something they already gave/); expect(s).toMatch(/Never answer with only a tool's sentence/);
  });
});

describe('separate messages', () => {
  it('a line with only --- starts the next chat message (max 5); flatten keeps one text for tools that cannot split', () => {
    const t = 'Good news po, Saturday, Nov 21 is open.\n\n---\n\nTo send your booking request, please copy this and fill in your details po:\nFull name:\nMobile number:';
    expect(splitMessages(t)).toEqual(['Good news po, Saturday, Nov 21 is open.', 'To send your booking request, please copy this and fill in your details po:\nFull name:\nMobile number:']);
    expect(flattenMessages(t)).not.toContain('---'); expect(splitMessages('a\n---\nb\n---\nc\n---\nd\n---\ne\n---\nf')).toHaveLength(5); expect(splitMessages('no split here')).toEqual(['no split here']);
  });
  it('the system prompt asks for the booking details as their own message', () => {
    const s = buildSystem({ sections: [], version: null, lang: 'en' }); expect(s).toMatch(/SEPARATE MESSAGES/); expect(s).toMatch(/Full name:/); expect(s).toMatch(/Type of Service \(Window, Solar, Wall\/floor or Roof\):/); expect(s).not.toMatch(/Number of glass panels:/); expect(s).toMatch(/Never ask for the number of glass panels in the booking details/); expect(s).toMatch(/line containing only ---/);
  });
});
