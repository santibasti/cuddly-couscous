import { describe, expect, it } from 'vitest';
import { TOOLS, PAYMENT_POLICY, NO_TRANSPORT_FEE, cleanPhone, contactSince, olderThanAi, mobileFrom, returningByTag, returningBlock, COMMERCIAL_OCULAR, OCULAR_FEE, NO_OCULAR, isPhotoMessage as photoA, PHOTO_THANKS, tooTagalog, fallbackFor, honorificFor, wantsToBook, WELCOME_TEXT, composeFirst, splitMessages, flattenMessages, buildSystem, decide, guardReply, parseMode, runBrain, type ModelOut, type ToolOutcome } from '../../supabase/functions/_shared/brain';

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
    expect(WELCOME_TEXT).toMatch(/^Hello po, good day!/); for (const t of ['windows and glass', 'walls', 'roofs', 'solar panels', 'May we know your location po?']) expect(WELCOME_TEXT).toContain(t);
    expect(WELCOME_TEXT).not.toMatch(/Ma’am|Sir/); expect(WELCOME_TEXT.length).toBeLessThan(200);   // short: the long descriptions are gone
    expect(composeFirst('NO_ANSWER')).toBe(WELCOME_TEXT); expect(composeFirst('')).toBe(WELCOME_TEXT); expect(composeFirst('For 21 panels the package is ₱4,799 po.')).toBe(WELCOME_TEXT + '\n\n---\n\nFor 21 panels the package is ₱4,799 po.'); expect(splitMessages(composeFirst('Answer po.'))).toEqual([WELCOME_TEXT, 'Answer po.']);
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



describe('separate messages', () => {
  it('a line with only --- starts the next chat message (max 5); flatten keeps one text for tools that cannot split', () => {
    const t = 'Good news po, Saturday, Nov 21 is open.\n\n---\n\nTo send your booking request, please copy this and fill in your details po:\nFull name:\nMobile number:';
    expect(splitMessages(t)).toEqual(['Good news po, Saturday, Nov 21 is open.', 'To send your booking request, please copy this and fill in your details po:\nFull name:\nMobile number:']);
    expect(flattenMessages(t)).not.toContain('---'); expect(splitMessages('a\n---\nb\n---\nc\n---\nd\n---\ne\n---\nf')).toHaveLength(5); expect(splitMessages('no split here')).toEqual(['no split here']);
  });
});


import { bookedReply, normalizeRules } from '../../supabase/functions/chat-availability/logic';
describe('Job Order sent later', () => {
  it('default is 10 minutes, kept in range, and the booking reply says it will follow', () => {
    expect(normalizeRules({}).job_order_delay_min).toBe(10); expect(normalizeRules({ job_order_delay_min: 0 }).job_order_delay_min).toBe(0); expect(normalizeRules({ job_order_delay_min: 9999 }).job_order_delay_min).toBe(240);
    expect(bookedReply('Sat, Nov 21', 'JOB-1', undefined, true).reply_en).toMatch(/Job Order confirmation will follow in a few minutes/); expect(bookedReply('Sat, Nov 21', 'JOB-1', 'https://x/#/jo/abc').reply_en).toContain('https://x/#/jo/abc');
  });
});





import { estimate } from '../../supabase/functions/_shared/estimate';



