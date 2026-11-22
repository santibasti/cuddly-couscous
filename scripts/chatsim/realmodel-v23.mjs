// AI V2.3 real-model tests: the REAL chat-brain and chat-send code, the REAL Claude model, the real price/date logic and an in-memory database. Nothing live is touched.
// The calendar is built from the seeded jobs and the default rule "a day is full at 2 active jobs", so a customer's own booking plus one other job makes THEIR date look full: the trap of the November 30 incident.
// Needs a Claude API key.   Run:  RULEBOOK_FILE=path/to/MASTER_RULEBOOK_V2.3.md CHATSIM_REAL=1 ANTHROPIC_API_KEY=... node scripts/chatsim/realmodel-v23.mjs [model]
import fs from 'node:fs';
if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY is not set: no real-model test was run.'); process.exit(2); }
process.env.CHATSIM_REAL = '1';
const { send, reset, deliver, modelCalls, DB, queue, staff } = await import('./harness.mjs');
const { tooTagalog } = await import('./checks.mjs');
const model = process.argv[2]; const rows = [];
const RULEBOOK = process.env.RULEBOOK_FILE ? fs.readFileSync(process.env.RULEBOOK_FILE, 'utf8') : 'You are TopMop customer service for exterior cleaning (windows, walls, roofs, solar panels) in Metro Manila.';
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const inDays = (n) => { const d = new Date(Date.now() + n * 86400000 + 8 * 3600000); return { iso: d.toISOString().slice(0, 10), label: `${MON[d.getUTCMonth()]} ${d.getUTCDate()}` }; };
const D1 = inDays(8), D2 = inDays(15);
const setup = (mode = 'suggest') => { reset(mode, [{ key: 'a', title: 'TopMop rulebook V2.3', body: RULEBOOK }]); queue(false); if (model) DB.settings[0].data.chat_ai.model = model; };
const seedClient = (id, name, mobile, jobs = []) => {   // jobs made BY STAFF by hand: no quotation, no inquiry; the client record is newer than the chat
  DB.clients = [...(DB.clients ?? []), { id, name, mobile, address: 'Makati', created_at: new Date(Date.now() + 5000).toISOString() }];
  DB.sites = [...(DB.sites ?? []), { id: `s-${id}`, client_id: id, name: `${name} residence`, address: 'Makati' }];
  jobs.forEach((j, i) => { DB.jobs = [...(DB.jobs ?? []), { id: `j-${id}-${i}`, number: j.number, client_id: id, site_id: `s-${id}`, start_at: `${j.date}T09:00:00`, end_at: `${j.date}T12:00:00`, status: j.status ?? 'Confirmed', service_codes: j.codes ?? ['GLASS_EXT'] }]; });
};
const busyDay = (date) => { DB.jobs = [...(DB.jobs ?? []), { id: `other-${date}`, number: `JOB-OTHER-${date}`, client_id: 'x', site_id: 'x', start_at: `${date}T09:00:00`, end_at: `${date}T12:00:00`, status: 'Confirmed', service_codes: ['ROOF'] }]; };   // a second job: the day is now FULL for the calendar
const conv = () => DB.chat_conversations[0] ?? {};
const outs = () => DB.chat_messages.filter((m) => m.direction === 'out');
const lastFull = () => outs().at(-1)?.body ?? ''; const lastReply = () => lastFull().split('\n\n---\n\n').pop().trim();
const sentences = (t) => t.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).filter(Boolean);
const verdict = (name, reply, checks) => { const f = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k); rows.push({ name, fail: f }); console.log(`${f.length ? 'FAIL' : 'PASS'}  ${name}\n      reply: ${JSON.stringify(String(reply).slice(0, 260))}${f.length ? `\n      failed: ${f.join(', ')}` : ''}`); };
const NOT_FULL = (t) => !/fully booked|is full|not available|unavailable|too soon|nearest (open )?dates|no slots/i.test(t); const NO_FORM = (t) => !/Reservation Date:|Please copy this and fill/i.test(t);
const NO_LEAK = (t) => !/JOB-\d{4}-\d{3,5}/.test(t);
const confirmByStaff = async (clientId) => { await staff({ action: 'link', conversation_id: conv().id, client_id: clientId }); await staff({ action: 'release', conversation_id: conv().id }); deliver(); };   // staff: "This is the client", then hand back to the AI
const say = async (t, extra = {}) => { await send(t, extra); deliver(); };
const base = (r) => ({ english: !tooTagalog(r), short: sentences(r).length <= 3 && r.split(/\s+/).length <= 60 });

