import { describe, expect, it } from 'vitest';
import { isPhotoMessage as photoA, PHOTO_THANKS, tooTagalog, ONSITE_COUNT, fallbackFor, honorificFor, BOOKING_HOWTO, BOOKING_FORM, BOOKING_SEND_FORM, wantsToBook, WELCOME_TEXT, composeFirst, splitMessages, flattenMessages, buildSystem, decide, guardReply, parseMode, runBrain, type ModelOut, type ToolOutcome } from '../../supabase/functions/_shared/brain';

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
    expect(d.kind).toBe('handover'); if (d.kind === 'handover') { expect(d.reason).toMatch(/safety check/); expect(d.text).toMatch(/refer this to our team po/); }
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
    const s = buildSystem({ sections: [], version: null, lang: 'en' }); expect(s).toMatch(/SEPARATE MESSAGES/); expect(s).toMatch(/Name:(\\n|\n)Address:(\\n|\n)Contact Number:(\\n|\n)Email:(\\n|\n)No\. of House Storey:(\\n|\n)Reservation Date:(\\n|\n)Service Window, Wall, Roof, Solar, Floor\?/); expect(s).not.toMatch(/Full name:/); expect(s).toMatch(/Never ask for the number of glass panels, solar panels or square metres/);
  });
});

describe('how to book', () => {
  it('recognises a customer who wants to book; with the city known the form is sent at once, without it only the city is asked', () => {
    for (const q of ['how do i book?', 'Gusto ko po mag-book', 'pwede po bang magpa-schedule', 'I want to reserve Saturday', 'can I set an appointment?']) expect(wantsToBook(q)).toBe(true);
    expect(wantsToBook('Magkano po sa Pasig?')).toBe(false);
    expect(splitMessages(BOOKING_HOWTO)).toHaveLength(1); expect(BOOKING_HOWTO).toMatch(/your location \(city\) po/); expect(BOOKING_HOWTO).not.toMatch(/Name:|Reservation Date/);
    expect(splitMessages(BOOKING_SEND_FORM)).toHaveLength(2); expect(splitMessages(BOOKING_SEND_FORM)[1]).toBe(BOOKING_FORM);
    expect(BOOKING_FORM).toBe('Please copy this and fill in your details po:\nName:\nAddress:\nContact Number:\nEmail:\nNo. of House Storey:\nReservation Date:\nService Window, Wall, Roof, Solar, Floor?');
    const s = buildSystem({ sections: [], version: null, lang: 'en' }); expect(s).toMatch(/if the LOCATION \(city\) is already known[^.]*send the booking-details form right away/); expect(s).toMatch(/If the location is not known yet, ask only for the location/);
  });
});

import { bookedReply, normalizeRules } from '../../supabase/functions/chat-availability/logic';
describe('Job Order sent later', () => {
  it('default is 10 minutes, kept in range, and the booking reply says it will follow', () => {
    expect(normalizeRules({}).job_order_delay_min).toBe(10); expect(normalizeRules({ job_order_delay_min: 0 }).job_order_delay_min).toBe(0); expect(normalizeRules({ job_order_delay_min: 9999 }).job_order_delay_min).toBe(240);
    expect(bookedReply('Sat, Nov 21', 'JOB-1', undefined, true).reply_en).toMatch(/Job Order confirmation will follow in a few minutes/); expect(bookedReply('Sat, Nov 21', 'JOB-1', 'https://x/#/jo/abc').reply_en).toContain('https://x/#/jo/abc');
  });
});

describe('Sir or Ma’am', () => {
  it('uses the gender the chat platform gives, never a guess from the name; the welcome follows', () => {
    expect(honorificFor('male')).toBe('Sir'); expect(honorificFor('Female')).toBe('Ma’am'); expect(honorificFor('')).toBe('Ma’am/Sir'); expect(honorificFor(undefined)).toBe('Ma’am/Sir'); expect(honorificFor('f')).toBe('Ma’am'); expect(honorificFor('other')).toBe('Ma’am/Sir');
    expect(composeFirst('NO_ANSWER', 'Sir')).toContain('Hello po, Sir! Good day.'); expect(composeFirst('NO_ANSWER', 'Sir')).toContain('May we know your location po, Sir?'); expect(composeFirst('NO_ANSWER')).toBe(WELCOME_TEXT);
    const s = buildSystem({ sections: [], version: null, lang: 'en', honorific: 'Ma’am' }); expect(s).toContain('The customer is a woman: when a title fits, use "Ma’am"'); const u = buildSystem({ sections: [], version: null, lang: 'en' }); expect(u).toMatch(/unmistakable/); expect(u).toMatch(/Never write "Ma’am\/Sir" yourself/); expect(u).toMatch(/never at the start of every message/);
  });
});

describe('no repeated services list', () => {
  it('the welcome already lists the services, so the first reply never lists them again', () => {
    const f = buildSystem({ sections: [], version: null, lang: 'en', firstMessage: true }); expect(f).toMatch(/never list the services again/); expect(f).toMatch(/only asks what services we offer, write exactly NO_ANSWER/);
  });
});