describe('house language: English with po or light Taglish', () => {
  it('flags Tagalog sentences, accepts English and light Taglish', () => {
    expect(tooTagalog('Hi po! Para ma-check ko ang tamang presyo, anong klaseng cleaning po ang kailangan ninyo (window, solar, wall/floor, or roof) at saan po ang location (city)?')).toBe(true);
    expect(tooTagalog('Hi po! May I know the type of service you need (Window, Solar, Wall/floor or Roof) and your location po?')).toBe(false);
    expect(tooTagalog('Sure po, ₱4,799 po ang estimate for 21 panels in Quezon City. Our team will count on site.')).toBe(false);
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




describe('returning customers', () => {
  it('finds a Philippine mobile number in different shapes', () => {
    expect(mobileFrom('', 'my number is 0917 123 4567 po')).toBe('09171234567'); expect(mobileFrom('+63 917-123-4567')).toBe('09171234567'); expect(mobileFrom('639171234567')).toBe('09171234567'); expect(mobileFrom('9171234567')).toBe('09171234567');
    expect(mobileFrom('Magkano po sa Makati? 21 panels')).toBeUndefined(); expect(mobileFrom(null, undefined)).toBeUndefined();
  });
  it('reads a ManyChat tag that marks an existing customer, not a new lead', () => {
    expect(returningByTag([{ name: 'Existing customer' }])).toBe('Existing customer'); expect(returningByTag(['Returning'])).toBe('Returning'); expect(returningByTag([{ name: 'New lead' }])).toBeUndefined(); expect(returningByTag(undefined)).toBeUndefined();
  });
  it('tells the AI the customer is not new, skips the welcome and does not ask for details on file', () => {
    const info = { note: 'Matched existing client Maria Santos by mobile number', client: { name: 'Maria Santos', mobile: '09171234567', address: 'Quezon City' }, jobs: ['JOB-2026-0100 (Completed, 2026-09-01)'] };
    expect(returningBlock(info)).toMatch(/NOT a new inquiry/); expect(returningBlock(info)).toContain('Maria Santos'); expect(returningBlock(info)).toContain('JOB-2026-0100');
    const s = buildSystem({ sections: [], version: null, lang: 'en', returning: info }); expect(s).toMatch(/RETURNING CUSTOMER/); expect(s).toMatch(/Welcome back po/); expect(s).toMatch(/Do not ask again for details we already have/);
    expect(buildSystem({ sections: [], version: null, lang: 'en' })).not.toMatch(/RETURNING CUSTOMER/);
  });
});

describe('contacts from before the AI chat', () => {
  it('reads the first-contact date from ManyChat fields in several shapes', () => {
    expect(contactSince({ subscribed: '2025-03-04T10:00:00Z' })?.slice(0, 10)).toBe('2025-03-04'); expect(contactSince({ subscribed: 1741082400 })?.slice(0, 10)).toBe('2025-03-04'); expect(contactSince({ created_at: '2025-06-01' }, { subscribed: '2025-03-04' })?.slice(0, 10)).toBe('2025-03-04');
    expect(contactSince({ name: 'x' }, null, undefined)).toBeUndefined();
  });
  it('treats a contact from before the AI started as returning, with a day of grace', () => {
    expect(olderThanAi('2025-03-04T00:00:00Z', '2026-11-10T00:00:00Z')).toBe(true); expect(olderThanAi('2026-11-10T05:00:00Z', '2026-11-10T00:00:00Z')).toBe(false); expect(olderThanAi('2026-11-09T12:00:00Z', '2026-11-10T00:00:00Z')).toBe(false); expect(olderThanAi(undefined, '2026-11-10')).toBe(false);
  });
});

describe('V2 prompt: fifteen rules, known facts, no forced sentences', () => {
  const sys = (extra: Record<string, unknown> = {}) => buildSystem({ sections: [{ key: 'a', title: 'Identity', body: 'You are TopMop.' }], version: 3, lang: 'en', ...extra } as never);
  it('carries the rulebook, its version and every non-negotiable rule', () => {
    const s = sys(); expect(s).toMatch(/RULEBOOK \(version 3\)/); expect(s).toContain('You are TopMop.');
    for (const r of [/English or English-dominant Taglish only/, /at most TWO short sentences, preferably under 35 words/, /ask at most one question/, /never ask for photos or videos/, /never ask for the number of panels or square metres/, /never mention cleaning services the customer did not ask about, and never upsell/, /never offer or suggest booking after a price/, /not consent/, /SCHEDULING \(only when the customer clearly asks to book\): booking uses the booking-details form/, /never write or paraphrase the form yourself/, /prices only from estimate, dates only from check_date, bookings only from book_date/, /Never invent prices, capabilities, discounts/]) expect(s).toMatch(r);
  });
  it('hands over only for the real triggers, never for ordinary job details such as a gated village', () => {
    const s = sys(); expect(s).toMatch(/12\. HANDOVER: only for a request for a person, a complaint/); expect(s).toMatch(/gated village, weekday-only access, paint colour or age, rust, stains, duration\) are NOT a reason to hand over/); expect(s).not.toMatch(/If a tool fails or you are unsure, say the team will verify and use needs_human/);
    const tool = (TOOLS as { name: string; description: string }[]).find((t) => t.name === 'needs_human')!; expect(tool.description).toMatch(/ONLY for/); expect(tool.description).not.toMatch(/anything you are unsure about/); expect(tool.description).toMatch(/silences the assistant/);
  });
  it('knows the payment policy: no downpayment, payment on completion, four modes; a payment question is not a handover', () => {
    const s = sys(); expect(PAYMENT_POLICY).toBe('No downpayment is required po. Payment is made upon completion of the job, by cash, GCash, bank transfer or cheque.'); expect(s).toContain(PAYMENT_POLICY); expect(s).toMatch(/A question about downpayment or how and when to pay is NOT a handover/); expect(s).toMatch(/never give account numbers/);
    expect(s).not.toMatch(/contracts or payment terms/); expect((TOOLS as { name: string; description: string }[]).find((t) => t.name === 'needs_human')!.description).not.toMatch(/payment terms/);
  });
  it('knows there is no transportation fee, without claiming there are no other charges', () => {
    const s = sys(); expect(NO_TRANSPORT_FEE).toBe('There is no transportation fee po.'); expect(s).toContain(NO_TRANSPORT_FEE); expect(s).toMatch(/never say there are no other charges/);
  });
  it('says "Our team will confirm that po" instead of "I don\'t have the details"', () => { const s = sys(); expect(s).toContain('say "Our team will confirm that po."'); expect(s).toMatch(/Never say "I don't have" or "I'm not able to" about details/); });
  it('no longer forces the counting sentence or the upsell, and is shorter than before', () => {
    const s = sys(); expect(s).not.toMatch(/UPSELL THE CORE SERVICES/); expect(s).not.toContain('Our team will conduct on-site glass and solar panel counting'); expect(s).not.toMatch(/a yes to the starting rates/); expect(s.length - 'You are TopMop.'.length).toBeLessThan(7000);
  });
  it('injects the known facts and the intent on every request, and the approved texts', () => {
    const s = sys({ context: 'KNOWN FACTS: location: Manila; service: wall cleaning.\nCURRENT INTENT: price_inquiry.' }); expect(s).toContain('KNOWN FACTS: location: Manila'); expect(s).toContain(NO_OCULAR.split('\n')[0]); expect(s).toContain(COMMERCIAL_OCULAR);
  });
  it('first message: the system adds the welcome; later: do not greet; a booking already made is never contradicted; Sir/Ma’am only when known', () => {
    expect(sys({ firstMessage: true })).toMatch(/FIRST MESSAGE: the system itself puts TopMop's welcome/); expect(sys()).toMatch(/Do not greet again/);
    expect(sys({ booking: { number: 'JOB-1', date: '2026-11-21', status: 'Confirmed' } })).toMatch(/ALREADY HAS a confirmed booking, JOB-1/);
    expect(sys({ honorific: 'Sir' })).toMatch(/The customer is a man: use "Sir"/); expect(sys()).toMatch(/gender is not known: use no title/);
  });
  it('the check hook asks the model once to fix exactly the violations, then reports what is left', async () => {
    let calls = 0; let asked = '';
    const check = (r: string) => (/book/i.test(r) ? ['premature_booking: do not offer booking'] : []);
    const b = await runBrain({ mode: 'suggest', system: 's', messages: [{ role: 'user', content: 'How much?' }], exec: async () => ({ text: '' }), check, callModel: async (_s: string, m: unknown[]) => { calls++; asked = JSON.stringify(m); return { stop_reason: 'end_turn', content: [{ type: 'text', text: calls === 1 ? 'It is ₱6,250. Would you like to book?' : 'It is ₱6,250 po.' }] }; } } as never);
    expect(b.reply).toBe('It is ₱6,250 po.'); expect(b.violations).toEqual([]); expect(calls).toBe(2); expect(asked).toMatch(/premature_booking/);
    const c = await runBrain({ mode: 'suggest', system: 's', messages: [{ role: 'user', content: 'x' }], exec: async () => ({ text: '' }), check, callModel: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Want to book?' }] }) } as never);
    expect(c.violations?.length).toBe(1);
  });
});

describe('company phone is verified or omitted', () => {
  it('shows only a plausible number from Settings; placeholders are dropped', () => {
    expect(cleanPhone('0000')).toBeUndefined(); expect(cleanPhone('000-0000')).toBeUndefined(); expect(cleanPhone('1234567')).toBeUndefined(); expect(cleanPhone('xxx')).toBeUndefined(); expect(cleanPhone(undefined)).toBeUndefined(); expect(cleanPhone('')).toBeUndefined();
    expect(cleanPhone('+63 2 8123 4567')).toBe('+63 2 8123 4567'); expect(cleanPhone('0917 123 4567')).toBe('0917 123 4567');
    const base = { sections: [], version: null, lang: 'en' };
    expect(buildSystem({ ...base, companyPhone: '0000' })).not.toMatch(/Company phone/); expect(buildSystem({ ...base })).not.toMatch(/Company phone/); expect(buildSystem({ ...base, companyPhone: '+63 2 8123 4567' })).toContain('Company phone (give it only if the customer asks for it): +63 2 8123 4567.');
  });
});
