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
// R: REGRESSION: an older booking intent must never override a new existing-booking inquiry
setup(); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); busyDay(D1.iso);
await say('Can I schedule tomorrow?'); await say('Makati'); const stale = conv().context?.booking_requested === true;
await say(`Actually we are scheduled ${D1.label}, I already booked`, { phone: '0917 555 1212' }); r = lastReply();
verdict('R-1 (unconfirmed): after a new-booking flow was started, a message about an existing booking clears the old intent: no form, no service question, no calendar answer, a person is asked', r, { setup_booking_intent_was_set: stale, intent_cleared: conv().context?.booking_requested === false && conv().context?.intent === 'existing_booking', no_form: NO_FORM(r), not_full: NOT_FULL(r), no_service_question: !/which (cleaning )?service/i.test(r), handed_to_staff: conv().status === 'Needs a person' });
await confirmByStaff('c1'); await say(`Actually we are scheduled ${D1.label}, I already booked`, { phone: '0917 555 1212' }); r = lastReply();
verdict('R-2 (confirmed): answered from THEIR booking: no new-booking questions, no form, never "full" (the calendar is full)', r, { cites_booking: /JOB-2026-8818/.test(r) || new RegExp(D1.label.split(' ')[1]).test(r) || /scheduled|booking/i.test(r), no_form: NO_FORM(r), not_full: NOT_FULL(r), no_service_question: !/which (cleaning )?service/i.test(r), ...base(r) });
await say('What time will the crew arrive?', { phone: '0917 555 1212' }); r = lastReply();
verdict('R-3: a later general message does not fall back into the new-booking flow', r, { not_booking_flow: conv().context?.intent !== 'booking_request' && conv().context?.booking_requested === false, no_form: NO_FORM(r), no_service_question: !/which (cleaning )?service/i.test(r) });
// T: a date that is NOT their booking: their only verified booking is on another date; it must never be confirmed
setup(); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8820', date: D2.iso }]); busyDay(D1.iso); await say('Hello po', { phone: '0917 555 1212' }); await confirmByStaff('c1');
await say(`Hi po, are we still scheduled for ${D1.label}?`, { phone: '0917 555 1212' }); r = lastReply();
verdict('T: asked about a date that is NOT their booking (their only booking is on another date): never confirmed, never "full"; says it does not see it and gives the real booking or hands to the team', r, { not_confirmed: !(/\b(yes|confirmed|correct|that'?s right|you are (all set|scheduled|booked))\b/i.test(r) && !/don'?t see|do not see|can'?t find|no booking|not on|team will|different date/i.test(r)), says_not_on_record: /don'?t see|do not see|can'?t find|no booking|not on (your|our)|team will (check|confirm|verify)|different date/i.test(r), real_booking_or_team: /JOB-2026-8820/.test(r) || new RegExp(D2.label.split(' ')[1]).test(r) || /team/i.test(r), not_full: NOT_FULL(r), no_form: NO_FORM(r) });
// L: a new booking needs BOTH the city and the service before the form
setup(); await say('Can I schedule tomorrow?'); await say('Makati'); const cityOnly = lastFull(); await say('window cleaning'); const withService = lastFull();
verdict('L: the city alone does NOT start the booking form (only the service is asked); the form goes out once the city AND the service are known', `${cityOnly.split('\n\n---\n\n').pop().trim()} || ${withService.split('\n\n---\n\n').pop().trim().slice(0, 80)}`, { city_only_no_form: !/Reservation Date:/i.test(cityOnly), asks_service: /service/i.test(cityOnly), form_after_service: /Reservation Date:/i.test(withService) && withService.includes('Name:\nAddress:\nContact Number:') });
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

// S: STALE STATUSES: old Dispatched / On Site records never become "the crew is on the way"; an overnight job is still live
const manilaStamp = (h) => new Date(Date.now() + 8 * 3600000 + h * 3600000).toISOString().slice(0, 19);
const rawJob = (cid, number, status, startH, endH) => { DB.jobs = [...(DB.jobs ?? []), { id: `j-${number}`, number, client_id: cid, site_id: `s-${cid}`, start_at: manilaStamp(startH), end_at: manilaStamp(endH), status, service_codes: ['GLASS_EXT'] }]; };
setup(); seedClient('c1', 'Maria Cruz', '0917 555 1212', []); rawJob('c1', 'JOB-OLD-DISP', 'Dispatched', -24 * 20, -24 * 20 + 3); rawJob('c1', 'JOB-OLD-SITE', 'On Site', -24 * 16, -24 * 16 + 3);
await say('Hello po', { phone: '0917 555 1212' }); await confirmByStaff('c1'); await say('Is the crew on the way po?', { phone: '0917 555 1212' }); r = lastReply();
verdict('S-1: a confirmed client with only 16-20 day old "Dispatched / On Site" jobs asks where the crew is: no crew claim, handed to staff', r, { no_crew_claim: !/on the way|on site|on their way|is working|arriv/i.test(r), handed_to_staff: conv().status === 'Needs a person', no_form: NO_FORM(r) });
setup(); seedClient('c1', 'Maria Cruz', '0917 555 1212', []); rawJob('c1', 'JOB-OLD-SITE', 'On Site', -24 * 16, -24 * 16 + 3);
await say('Hello po', { phone: '0917 555 1212' }); await confirmByStaff('c1'); await say('Good day, what is the status of my booking?', { phone: '0917 555 1212' }); r = lastReply();
verdict('S-2: "what is the status of my booking" with only an outdated On Site record: the AI does not describe the old record as current work; no crew claim', r, { no_crew_claim: !/on the way|on site|on their way|is working|arriv|currently/i.test(r), no_form: NO_FORM(r), not_full: NOT_FULL(r) });
setup(); seedClient('c1', 'Maria Cruz', '0917 555 1212', []); rawJob('c1', 'JOB-NIGHT', 'On Site', -8, 14);
await say('Hello po', { phone: '0917 555 1212' }); await confirmByStaff('c1'); await say('Is the crew there now?', { phone: '0917 555 1212' }); r = lastReply();
verdict('S-3: a genuine overnight On Site job is still live: the AI answers from it (no outdated handover)', r, { answers: r.length > 0, not_outdated: !/outdated|not up to date/i.test(conv().human_reason ?? ''), no_form: NO_FORM(r), not_full: NOT_FULL(r) });
// L: a TopMop job-order link is a reference for staff, never identity
const TOK = 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6'; const seedOrder = (clientId) => { DB.job_orders = [...(DB.job_orders ?? []), { id: `jo-${clientId}`, number: 'JO-2026-83589', version: 1, job_id: `j-${clientId}-0`, client_id: clientId, status: 'Sent to Client', content: {}, content_key: 'k', share_token: TOK, deleted_at: null }]; };
setup(); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); seedOrder('c1'); busyDay(D1.iso);
await say(`Hi, this is my job order https://ops.topmop.ph/#/jo/${TOK}. Can we move it to ${D2.label}?`); r = lastReply();
verdict('L-1: a pasted job-order link: staff take over; the client is only SUGGESTED (job_order_link), never linked; nothing about the booking is shown; no "full", no form', r, { handed_to_staff: conv().status === 'Needs a person', suggested_not_linked: conv().link_state === 'suggested' && !conv().client_id && (conv().link_candidates ?? []).some((c) => c.basis === 'job_order_link'), no_leak: NO_LEAK(r) && !/Maria|Cruz|JO-2026/.test(r), not_full: NOT_FULL(r), no_form: NO_FORM(r) });
setup(); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); seedClient('c2', 'Juan Reyes', '0918 777 3434', [{ number: 'JOB-2026-9001', date: D2.iso }]); seedOrder('c2');
await say('Hello po', { phone: '0917 555 1212' }); await confirmByStaff('c1'); await say(`Please check this job order https://ops.topmop.ph/#/jo/${TOK}`, { phone: '0917 555 1212' }); r = lastReply();
verdict('L-2: a CONFIRMED client pasting ANOTHER client\'s job-order link is never shown that booking: handed to staff', r, { no_other_client: !/Juan|Reyes|JOB-2026-9001|JO-2026/.test(r), handed_to_staff: conv().status === 'Needs a person', still_own_client: conv().client_id === 'c1' });

// X: review issue 26: future-dated operational status, crew status per job, old open jobs crowding out the valid booking
setup(); seedClient('c1', 'Maria Cruz', '0917 555 1212', []); rawJob('c1', 'JOB-FUT', 'Dispatched', 24 * 7, 24 * 7 + 3);
await say('Hello po', { phone: '0917 555 1212' }); await confirmByStaff('c1'); await say('Is the crew on the way po?', { phone: '0917 555 1212' }); r = lastReply();
verdict('X-1: a job scheduled NEXT WEEK with status "Dispatched": no crew claim', r, { no_crew_claim: !/on the way|on site|on their way|is working|arriv/i.test(r), no_form: NO_FORM(r) });
setup(); seedClient('c1', 'Maria Cruz', '0917 555 1212', []); rawJob('c1', 'JOB-A-TODAY', 'On Site', -2, 6); rawJob('c1', 'JOB-B-LATER', 'Confirmed', 24 * 8, 24 * 8 + 3);
await say('Hello po', { phone: '0917 555 1212' }); await confirmByStaff('c1'); await say(`Is the crew coming on ${D1.label}? Is it on the way?`, { phone: '0917 555 1212' }); r = lastReply();
verdict('X-2: mixed jobs: today\'s On Site job must not become a status for the job on another date', r, { no_crew_claim: !/on the way|on site|on their way|is working|arriv/i.test(r), not_full: NOT_FULL(r) });
setup(); seedClient('c1', 'Maria Cruz', '0917 555 1212', []); for (let i = 0; i < 45; i++) rawJob('c1', `JOB-OLD-${i}`, i % 2 ? 'Dispatched' : 'On Site', -24 * (30 + i), -24 * (30 + i) + 3); rawJob('c1', 'JOB-VALID-FUTURE', 'Confirmed', 24 * 8, 24 * 8 + 3);
await say('Hello po', { phone: '0917 555 1212' }); await confirmByStaff('c1'); await say(`Hi po, are we still scheduled for ${D1.label}?`, { phone: '0917 555 1212' }); r = lastReply();
verdict('X-3: 45 old unfinished jobs and one valid upcoming booking: the booking is found and confirmed, never "full", no form', r, { confirms_booking: /JOB-VALID-FUTURE|scheduled|booked|confirmed/i.test(r) && !/don't see a booking/i.test(r), not_full: NOT_FULL(r), no_form: NO_FORM(r) });

const apiErrors = modelCalls.filter((c) => c._real && c._real.status !== 200); if (apiErrors.length) console.log(`\nANTHROPIC API ERRORS: ${apiErrors.length} of ${modelCalls.length} model calls failed. First: HTTP ${apiErrors[0]._real.status} ${apiErrors[0]._real.error?.type ?? ''}: ${apiErrors[0]._real.error?.message ?? ''} (model requested: ${apiErrors[0].model})`);

const failed = rows.filter((x) => x.fail.length); console.log(`\n${rows.length - failed.length}/${rows.length} passed (model: ${model || 'default claude-haiku-5-5'}; model calls made: ${modelCalls.length}; database: in memory, NOT staging)`); process.exit(failed.length ? 1 : 0);