// N: a brand-new customer
setup(); await say('Hi, how much is window cleaning in Makati?'); let r = lastReply();
verdict('N: a brand-new customer gets the standard welcome and a normal answer', r, { welcome: /TopMop offers professional exterior cleaning/.test(lastFull()), status_new: !conv().contact_status || conv().contact_status === 'new' });
// P: a previous contact (talked to us before the AI): no welcome, no menu, no invented history
setup(); DB.settings[0].data.chat_ai.ai_started_on = '2026-11-17T00:00:00Z'; await say('Hello po, how much for window cleaning in Makati?', { subscribed: '2026-05-02T08:00:00Z' }); r = lastReply();
verdict('P: a previous contact: no welcome, no service menu, not an existing client, no invented history', r, { no_welcome: !/TopMop offers professional exterior cleaning/.test(lastFull()), previous: conv().contact_status === 'previous', not_existing: !conv().client_id, no_history: !/last time|your previous (job|booking|service)/i.test(r), ...base(r) });

// I: THE NOVEMBER 30 INCIDENT. A booking made by staff by hand; the day is full on the calendar BECAUSE of it; the client record is newer than the chat; the ManyChat phone matches the client.
setup(); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); busyDay(D1.iso);
await say(`Hi po, are we still scheduled for ${D1.label}?`, { phone: '+63 917 555 1212' }); r = lastReply();
verdict('I-1: the phone only SUGGESTS the client: the customer is not told the date is full, gets no form and sees no booking detail; a person is asked to confirm', r, { not_full: NOT_FULL(r), no_form: NO_FORM(r), no_leak: NO_LEAK(r) && !new RegExp(D1.label).test(r), suggested_not_linked: conv().link_state === 'suggested' && !conv().client_id, handed_to_staff: conv().status === 'Needs a person' });
await confirmByStaff('c1'); await say(`Hi po, are we still scheduled for ${D1.label}?`, { phone: '+63 917 555 1212' }); r = lastReply();
verdict('I-2: after staff confirm, the real model answers from THEIR booking: never "full" (the calendar IS full), no form, no other dates, no welcome', r, { confirmed: conv().contact_status === 'existing' && conv().link_state === 'staff', cites_booking: /JOB-2026-8818/.test(r) || new RegExp(D1.label.split(' ')[1]).test(r) || /scheduled|booking/i.test(r), not_full: NOT_FULL(r), no_form: NO_FORM(r), no_welcome: !/TopMop offers professional/.test(lastFull()), ...base(r) });
const claimedFull = rows.at(-1).fail.includes('not_full'); if (claimedFull) console.log('      NOTE: the model said the date was full: this must never reach a customer');