describe('a booking already made is never contradicted', () => {
  it('the prompt tells the AI the customer already has a confirmed booking', () => {
    const s = buildSystem({ sections: [], version: null, lang: 'en', booking: { number: 'JOB-2026-8296', date: '2026-11-20', status: 'Confirmed' } });
    expect(s).toContain('ALREADY HAS a confirmed booking, JOB-2026-8296, for 2026-11-20'); expect(s).toMatch(/never say it is full/); expect(buildSystem({ sections: [], version: null, lang: 'en' })).not.toMatch(/EXISTING BOOKING/);
  });
});

describe('language: English with po, or Taglish, never pure Tagalog', () => {
  it('the prompt and the fallback follow that rule', () => {
    for (const lang of ['en', 'tl', 'taglish']) { const s = buildSystem({ sections: [], version: null, lang }); expect(s).toMatch(/English or Taglish only, never pure Tagalog/); expect(s).toMatch(/English-dominant/); expect(s).toMatch(/English with a polite "po"/); expect(s).not.toMatch(/Filipino with "po"/); }
    expect(fallbackFor('tl')).toBe(fallbackFor('taglish')); expect(fallbackFor('tl')).not.toBe(fallbackFor('en'));
  });
});

import { estimate } from '../../supabase/functions/_shared/estimate';
describe('no photos', () => {
  it('accepts photos the customer offers and never says they are not needed', () => {
    const s = buildSystem({ sections: [], version: null, lang: 'en' }); expect(s).toMatch(/Sure po, you may send them\. Our technical team will review them\./); expect(s).toMatch(/never say photos are not needed/);
  });
  it('the AI never asks for photos, and the price tool texts do not either', () => {
    const s = buildSystem({ sections: [], version: null, lang: 'en' }); expect(s).toMatch(/NO PHOTOS \(but always accept them\): never ask the customer for photos/); expect(s).not.toMatch(/suggest photos|send photos of their windows/);
    for (const e of [estimate('Makati', 'gutter cleaning', 10), estimate('Makati', 'window cleaning', 10, 'commercial'), estimate('Atlantis', 'window cleaning', 10)]) expect(`${e.rates_en} ${e.rates_tl} ${e.rates_tglish}`).not.toMatch(/photo|litrato/i);
  });
});

describe('short replies', () => {
  it('the AI is told to keep replies short, and a long reply is flagged', () => {
    const s = buildSystem({ sections: [], version: null, lang: 'en' }); expect(s).toMatch(/SHORT REPLIES/); expect(s).toMatch(/one to three short sentences/); expect(s).toMatch(/Do not over-explain/);
    expect(guardReply('x'.repeat(900), { amounts: [], booked: false }).violations).toContain('is too long for a chat'); expect(guardReply('Sure po! Window cleaning in Makati starts at ₱4,799 for up to 31 panels.', { amounts: [4799], booked: false }).ok).toBe(true);
  });
});

describe('never ask for quantities', () => {
  it('the AI does not ask how many panels or how much area, and says the team counts and measures on site', () => {
    const s = buildSystem({ sections: [], version: null, lang: 'en' }); expect(s).toMatch(/NEVER ASK QUANTITIES/); expect(s).toContain(ONSITE_COUNT);
    expect(ONSITE_COUNT).toBe('Our team will conduct on-site glass and solar panel counting and wall and floor area measurement before they begin the cleaning session.'); expect(s).not.toMatch(/ask roughly how many glass PANELS/);
  });
});

describe('house language: English with po or light Taglish', () => {
  it('flags Tagalog sentences, accepts English and light Taglish', () => {
    expect(tooTagalog('Hi po! Para ma-check ko ang tamang presyo, anong klaseng cleaning po ang kailangan ninyo (window, solar, wall/floor, or roof) at saan po ang location (city)?')).toBe(true);
    expect(tooTagalog('Hi po! May I know the type of service you need (Window, Solar, Wall/floor or Roof) and your location po?')).toBe(false);
    expect(tooTagalog('Sure po, ₱4,799 po ang estimate for 21 panels in Quezon City. Our team will count on site.')).toBe(false);
  });
  it('rewrites a Tagalog draft once in English', async () => {
    let calls = 0;
    const b = await runBrain({ mode: 'suggest', system: 's', messages: [{ role: 'user', content: 'hi' }], exec: async () => ({ text: '' }), callModel: async () => { calls++; return { stop_reason: 'end_turn', content: [{ type: 'text', text: calls === 1 ? 'Para ma-check ko ang tamang presyo, anong klaseng cleaning po ang kailangan ninyo at saan po ang location?' : 'May I know the type of service you need and your location po?' }] }; } } as never);
    expect(b.reply).toMatch(/^May I know/); expect(calls).toBe(2);
  });
});

describe('photos from the customer', () => {
  const urls = ['https://scontent.xx.fbcdn.net/v/t1.15752-9/123_n.jpg?x=1', 'https://cdn.fbsbx.com/v/abc', 'https://example.com/pic.PNG', 'https://x.manychat.com/file/1', '[The customer sent a photo or attachment]'];
  const not = ['Magkano po?', 'https://topmop.ph', 'see https://x.com/a.jpg please', ''];
  it('recognises a photo message and agrees with the app copy of the test', async () => {
    const { isPhotoMessage: photoB } = await import('./photomsg');
    for (const u of urls) { expect(photoA(u)).toBe(true); expect(photoB(u)).toBe(true); }
    for (const u of not) { expect(photoA(u)).toBe(false); expect(photoB(u)).toBe(false); }
    expect(PHOTO_THANKS).toMatch(/technical team will review/);
  });
});