// H: a reminder about a high ceiling from a confirmed client
setup(); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); busyDay(D1.iso); await say('Hello po', { phone: '0917 555 1212' }); await confirmByStaff('c1');
await say(`Reminder lang po, mataas po ang ceiling namin. We are scheduled ${D1.label}.`, { phone: '0917 555 1212' }); r = lastReply();
verdict('H: a high-ceiling reminder from a confirmed client is thanked and noted: no form, no welcome, no location question, no calendar', r, { no_form: NO_FORM(r), no_welcome: !/TopMop offers professional/.test(lastFull()), not_full: NOT_FULL(r), no_location_ask: !/location|city|where/i.test(r), alerted: (DB.alert_outbox ?? []).some((a) => a.title === 'Customer message about their booking'), ...base(r) });
// M: several bookings: the asked date picks the right job
setup(); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }, { number: 'JOB-2026-8820', date: D2.iso, status: 'Pending', codes: ['ROOF'] }]); busyDay(D2.iso); await say('Hello po', { phone: '0917 555 1212' }); await confirmByStaff('c1');
await say(`Is my roof job on ${D2.label} still on?`, { phone: '0917 555 1212' }); r = lastReply();
verdict('M: several bookings: the asked date is answered from the right job, never "full", no form', r, { right_job: /JOB-2026-8820/.test(r) || new RegExp(D2.label.split(' ')[1]).test(r) || /roof/i.test(r), not_full: NOT_FULL(r), no_form: NO_FORM(r), ...base(r) });
// S: a job in a dispatch status (Dispatched / On Site): current, not unknown
setup(); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8830', date: inDays(0).iso, status: 'Dispatched' }]); await say('Hello po', { phone: '0917 555 1212' }); await confirmByStaff('c1');
await say('Is the crew on the way today?', { phone: '0917 555 1212' }); r = lastReply();
verdict('S: a job in status Dispatched is a current booking: answered from the record in plain words, the internal status name is never shown, no form', r, { knows_job: /on the way|dispatched|today|crew|booking|JOB-2026-8830/i.test(r), plain_words: !/Dispatch Checklist Pending|Dispatched\b/.test(r), no_form: NO_FORM(r), not_full: NOT_FULL(r), ...base(r) });
// D: identical names on two clients: only the confirmed client's job is used
setup(); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); seedClient('c2', 'Maria Cruz', '0918 777 3434', [{ number: 'JOB-2026-9001', date: D2.iso }]); await say('Hello po', { phone: '0918 777 3434' }); await confirmByStaff('c2');
await say(`Are we scheduled on ${D2.label}?`, { phone: '0918 777 3434' }); r = lastReply();
verdict('D: two clients with the same name: only the confirmed client\'s booking is used (never the other Maria Cruz)', r, { only_her_job: !/JOB-2026-8818/.test(r) && !new RegExp(D1.label).test(r), cites_her_booking: /JOB-2026-9001/.test(r) || new RegExp(D2.label.split(' ')[1]).test(r) || /scheduled|booking/i.test(r), not_full: NOT_FULL(r), no_form: NO_FORM(r) });
// U: an UNCONFIRMED contact (the phone matches a client who holds a booking) asks a date question that is not an obvious "previous booking" phrase: the date tool must not call it full
setup(); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); busyDay(D1.iso);
await say(`Is ${D1.label} open for window cleaning in Makati?`, { phone: '0917 555 1212' }); r = lastReply();
verdict('U: an unconfirmed contact whose possible client already holds that date: never told "full" or offered other dates, no booking detail leaks, staff take over', r, { not_full: NOT_FULL(r), no_form: NO_FORM(r), no_leak: NO_LEAK(r), unverified: !conv().client_id });
// B: an unconfirmed contact asks to BOOK the date their possible client already holds
setup(); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); busyDay(D1.iso);
await say(`I want to book window cleaning on ${D1.label}`, { phone: '0917 555 1212' }); r = lastReply();
verdict('B: an unconfirmed contact (possible client with a booking) asks to book: NO booking form, no calendar answer, staff are asked to confirm first', r, { no_form: NO_FORM(r), not_full: NOT_FULL(r), no_leak: NO_LEAK(r), handed_to_staff: conv().status === 'Needs a person' });
// A: no phone: a name never links; ask once; then a typed number is only a suggestion
setup(); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); busyDay(D1.iso);
await say(`Hi, we are scheduled ${D1.label} po. Maria Cruz here.`); r = lastReply(); const asked = r;
verdict('A-1: no phone number, only a name: not linked; asked once for the mobile or job order number; no form, no calendar, no details', asked, { not_linked: !conv().client_id && conv().contact_status !== 'existing', asks_reference: /mobile number or job order number/i.test(asked), no_form: NO_FORM(asked), not_full: NOT_FULL(asked), no_leak: NO_LEAK(asked) });
await say('My number is 0917 555 1212'); r = lastReply();
verdict('A-2: a number typed in the chat is only a suggestion: not linked, a person takes over, no booking detail shown', r, { suggested_not_linked: conv().link_state === 'suggested' && !conv().client_id, handed_to_staff: conv().status === 'Needs a person', no_leak: NO_LEAK(outs().map((m) => m.body).join(' ')) });
// W: a ManyChat contact with only a tag or old date is a previous contact; "we talked yesterday" is never a new inquiry
setup(); await say('We talked yesterday with your staff, follow-up lang po.'); r = lastReply();
verdict('W: "we talked yesterday, follow-up lang po" from an unverified contact: not a new inquiry (no welcome, no location question, no form); asks once for the mobile or job order number', r, { no_welcome: !/TopMop offers professional/.test(lastFull()), no_form: NO_FORM(r), no_location_ask: !/location|city/i.test(r), asks_reference: /mobile number or job order number/i.test(r), marked_previous: conv().contact_status === 'previous' });

const failed = rows.filter((x) => x.fail.length); console.log(`\n${rows.length - failed.length}/${rows.length} passed (model: ${model || 'default claude-haiku-5-5'}; model calls made: ${modelCalls.length}; database: in memory, NOT staging)`); process.exit(failed.length ? 1 : 0);
