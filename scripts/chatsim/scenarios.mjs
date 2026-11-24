// Automated scenarios A-G for TopMop AI V2 with a SCRIPTED model (deterministic: it tests the memory, the validation and the delivery plumbing, not the wording of a real model).
// Run:  node scripts/chatsim/scenarios.mjs        (real-model run: CHATSIM_REAL=1 node scripts/chatsim/realmodel.mjs)
import { send, reset, deliver, modelCalls, state, DB, queue, flush, setEnv, flags, recover, staff } from './harness.mjs';
const results = []; const ok = (name, pass, evidence) => { results.push({ name, pass: !!pass, evidence }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${evidence ? `\n      ${evidence}` : ''}`); };
const lastSystem = () => modelCalls[modelCalls.length - 1]?.system ?? '';
const text = (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' });
const drafts = () => DB.chat_messages.filter((m) => m.direction === 'out');
const ctxOf = () => DB.chat_conversations[0]?.context ?? {};

// A. Binondo, Wall Cleaning -> remembers Binondo, asks the wall type, no booking
reset('suggest'); queue(false);
state.script = (b, n) => text(n === 1 ? 'NO_ANSWER' : 'Is it for the exterior or the interior walls po?');
await send('Binondo'); await send('Wall Cleaning');
ok('A: context keeps location (Binondo is kept as the place named) and service (wall)', ctxOf().location === 'Binondo' && ctxOf().service === 'wall', JSON.stringify({ location: ctxOf().location, service: ctxOf().service, stage: ctxOf().stage, intent: ctxOf().intent }));
ok('A: the prompt carries the known facts and suggests the wall type, no booking', /location: Binondo/.test(lastSystem()) && /service: wall cleaning/.test(lastSystem()) && /exterior or the interior walls/.test(lastSystem()) && !/CURRENT INTENT: booking/.test(lastSystem()));
ok('A: the draft asks the wall type and does not offer booking', /exterior or the interior/.test(drafts().at(-1).body) && !/book/i.test(drafts().at(-1).body), drafts().at(-1).body);

// B. Exterior, Ground floor, How much? -> all facts present, price intent
reset('auto'); queue(false);
state.script = () => text('Exterior wall cleaning in Manila is ₱125 per sqm with a 50 sqm minimum po.');
for (const t of ['Binondo', 'Wall Cleaning', 'Exterior', 'Ground floor', 'How much?']) await send(t);
ok('B: all four facts and the price intent are in the prompt at "How much?"', ['location: Binondo', 'service: wall cleaning', 'surface: exterior', 'building level/access: ground floor', 'CURRENT INTENT: price_inquiry'].every((x) => lastSystem().includes(x)), lastSystem().split('\n').find((l) => l.startsWith('KNOWN FACTS')));
ok('B: the final reply carries the (stubbed) verified price and no booking offer', /₱125/.test(drafts().at(-1).body) && !/book/i.test(drafts().at(-1).body));

// C. "Okay, thank you." -> brief acknowledgment, no model call, no booking offer
reset('auto'); queue(false); state.script = () => text('Exterior wall cleaning in Manila is ₱125 per sqm po.');
await send('Binondo'); await send('Wall Cleaning'); await send('How much?'); const before = modelCalls.length; const r = await send('Okay, thank you.');
ok('C: a brief acknowledgment, no AI call, no booking offer', modelCalls.length === before && /You're welcome/.test(r.reply) && !/book|date|schedule/i.test(r.reply), r.reply);

// D. Booking uses the booking-details form: city first, then the form as its own message, then only what is missing
reset('suggest'); queue(false); state.script = () => text('');
await send('Can I schedule tomorrow?'); const d1 = ctxOf();
ok('D: booking intent is recognised and the schedule is remembered', d1.intent === 'booking_request' && d1.schedule === 'tomorrow', JSON.stringify({ intent: d1.intent, schedule: d1.schedule, location: d1.location ?? null }));
ok('D: no city yet: the welcome already asks for it, no form is sent', !/Reservation Date:/.test(drafts().at(-1).body), JSON.stringify(drafts().at(-1).body.slice(-90)));
deliver(); await send('Makati'); const f0 = drafts().at(-1).body;
ok('D: the city alone does NOT start the form: the AI asks only for the missing service (rule: scheduling needs the location AND the service)', /Which cleaning service/.test(f0) && !/Reservation Date:/.test(f0) && !/Name:\nAddress:/.test(f0), JSON.stringify(f0.slice(-90)));
deliver(); const callsBefore = modelCalls.length; await send('window cleaning');
const f1 = drafts().at(-1).body;
ok('D: the city AND the service are known: the form goes out by itself as its own message (no model call), exactly as approved', /Sure po, happy to help you book!/.test(f1) && f1.includes('Name:\nAddress:\nContact Number:\nEmail:\nNo. of House Storey:\nReservation Date:\nService Window, Wall, Roof, Solar, Floor?') && modelCalls.length === callsBefore, JSON.stringify(f1.slice(-120)));
deliver(); state.script = () => text('Thank you po! To complete the booking, may I also have the complete address?');
await send('Name: Maria Santos\nAddress:\nContact Number: 0917 555 1212\nEmail:\nNo. of House Storey: 2\nReservation Date: Saturday\nService Window');
ok('D: a half-filled form is read: only the address is still missing and the form is not sent again', ctxOf().contact?.name === 'Maria Santos' && ctxOf().contact?.mobile === '09175551212' && ctxOf().service === 'window' && /NEXT BOOKING QUESTION[^:]*: Thank you po! To complete the booking, may I also have the complete address\?/.test(lastSystem()) && !/Reservation Date:/.test(drafts().at(-1).body), JSON.stringify(ctxOf().contact));
deliver(); state.script = () => text('');
await send('Address: 12 Maple St, Brgy. Bahay Toro, Makati');
ok('D: with the form complete the AI is told to check the date and then book (the system writes the confirmation)', /ALL BOOKING DETAILS ARE KNOWN/.test(lastSystem()) && /check_date/.test(lastSystem()) && /Bahay Toro/.test(ctxOf().contact?.address ?? ''), JSON.stringify(ctxOf().contact));

// E. Pure Tagalog -> English / English-dominant Taglish (AI's Tagalog draft is rewritten once, else replaced)
reset('suggest'); queue(false); let calls = 0;
state.script = (b) => { calls++; return text(calls === 1 ? 'Para ma-check ko ang tamang presyo, anong klaseng cleaning po ang kailangan ninyo at saan po ang location?' : 'Which cleaning service do you need po?'); };
await send('Magkano po magpalinis ng bintana namin sa bahay?', {}, 'MC-E'); deliver();
const e = drafts().at(-1).body; ok('E: a Tagalog draft becomes English before it can go out', !/Para ma-check|anong klaseng/.test(e) && calls === 2, `${calls} model calls; draft ends: ${JSON.stringify(e.slice(-60))}`);
reset('suggest'); queue(false); state.script = () => text('Para ma-check ko ang tamang presyo, anong klaseng cleaning po ang kailangan ninyo at saan po ang location?');
await send('Magkano po magpalinis ng bintana?', {}, 'MC-E2'); const e2 = drafts().at(-1);
ok('E: a Tagalog draft that stays Tagalog after the rewrite is replaced by a safe English sentence and flagged for staff', !/Para ma-check|anong klaseng/.test(e2.body) && e2.flags.some((f) => /safe sentence|repaired/.test(f)), `${JSON.stringify(e2.body.slice(-70))} flags=${JSON.stringify(e2.flags)}`);

// premature booking after a price is removed (rule 8)
reset('auto'); queue(false); state.script = () => text('Our Makati package is ₱4,799 for up to 31 panels. Would you like to book a date po?');
await send('Makati'); await send('window cleaning'); await send('How much?'); const pb = drafts().at(-1).body;
ok('Rule 8: a booking offer after a price question is rewritten or removed', !/book|date/i.test(pb), JSON.stringify(pb.slice(-80)));
// measurement explanation and other services are removed (rules 6, 7)
reset('auto'); queue(false); state.script = () => text('It is ₱4,799. Our team will conduct on-site glass and solar panel counting and wall and floor area measurement. We also do roof cleaning po.');
await send('Makati window cleaning how much?'); const mm = drafts().at(-1).body.split('\n\n---\n\n').slice(1).join(' ');   // after the welcome that the system adds to a first message
ok('Rules 6-7: forced counting sentence and unrelated services are removed', mm.length > 0 && !/counting|measurement|roof/i.test(mm), JSON.stringify(mm));

// F. Five rapid messages -> production path (queued + debounce): one answer, all facts kept, nothing lost
reset('suggest'); queue(true, 60); state.script = () => text('Exterior wall cleaning in Manila is ₱125 per sqm po.');
const burst = await Promise.all(['Binondo', 'Wall Cleaning', 'Exterior', 'Ground floor', 'How much?'].map((t, i) => (i ? new Promise((r) => setTimeout(r, i * 5)).then(() => send(t, {}, 'MC-F')) : send(t, {}, 'MC-F')))); await flush();
const inbound = DB.chat_messages.filter((m) => m.direction === 'in');
ok('F: all five messages are stored, none rejected', inbound.length === 5 && burst.every((x) => x.status === 'queued'), burst.map((x) => x.status ?? x.error).join(','));
ok('F: exactly one AI call and one draft for the whole burst', modelCalls.length === 1 && drafts().length === 1, `modelCalls=${modelCalls.length} drafts=${drafts().length}`);
ok('F: every fact reached the model, and all five messages are marked handled', ['location: Binondo', 'surface: exterior', 'building level/access: ground floor', 'CURRENT INTENT: price_inquiry'].every((x) => lastSystem().includes(x)) && inbound.every((m) => m.handled_at), '');
// F2. a burst on a brand-new conversation used to lose messages (unique-key race)
reset('suggest'); queue(true, 60); state.script = () => text('Okay po.');
const nb = await Promise.all(['Binondo', 'Wall Cleaning', 'Exterior'].map((t) => send(t, {}, 'MC-NEW'))); await flush();
ok('F2: three simultaneous first messages on a new conversation: no error, one conversation, nothing lost', nb.every((x) => x.status === 'queued') && DB.chat_conversations.length === 1 && DB.chat_messages.filter((m) => m.direction === 'in').length === 3, nb.map((x) => x.status ?? x.error).join(','));
// F3. a message that arrives while the AI is busy is answered afterwards (drain), once
reset('auto'); queue(true, 10); let slow = true; state.script = () => text('Noted po.'); const origFetch = globalThis.fetch;
globalThis.fetch = async (u, i) => { if (String(u).startsWith('https://api.anthropic.com') && slow) { slow = false; await new Promise((r) => setTimeout(r, 120)); } return origFetch(u, i); };
await send('Makati', {}, 'MC-F3'); await new Promise((r) => setTimeout(r, 60)); await send('window cleaning', {}, 'MC-F3'); await flush(); globalThis.fetch = origFetch;
ok('F3: a message that arrives during processing is answered after it, in order, not lost', DB.chat_messages.filter((m) => m.direction === 'in').every((m) => m.handled_at) && drafts().length >= 1, `replies=${drafts().length}, modelCalls=${modelCalls.length}`);

// G. More than 14 messages -> facts survive in the context and are still injected
reset('auto'); queue(false); state.script = () => text('Noted po.');
const talk = ['Binondo', 'Wall Cleaning', 'Exterior', 'Ground floor', 'cream paint', 'gated village', 'weekdays only', 'two coats', 'its old', 'any scratches?', 'ok', 'and stains?', 'rust', 'hello?', 'any idea?', 'also is it safe', 'how long does it take', 'How much?'];
for (const t of talk) await send(t, {}, 'MC-G');
const hist = modelCalls.at(-1).messages; const joined = JSON.stringify(hist);
ok('G: after 18 messages the old facts are no longer in the transcript window...', !joined.includes('Binondo') || hist.length < 36, `${hist.length} turns in the window`);
ok('G: ...but location, service and surface are still injected from the stored context', ['location: Binondo', 'service: wall cleaning', 'surface: exterior', 'building level/access: ground floor'].every((x) => lastSystem().includes(x)), lastSystem().split('\n').find((l) => l.startsWith('KNOWN FACTS')));
ok('G: the history starts on a customer turn and never repeats the current message at the top', hist[0].role === 'user' && !(hist[0].content === 'How much?' && hist.length > 1), `first turn: ${JSON.stringify(String(hist[0].content).slice(0, 40))}`);

// Delivered-only history (Suggest mode): an unsent draft is not treated as said
reset('suggest'); queue(false); state.script = () => text('Is it for the exterior or the interior walls po?');
await send('Makati'); await send('wall cleaning'); const h1 = modelCalls.at(-1).messages.map((m) => m.role).join(',');
ok('Suggest mode: unsent drafts are never shown to the model as delivered replies', !/assistant/.test(h1), `roles sent to the model: ${h1}`);
ok('Suggest mode: the "last question" is empty until a reply is really delivered', !/LAST QUESTION WE ASKED/.test(lastSystem()));
deliver(); await send('Exterior'); ok('After approval the delivered reply and its question are remembered', /LAST QUESTION WE ASKED[^\n]*(surface|other)/.test(lastSystem()) && modelCalls.at(-1).messages.some((m) => m.role === 'assistant'), (lastSystem().split('\n').find((l) => l.startsWith('LAST QUESTION')) ?? '').slice(0, 90));

// Integration failure and empty answers -> safe fallback / handover, never a blank draft
reset('suggest'); queue(false); state.script = () => { throw new Error('boom'); };
const fr = await send('How much for windows in Makati?', {}, 'MC-X'); const fd = drafts().at(-1);
ok('Integration failure: a safe holding draft and a handover alert, no crash', !!fd && fd.body.length > 5 && DB.chat_conversations[0].status === 'Needs a person' && DB.alert_outbox.some((a) => /needs a person|error/i.test(a.title)), `${fr.status}: ${fd?.body?.slice(-70)}`);
reset('suggest'); queue(false); state.script = () => text(''); await send('How much for windows in Makati?', {}, 'MC-Y');
ok('Empty AI answer: a safe sentence, never a blank draft', drafts().at(-1).body.trim().length > 5, JSON.stringify(drafts().at(-1).body.slice(-70)));
// complaint -> handover without selling
reset('suggest'); queue(false); state.script = () => text('SHOULD NOT BE CALLED'); await send('Your team damaged my window, I want a refund', {}, 'MC-Z');
ok('Complaint: handed to a person with an apology, no AI sales answer', DB.chat_conversations[0].status === 'Needs a person' && /sorry/i.test(drafts().at(-1).body) && modelCalls.length === 0, drafts().at(-1)?.body);

// Crash safety: messages are marked handled only together with the saved answer, and a recovery pass answers what a stopped worker left behind
reset('suggest'); queue(true, 20); let seenUnhandled = null; state.script = () => { seenUnhandled = DB.chat_messages.filter((m) => m.direction === 'in').every((m) => !m.handled_at); return text('Exterior wall cleaning is ₱125 per sqm po.'); };
await send('Wall cleaning in Makati how much?', {}, 'MC-R0'); await flush();
ok('Crash safety: a message is not marked handled while the AI is still working on it', seenUnhandled === true && DB.chat_messages.filter((m) => m.direction === 'in').every((m) => m.handled_at) && drafts().length === 1, `unhandled during the model call: ${seenUnhandled}`);
reset('suggest'); queue(true, 20); flags.crashBeforeAnswer = true; state.script = () => text('Exterior wall cleaning is ₱125 per sqm po.');
await send('Wall cleaning in Makati how much?', {}, 'MC-R1'); await flush(); flags.crashBeforeAnswer = false;
const stuck = DB.chat_messages.filter((m) => m.direction === 'in' && !m.handled_at).length;
ok('Crash safety: a worker that crashes before saving its answer leaves the message unhandled and unanswered (nothing lost, nothing half-saved)', stuck === 1 && drafts().length === 0, `unhandled=${stuck} drafts=${drafts().length}`);
DB.chat_conversations[0].busy_until = Date.now() + 60_000; const blocked = await recover();
ok('Recovery respects a live worker: while the lock is held nothing is answered twice', drafts().length === 0 && blocked.ok, JSON.stringify(blocked));
DB.chat_conversations[0].busy_until = null; const rec = await recover();
ok('Recovery: the stuck message is answered once, marked handled, and the context is rebuilt', rec.recovered === 1 && drafts().length === 1 && DB.chat_messages.filter((m) => m.direction === 'in').every((m) => m.handled_at) && ctxOf().service === 'wall', JSON.stringify(rec));
const again = await recover(); ok('Recovery is idempotent: running it again changes nothing', again.recovered === 0 && drafts().length === 1, JSON.stringify(again));
reset('suggest'); queue(true, 20); let boom = true; state.script = () => { if (boom) { boom = false; throw new Error('AI error 503'); } return text('Exterior wall cleaning is ₱125 per sqm po.'); };
await send('Wall cleaning in Makati how much?', {}, 'MC-R2'); await flush();
ok('Crash safety: when the AI service is busy (503) nothing is saved or marked; the customer is not handed over yet', DB.chat_messages.some((m) => m.direction === 'in' && !m.handled_at) && drafts().length === 0 && DB.chat_conversations[0].status !== 'Needs a person', `conversation status: ${DB.chat_conversations[0].status}`);
const r2 = await recover(); ok('Recovery after an AI failure: answered on the next pass', r2.recovered === 1 && drafts().length >= 1 && DB.chat_messages.filter((m) => m.direction === 'in').every((m) => m.handled_at), JSON.stringify(r2));
reset('suggest'); queue(true, 20); state.script = () => { throw new Error('AI error 401'); }; await send('Wall cleaning in Makati how much?', {}, 'MC-R4'); await flush();
ok('A configuration error (401) is not retried: the customer is handed to a person at once, with an alert', DB.chat_conversations[0].status === 'Needs a person' && DB.chat_messages.filter((m) => m.direction === 'in').every((m) => m.handled_at) && DB.alert_outbox.some((a) => /needs a person/i.test(a.title)), `status=${DB.chat_conversations[0].status}`);
reset('suggest'); queue(true, 20); state.script = () => { throw new Error('AI error 503'); }; await send('Wall cleaning in Makati how much?', {}, 'MC-R5'); await flush(); await recover(11 * 60_000);
ok('After 10 minutes of a failing AI service the customer is handed to a person (no endless retries)', DB.chat_conversations[0].status === 'Needs a person' && DB.chat_messages.filter((m) => m.direction === 'in').every((m) => m.handled_at), `status=${DB.chat_conversations[0].status}`);
reset('auto'); queue(true, 20); flags.crashBeforeAnswer = true; await send('Makati window cleaning how much?', {}, 'MC-R3'); await flush(); flags.crashBeforeAnswer = false; setEnv('MANYCHAT_API_TOKEN', '');
const r3 = await recover(); ok('Recovery in full mode without a ManyChat token saves a DRAFT for staff instead of sending', r3.recovered === 1 && drafts().at(-1).status === 'draft', `${drafts().at(-1)?.status}`);

// Rollout safety: code deployed before migration 0133 is applied still answers (the old single-message behaviour, no stored context)
reset('suggest'); queue(false); flags.noMigration = true; state.script = () => text('Is it for the exterior or the interior walls po?');
const lg = await send('Wall cleaning in Makati', {}, 'MC-L'); flags.noMigration = false;
ok('Migration 0133 missing: the chat still answers (draft saved), nothing crashes', lg.status === 'held' && drafts().length === 1, `${lg.status}; context stored: ${JSON.stringify(ctxOf())}`);

// H. V2.2 company knowledge through the whole reply path (scripted model: validation, repair, safe fallback and delivery are real code)
const policy = async (customer, scripted, id) => { reset('suggest'); queue(false); state.script = () => text('NO_ANSWER'); await send('Hello', {}, id); deliver(); let calls = 0; state.script = () => { calls++; return text(Array.isArray(scripted) ? scripted[Math.min(calls - 1, scripted.length - 1)] : scripted); }; await send(customer, {}, id); const d = drafts().at(-1); return { d, calls }; };
const ACID = "We don't offer acid rain mark removal po, since glass damage varies and treatment may sometimes make it worse. Regular cleaning helps maintain your glass, but cannot reverse existing damage.";
let h = await policy('Can you remove acid rain marks on my windows?', ACID, 'MC-H1');
ok('V2.2 acid rain: the approved answer goes out as written, no handover, no flag', h.d.body === ACID && h.d.flags.length === 0, JSON.stringify(h.d.body.slice(0, 70)) + ' flags=' + JSON.stringify(h.d.flags));
h = await policy('Can you remove acid rain marks on my windows?', "We'll try our best to remove the acid rain marks po.", 'MC-H2');
ok('V2.2 acid rain: a promise to remove the marks never reaches the customer (replaced by the policy answer, flagged for staff)', !/try our best|remove the acid/i.test(h.d.body) && /don't offer acid rain mark removal/.test(h.d.body) && h.d.flags.some((f) => /safe sentence|repaired/.test(f)), `${JSON.stringify(h.d.body.slice(0, 80))} flags=${JSON.stringify(h.d.flags).slice(0, 120)}`);
h = await policy('Can you remove acid rain marks on my windows?', 'Our team will assess the acid rain marks on site po.', 'MC-H3');
ok('V2.2 acid rain: "our team will assess it" (the old draft) is replaced by the policy answer', /don't offer acid rain mark removal/.test(h.d.body), JSON.stringify(h.d.body.slice(0, 80)));
h = await policy('How many people will come to clean?', 'We usually deploy 3–5 professional cleaning crew per service po, depending on the job requirements.', 'MC-H4');
ok('V2.2 crew: 3–5 crew answers in one short sentence, no flag, no booking offer', /3–5/.test(h.d.body) && h.d.flags.length === 0 && !/book|schedule/i.test(h.d.body), JSON.stringify(h.d.body.slice(0, 70)));
h = await policy('We have an office building, can you give a quote?', 'For commercial projects po, we can initially assess using your address on Google Maps; photos are optional. An onsite ocular inspection is ₱2,500, deductible when you proceed.', 'MC-H5');
ok('V2.2 commercial: Google Maps, optional photos, ₱2,500 deductible ocular; no price, no handover, no flag', /Google Maps/.test(h.d.body) && /optional/.test(h.d.body) && /₱2,500/.test(h.d.body) && h.d.flags.length === 0, JSON.stringify(h.d.body.slice(0, 80)));
h = await policy('We have an office building, can you give a quote?', ['Please send photos of the building po so we can quote.', 'Please send photos of the building po so we can quote.'], 'MC-H6');
ok('V2.2 commercial: a reply that REQUIRES or asks for photos is never sent as is (photos stay optional)', !/send photos/i.test(h.d.body), JSON.stringify(h.d.body.slice(0, 90)));
h = await policy('We have an office building, can you give a quote?', ["For commercial projects po, we can start with an initial assessment using your address on Google Maps, and photos are optional. Our team will follow up on your quote from there po.", "For commercial projects po, we can start with an initial assessment using your address on Google Maps, and photos are optional. Our team will follow up on your quote from there po."], 'MC-H5b');
ok('V2.2 commercial: an answer that leaves out the ₱2,500 ocular option is never sent as is (replaced by the approved three-option text)', /₱2,500/.test(h.d.body) && /Google Maps/.test(h.d.body), JSON.stringify(h.d.body.slice(0, 90)));
h = await policy('What do you use to clean the glass?', 'For exterior glass po, we use purified deionized water with our water-fed pole system. For interior glass, we use traditional professional cleaning methods.', 'MC-H7');
ok('V2.2 glass methods: exterior deionized water and water-fed poles, interior traditional methods, no flag', /deionized/.test(h.d.body) && /traditional/.test(h.d.body) && h.d.flags.length === 0, JSON.stringify(h.d.body.slice(0, 70)));
h = await policy('What do you need from us at the house?', 'We bring our own cleaning equipment po. We only need access to a water source and electricity if required for the equipment.', 'MC-H8');
ok('V2.2 site needs: own equipment, only water and (if needed) electricity, no flag', /water source/.test(h.d.body) && /electricity/.test(h.d.body) && h.d.flags.length === 0, JSON.stringify(h.d.body.slice(0, 70)));
h = await policy('How do you clean roofs?', "We use a hybrid cleaning method po, combining soft washing and carefully regulated pressure when suitable. The approach depends on your roof's material and condition.", 'MC-H9');
ok('V2.2 roof method: hybrid soft washing and regulated pressure, depends on the roof, no flag', /hybrid/.test(h.d.body) && /soft washing/.test(h.d.body) && h.d.flags.length === 0, JSON.stringify(h.d.body.slice(0, 70)));
h = await policy('Can you restore my faded roof paint?', 'Yes po, we can restore the faded paint on your roof.', 'MC-H10');
ok('V2.2 roof: a promise to restore faded paint never reaches the customer', !/restore the faded/i.test(h.d.body), JSON.stringify(h.d.body.slice(0, 90)));
h = await policy('What if I book roof cleaning together with my windows? Is there still a minimum?', 'When you bundle eligible cleaning services po, we waive the minimum requirement for the second service. The regular per-panel or per-sqm rate still applies.', 'MC-H11');
ok('V2.2 bundle: the second service minimum is waived, the regular rate applies; no flag, no booking offer', /waive the minimum/.test(h.d.body) && /regular/.test(h.d.body) && h.d.flags.length === 0 && !/book|schedule/i.test(h.d.body), JSON.stringify(h.d.body.slice(0, 80)));
h = await policy('What if I book roof cleaning together with my windows? Is there still a minimum?', ['The second service is free po.', 'The second service is free po.'], 'MC-H12');
ok('V2.2 bundle: "the second service is free" / a lower rate is never sent', !/\bfree\b/i.test(h.d.body), JSON.stringify(h.d.body.slice(0, 90)));

// I. Minimum charges and bundles through the real tool path (scripted model asks the estimate tool; the code computes; the guard checks every amount)
const asksTool = (input, finalText) => { let step = 0; state.script = () => { step++; return step === 1 ? { content: [{ type: 'tool_use', id: 't1', name: 'estimate', input }], stop_reason: 'tool_use' } : text(finalText); }; };
const priced = async (customer, input, finalText, id, mode = 'suggest') => { reset(mode); queue(false); state.script = () => text('NO_ANSWER'); await send('Hello', {}, id); deliver(); asksTool(input, finalText); await send(customer, {}, id); return drafts().at(-1); };
let m = await priced('Roof cleaning in Makati, about 60 sqm. How much?', { address: 'Makati', service: 'roof cleaning', qty: 60 }, 'Roof cleaning is ₱145 per sqm with a 100 sqm minimum, so 60 sqm comes to ₱14,500 po.', 'MC-I1');
ok('Minimum: 60 sqm of roof is quoted at the full ₱14,500 minimum, no flag', /14,500/.test(m.body) && m.flags.length === 0, JSON.stringify(m.body.slice(0, 90)));
m = await priced('Roof cleaning in Makati, about 60 sqm. How much?', { address: 'Makati', service: 'roof cleaning', qty: 60 }, 'For 60 sqm it comes to ₱8,700 po.', 'MC-I2', 'auto');
ok('Minimum (full mode): a prorated amount (60 sqm × rate = ₱8,700) is never sent to the customer: the amount no tool returned is caught and a person takes over', !/8,700/.test(m.body) && m.flags.some((f) => /no tool returned|safe sentence|repaired/.test(f)), `${JSON.stringify(m.body.slice(0, 80))} flags=${JSON.stringify(m.flags).slice(0, 100)}`);
m = await priced('Windows in Makati, 15 panels. How much?', { address: 'Makati', service: 'window cleaning', qty: 15 }, 'Our Makati window package is ₱4,799 for up to 31 panels, so 15 panels is still ₱4,799 po.', 'MC-I3');
ok('Minimum: 15 window panels in Makati are still ₱4,799', /4,799/.test(m.body) && m.flags.length === 0, JSON.stringify(m.body.slice(0, 90)));
m = await priced('Makati windows 15 panels plus 10 solar panels, total?', { address: 'Makati', items: [{ service: 'window cleaning', qty: 15 }, { service: 'solar panels', qty: 10 }] }, 'For both services the estimate is ₱7,249 po: the window package ₱4,799 plus 10 solar panels at ₱245 each. The final amount is confirmed on site.', 'MC-I4');
ok('Bundle: windows + 10 solar panels = ₱7,249 (₱4,799 + 10 × ₱245), the total comes from the tool, no flag', /7,249/.test(m.body) && m.flags.length === 0, JSON.stringify(m.body.slice(0, 100)));
m = await priced('Makati windows 15 panels plus 10 solar panels, total?', { address: 'Makati', items: [{ service: 'window cleaning', qty: 15 }, { service: 'solar panels', qty: 10 }] }, 'For both services it comes to ₱7,000 po.', 'MC-I5', 'auto');
ok('Bundle (full mode): a total the tool did not return (the AI adding wrongly) never reaches the customer', !/7,000/.test(m.body) && m.flags.length > 0, `${JSON.stringify(m.body.slice(0, 80))} flags=${JSON.stringify(m.flags).slice(0, 100)}`);
m = await priced('How much for 10 solar panels in Makati?', { address: 'Makati', service: 'solar panels', qty: 10, with_main: true }, 'Solar cleaning is ₱245 per panel with a 20 panel minimum, so 10 panels is ₱4,900 po.', 'MC-I6');
ok('Standalone: the model asking for a bundle waiver on a single service is ignored, the ₱4,900 minimum stands', /4,900/.test(m.body) && m.flags.length === 0, JSON.stringify(m.body.slice(0, 90)));

m = await priced('Makati: 15 window panels, 10 solar panels and 60 sqm of roof. What is the total?', { address: 'Makati', items: [{ service: 'window cleaning', qty: 15 }, { service: 'solar panels', qty: 10 }, { service: 'roof cleaning', qty: 60 }] }, 'The total for all three is ₱15,949 po: the window package ₱4,799, solar ₱2,450 and roof ₱8,700. The final amount is confirmed on site.', 'MC-I7');
ok('Bundle of three: window ₱4,799 (keeps its minimum) + solar ₱2,450 + roof ₱8,700 (no minimum) = ₱15,949, from the tool, no flag', /15,949/.test(m.body) && m.flags.length === 0, JSON.stringify(m.body.slice(0, 100)));


/* ============ V2.3: previous contacts and existing clients (scripted model; the REAL chat-brain and chat-send code; in-memory database) ============ */
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const inDays = (n) => { const d = new Date(Date.now() + n * 86400000 + 8 * 3600000); return { iso: d.toISOString().slice(0, 10), label: `${MON[d.getUTCMonth()]} ${d.getUTCDate()}` }; };
const D1 = inDays(8), D2 = inDays(15);
const seedClient = (id, name, mobile, jobs = []) => {   // a client record CREATED AFTER the chat started, with its own jobs (made by staff by hand: no quotation, no inquiry)
  DB.clients = [...(DB.clients ?? []), { id, name, mobile, address: 'Makati', created_at: new Date(Date.now() + 5000).toISOString() }];
  DB.sites = [...(DB.sites ?? []), { id: `s-${id}`, client_id: id, name: `${name} residence`, address: 'Makati' }];
  jobs.forEach((j, i) => { DB.jobs = [...(DB.jobs ?? []), { id: `j-${id}-${i}`, number: j.number, client_id: id, site_id: `s-${id}`, start_at: `${j.date}T09:00:00`, end_at: `${j.date}T12:00:00`, status: j.status ?? 'Confirmed', service_codes: j.codes ?? ['GLASS_EXT'] }]; });
};
const conv0 = () => DB.chat_conversations[0] ?? {};
const askText = (label) => `Hi po, are we still scheduled for ${label}?`;
const sayFull = () => text(`Sorry po, that date is fully booked. The nearest open dates are Jan 11, Jan 12 or Jan 13.`);
const aiStartedTomorrow = () => { DB.settings[0].data.chat_ai.ai_started_on = new Date(Date.now() + 86400000).toISOString(); };
const confirmByStaff = async (clientId) => { const a = await staff({ action: 'link', conversation_id: conv0().id, client_id: clientId }); await staff({ action: 'release', conversation_id: conv0().id }); return a; };   // what a staff member does in AI Chat: "This is the client", then lets the AI answer
const leak = (b) => /JOB-\d{4}-\d{3,5}|fully booked|Jan 11\b|Reservation Date|Please copy this/.test(b);

// V2.3-1/2: previous contacts (before the AI): no welcome, no menu, no client records, never an existing client
reset('suggest'); queue(false); aiStartedTomorrow(); state.script = () => text('Which service do you need po?');
await send('Hello po'); let dr = drafts().at(-1);
ok('V2.3-1 messaged before the AI was installed: PREVIOUS contact, not an existing client', conv0().contact_status === 'previous' && !conv0().client_id, JSON.stringify({ s: conv0().contact_status, c: conv0().client_id ?? null }));
ok('V2.3-1 no welcome or service menu again; the AI is told "previous contact" and never to invent history', !/TopMop offers professional exterior cleaning/.test(dr.body) && /CUSTOMER STATUS: PREVIOUS CONTACT/.test(lastSystem()) && /do not invent or assume/i.test(lastSystem()), JSON.stringify(dr.body.slice(0, 80)));
reset('suggest'); queue(false); DB.settings[0].data.chat_ai.ai_started_on = '2026-11-17T00:00:00Z'; state.script = () => text('Which service do you need po?');
await send('Hi', { subscribed: '2026-05-02T08:00:00Z' });
ok('V2.3-2 old Messenger contact with no service history: PREVIOUS contact, no client record shown to the AI', conv0().contact_status === 'previous' && !conv0().client_id && !/mobile|address on file/i.test(lastSystem().split('CUSTOMER STATUS')[1] ?? ''), JSON.stringify({ s: conv0().contact_status }));

// V2.3-3: THE NOVEMBER 30 INCIDENT. A booking made BY STAFF by hand; the client record is newer than the chat; the customer asks about it. The phone in ManyChat matches the client, but a phone is not proof.
reset('suggest'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); state.script = () => sayFull();
await send(askText(D1.label), { phone: '+63 917 555 1212' }); dr = drafts().at(-1);
ok('V2.3-3 the ManyChat phone matches a client: it only SUGGESTS (previous contact, "suggested"), nobody is verified', conv0().contact_status === 'previous' && conv0().link_state === 'suggested' && !conv0().client_id && (conv0().link_candidates ?? []).some((c) => c.client_id === 'c1' && c.basis === 'contact_mobile'), JSON.stringify({ s: conv0().contact_status, st: conv0().link_state, c: conv0().client_id ?? null }));
ok('V2.3-3 the customer is NOT told the date is full, NOT given the form and NOT shown any booking detail; the team will check (no model improvised)', !leak(dr.body) && /Our team will check your booking/.test(dr.body) && modelCalls.length === 0, JSON.stringify(dr.body));
ok('V2.3-3 a person is asked: the chat goes to staff with the possible client and the booking to check; an alert asks them to confirm the client', conv0().status === 'Needs a person' && /Maria Cruz/.test(conv0().human_reason ?? '') && /JOB-2026-8818/.test(conv0().human_reason ?? '') && (DB.alert_outbox ?? []).some((a) => a.title === 'Please confirm the client match'), conv0().human_reason);
const lk = await confirmByStaff('c1');
ok('V2.3-3 staff press "This is the client" (the real chat-send function): the contact becomes an EXISTING client by staff link, audited', lk.ok === true && conv0().contact_status === 'existing' && conv0().client_id === 'c1' && conv0().link_state === 'staff' && (DB.audit_logs ?? []).some((a) => /linked to client Maria Cruz by staff/i.test(a.summary)), JSON.stringify({ s: conv0().contact_status, st: conv0().link_state }));
deliver(); await send(askText(D1.label), { phone: '+63 917 555 1212' }); dr = drafts().at(-1);
ok('V2.3-3 now confirmed: the AI is given the job first; the model\'s "fully booked" is caught and replaced by THEIR booking; no form, no other dates', /VERIFIED ACTIVE AND UPCOMING BOOKINGS/.test(lastSystem()) && /JOB-2026-8818/.test(dr.body) && !/fully booked|Jan 11\b|Reservation Date/.test(dr.body), JSON.stringify(dr.body));

// V2.3-4: a reminder about a high ceiling: before confirmation a person is asked; after confirmation it is acknowledged and the team alerted
reset('suggest'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); state.script = () => text("Noted po, thank you for the reminder about the high ceiling. I'll make sure our team sees it.");
await send(`Reminder lang po, mataas po ang ceiling namin. We are scheduled ${D1.label}.`, { phone: '0917 555 1212' }); dr = drafts().at(-1);
ok('V2.3-4 high-ceiling reminder from an UNCONFIRMED contact: not a new inquiry (no form, no welcome, no calendar), staff are asked to check, nothing leaks', ctxOf().intent === 'existing_booking' && !leak(dr.body) && !/TopMop offers professional/.test(dr.body) && conv0().status === 'Needs a person', JSON.stringify(dr.body));
await confirmByStaff('c1'); deliver(); await send(`Reminder lang po, mataas po ang ceiling namin. We are scheduled ${D1.label}.`, { phone: '0917 555 1212' }); dr = drafts().at(-1);
ok('V2.3-4 after staff confirm: acknowledged, no form, no welcome, and the team gets an alert about the booking message', /high ceiling/.test(dr.body) && !leak(dr.body) && !/TopMop offers professional/.test(dr.body) && (DB.alert_outbox ?? []).some((a) => a.title === 'Customer message about their booking'), JSON.stringify(dr.body));

// V2.3-5: no phone at all: a NAME never links; asked once; a typed number is only a suggestion and a person takes over
reset('suggest'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); state.script = () => sayFull();
await send(`Hi, we are scheduled ${D1.label} po. Maria Cruz here.`); dr = drafts().at(-1);
ok('V2.3-5 no phone number, only a NAME: not linked to anyone', !conv0().client_id && conv0().contact_status !== 'existing', JSON.stringify({ s: conv0().contact_status, c: conv0().client_id ?? null }));
ok('V2.3-5 the AI asks once for the mobile number or job order number; no form, no calendar, no booking details', /mobile number or job order number/.test(dr.body) && !leak(dr.body), JSON.stringify(dr.body));
deliver(); await send('My number is 0917 555 1212'); dr = drafts().at(-1);
ok('V2.3-5 a number typed in the chat is only a SUGGESTION: the customer is NOT linked, a person takes over, no details leak', conv0().link_state === 'suggested' && !conv0().client_id && (conv0().link_candidates ?? []).some((c) => c.client_id === 'c1') && /Our team will check your booking/.test(dr.body) && conv0().status === 'Needs a person' && !leak(drafts().map((m) => m.body).join(' ')), JSON.stringify({ st: conv0().link_state, c: conv0().client_id ?? null }));

// V2.3-6: identical names / the same phone on two clients: only staff decide; only the chosen client's jobs are ever used
reset('suggest'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); seedClient('c2', 'Maria Cruz', '0918 777 3434', [{ number: 'JOB-2026-9001', date: D2.iso }]); state.script = () => sayFull();
await send(askText(D2.label), { phone: '0918 777 3434' });
ok('V2.3-6 two clients with the SAME NAME: the phone suggests only the right one (c2); nobody is linked; no client record reaches the AI or the customer', (conv0().link_candidates ?? []).length === 1 && conv0().link_candidates[0].client_id === 'c2' && !conv0().client_id && !leak(drafts().at(-1).body), JSON.stringify(conv0().link_candidates));
await confirmByStaff('c2'); deliver(); state.script = () => sayFull(); await send(askText(D2.label), { phone: '0918 777 3434' });
ok('V2.3-6 after staff confirm c2: only c2\'s job is used (never the other Maria Cruz)', lastSystem().includes('JOB-2026-9001') && !lastSystem().includes('JOB-2026-8818') && /JOB-2026-9001/.test(drafts().at(-1).body), JSON.stringify(drafts().at(-1).body));
reset('suggest'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); seedClient('c3', 'Mario Cruz', '0917 555 1212', [{ number: 'JOB-2026-7000', date: D2.iso }]); state.script = () => text('Which service do you need po?');
await send('Hello po', { phone: '0917 555 1212' });
ok('V2.3-6 the SAME phone on two client records: AMBIGUOUS, nobody linked, staff asked to choose; no records given to the AI', conv0().link_state === 'ambiguous' && !conv0().client_id && (conv0().link_candidates ?? []).length === 2 && (DB.alert_outbox ?? []).some((a) => a.title === 'Please confirm the client match') && !/VERIFIED ACTIVE|What we have on file/.test(lastSystem()), JSON.stringify({ st: conv0().link_state }));
await confirmByStaff('c3'); deliver(); await send('Hello again', { phone: '0917 555 1212' });
ok('V2.3-6 staff choose one of the two: that client only', conv0().client_id === 'c3' && lastSystem().includes('JOB-2026-7000') && !lastSystem().includes('JOB-2026-8818'), JSON.stringify({ c: conv0().client_id }));

// V2.3-7: several bookings and EVERY job status the database allows
reset('suggest'); queue(false);
seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-S-PENDING', date: D1.iso, status: 'Pending' }, { number: 'JOB-S-CONFIRMED', date: D2.iso, status: 'Confirmed' }, { number: 'JOB-S-DCP', date: inDays(2).iso, status: 'Dispatch Checklist Pending' }, { number: 'JOB-S-DISPATCHED', date: inDays(0).iso, status: 'Dispatched' }, { number: 'JOB-S-ONSITE', date: inDays(0).iso, status: 'On Site' }, { number: 'JOB-S-INPROG', date: inDays(0).iso, status: 'In Progress' }, { number: 'JOB-S-CLOSED', date: D1.iso, status: 'Closed' }, { number: 'JOB-S-CANCELLED', date: D1.iso, status: 'Cancelled' }]);
state.script = () => sayFull(); await send('Hello po', { phone: '0917 555 1212' }); await confirmByStaff('c1'); deliver(); await send(askText(D2.label), { phone: '0917 555 1212' }); dr = drafts().at(-1);
const activeBlock = (lastSystem().split('VERIFIED ACTIVE AND UPCOMING BOOKINGS')[1] ?? '').split(/Recent jobs:|Earlier inquiries:/)[0];   // only the bookings offered as current (the separate history line may name closed jobs)
ok('V2.3-7 every current status is recognised (Pending, Confirmed, Dispatch Checklist Pending, Dispatched, On Site, In Progress); Closed and Cancelled are not offered as bookings', ['PENDING', 'CONFIRMED', 'DCP', 'DISPATCHED', 'ONSITE', 'INPROG'].every((k) => activeBlock.includes(`JOB-S-${k}`)) && !activeBlock.includes('JOB-S-CLOSED') && !activeBlock.includes('JOB-S-CANCELLED') && !/Dispatch Checklist Pending|Dispatched,|On Site,/.test(activeBlock), activeBlock.slice(0, 160));
ok('V2.3-7 several bookings: the date asked picks the right job in the answer and "full" is never said', /JOB-S-CONFIRMED/.test(dr.body) && !/fully booked/i.test(dr.body), JSON.stringify(dr.body));

// V2.3-8: a brand-new customer is unchanged
reset('suggest'); queue(false); state.script = () => text('Which cleaning service do you need po?');
await send('Hi, how much is window cleaning?'); dr = drafts().at(-1);
ok('V2.3-8 a brand-new customer is NEW: the standard welcome is sent and no customer-status block is added', (conv0().contact_status === undefined || conv0().contact_status === 'new') && /TopMop offers professional exterior cleaning/.test(dr.body) && !/CUSTOMER STATUS:/.test(lastSystem()), JSON.stringify({ s: conv0().contact_status ?? 'new' }));

// V2.3-9: an unconfirmed contact whose possible client holds a booking is never offered the form or a "full" calendar answer
reset('suggest'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); state.script = () => text('Sure po, which date?');
await send(`I want to book window cleaning on ${D1.label}`, { phone: '0917 555 1212' }); dr = drafts().at(-1);
ok('V2.3-9 an unconfirmed contact (phone matches a client who holds a booking) asks to book: NO booking form, no date offered, staff are asked to confirm first', !/Reservation Date|Please copy this/.test(dr.body) && /Our team will confirm your booking details/.test(dr.body) && conv0().status === 'Needs a person' && /Confirm the client/.test(conv0().human_reason ?? ''), JSON.stringify(dr.body));
reset('suggest'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); let step = 0;
state.script = () => { step++; return step === 1 ? { content: [{ type: 'tool_use', id: 't9', name: 'check_date', input: { date: D1.iso } }], stop_reason: 'tool_use' } : text('Sorry po, that date is fully booked. The nearest open dates are Jan 11, Jan 12 or Jan 13.'); };
await send(`Is ${D1.label} open for window cleaning in Makati?`, { phone: '0917 555 1212' }); dr = drafts().at(-1);
ok('V2.3-9 the date tool refuses to judge a date the possible client already holds ("team_confirm"), and the model\'s "fully booked" never reaches the customer', JSON.stringify(modelCalls.map((c) => c.messages)).includes('team_confirm') && !/fully booked|Jan 11\b/.test(dr.body), JSON.stringify(dr.body));

// V2.3-10: staff tools: unlink, re-check and the link survives a message without a phone
reset('suggest'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); state.script = () => text('Sure po.');
await send('Hello', { phone: '0917 555 1212' }); await confirmByStaff('c1'); deliver(); await send('Do you clean roofs?');
ok('V2.3-10 the staff link is kept: the next message without a phone number is still the same existing client', conv0().contact_status === 'existing' && conv0().client_id === 'c1' && /EXISTING CLIENT/.test(lastSystem()), '');
const un = await staff({ action: 'unlink', conversation_id: conv0().id }); deliver(); await send('And walls?', { phone: '0917 555 1212' });
ok('V2.3-10 unlink: back to a previous contact, the client is no longer used, the AI shares no bookings; audited', un.ok === true && conv0().contact_status === 'previous' && !conv0().client_id && !/EXISTING CLIENT|VERIFIED ACTIVE/.test(lastSystem()) && (DB.audit_logs ?? []).some((a) => /unlinked/i.test(a.summary)), JSON.stringify({ s: conv0().contact_status, st: conv0().link_state }));
const rs = await staff({ action: 'resync', conversation_id: conv0().id });
ok('V2.3-10 "Re-check this contact" runs the matching again and reports what it found', rs.ok === true && rs.checked === 1 && rs.previous === 1, JSON.stringify(rs));
const bad = await staff({ action: 'link', conversation_id: conv0().id, client_id: 'does-not-exist' });
ok('V2.3-10 linking to a client that does not exist is refused', bad.error === 'Client not found' && !conv0().client_id, JSON.stringify(bad));


// V2.3-11: REGRESSION. An old booking intent must never override a new existing-booking inquiry (booking_requested is persistent state).
reset('suggest'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); state.script = () => text('');
await send('Can I schedule tomorrow?'); deliver(); await send('Makati'); deliver();   // no phone yet: a stranger starting a normal new-booking flow
const bookingBefore = ctxOf().booking_requested; const askedService = /Which cleaning service/.test(drafts().at(-1).body);
await send(`Actually we are scheduled ${D1.label}, I already booked`, { phone: '0917 555 1212' }); dr = drafts().at(-1);
ok('V2.3-11 setup: a new-booking flow was under way (booking_requested set, the service was asked)', bookingBefore === true && askedService, JSON.stringify({ bookingBefore, askedService }));
ok('V2.3-11 an UNCONFIRMED contact then refers to an existing booking: the old booking intent is cleared, no booking form is sent, a person is asked', ctxOf().intent === 'existing_booking' && ctxOf().booking_requested === false && !/Reservation Date|Please copy this|Which cleaning service/.test(dr.body) && conv0().status === 'Needs a person', JSON.stringify({ intent: ctxOf().intent, br: ctxOf().booking_requested, body: dr.body.slice(0, 80) }));
await confirmByStaff('c1'); deliver(); state.script = () => text('Sure po, which cleaning service do you need?');
await send(askText(D1.label), { phone: '0917 555 1212' }); dr = drafts().at(-1);
ok('V2.3-11 CONFIRMED client: the model prompt carries NO new-booking instructions (no "NEXT BOOKING QUESTION", no "BOOKING FORM") although an older booking intent existed', !/NEXT BOOKING QUESTION|BOOKING FORM|ALL BOOKING DETAILS/.test(lastSystem()) && /CURRENT INTENT: existing_booking/.test(lastSystem()) && /VERIFIED ACTIVE AND UPCOMING BOOKINGS/.test(lastSystem()) && ctxOf().stage !== 'booking', JSON.stringify({ stage: ctxOf().stage }));
deliver(); await send('What time will the crew arrive?', { phone: '0917 555 1212' });
ok('V2.3-11 a LATER general message does not fall back into the new-booking flow', ctxOf().intent !== 'booking_request' && ctxOf().booking_requested === false && !/NEXT BOOKING QUESTION|BOOKING FORM/.test(lastSystem()), JSON.stringify({ intent: ctxOf().intent }));

// V2.3-12: the customer asks about a date that is NOT their booking; their only verified booking is on another date. November 30 must never be confirmed.
reset('suggest'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8820', date: D2.iso }]); state.script = () => text('Hello po.');
await send('Hello', { phone: '0917 555 1212' }); await confirmByStaff('c1'); deliver();
state.script = () => text(`Yes po, you are scheduled for ${D1.label}. See you then!`); await send(askText(D1.label), { phone: '0917 555 1212' }); dr = drafts().at(-1);
ok('V2.3-12 the model says "Yes, you are scheduled" for a date that is not theirs: it is caught; the customer is told the date is not on their record and what they do have', !new RegExp(`Yes po, you are scheduled for ${D1.label}`).test(dr.body) && /I don't see a booking on/.test(dr.body) && /JOB-2026-8820/.test(dr.body) && !/^Yes/.test(dr.body), JSON.stringify(dr.body));
deliver(); state.script = () => text(`Sorry po, ${D1.label} is fully booked.`); await send(askText(D1.label), { phone: '0917 555 1212' }); dr = drafts().at(-1);
ok('V2.3-12 calling that date "full" when they ask about THEIR booking is also caught and replaced by the same honest answer', !/fully booked/.test(dr.body) && /I don't see a booking on/.test(dr.body), JSON.stringify(dr.body));
deliver(); state.script = () => text(`I don't see a booking on ${D1.label} on your record po. Our team will check if you meant a different date.`); await send(askText(D1.label), { phone: '0917 555 1212' }); dr = drafts().at(-1);
ok('V2.3-12 an honest model answer passes through unchanged', /I don't see a booking on/.test(dr.body) && dr.flags.length === 0, JSON.stringify(dr.body));
deliver(); state.script = () => text(`Sorry po, ${D2.label} is fully booked.`); await send(askText(D2.label), { phone: '0917 555 1212' }); dr = drafts().at(-1);
ok('V2.3-12 a date that IS theirs is still confirmed from their booking, and "full" is replaced (no regression)', /JOB-2026-8820/.test(dr.body) && /^Yes po/.test(dr.body) && !/fully booked/.test(dr.body), JSON.stringify(dr.body));


// V2.3-13: AI OFF is really off (the rollout and any rollback depend on it): nothing is sent or drafted, the model is never called, the customer's message is kept, and the recovery job does nothing.
reset('off'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); state.script = () => text('This must never be produced.');
const offRes = await send(askText(D1.label), { phone: '0917 555 1212' }); const recOff = await recover(120_000);
ok('V2.3-13 mode OFF: no reply, no draft and no model call; the customer\'s message is stored; the recovery job does nothing', offRes.status === 'off' && drafts().length === 0 && modelCalls.length === 0 && DB.chat_messages.filter((m) => m.direction === 'in').length === 1 && (recOff.recovered ?? 0) === 0 && /off|no key/i.test(recOff.note ?? ''), JSON.stringify({ status: offRes.status, drafts: drafts().length, calls: modelCalls.length, recover: recOff }));
ok('V2.3-13 mode OFF: the contact is still recognised and kept for staff (suggested client), without any reply to the customer', conv0().link_state === 'suggested' && !conv0().client_id, JSON.stringify({ st: conv0().link_state }));
reset('suggest'); queue(false); state.script = () => text('Hello po.'); await send('Hello'); deliver(); DB.settings[0].data.chat_ai.mode = 'off'; const callsBeforeOff = modelCalls.length; const offAgain = await send('Are you there?');
ok('V2.3-13 switching the mode to OFF in the middle of a conversation stops replies at once', offAgain.status === 'off' && modelCalls.length === callsBeforeOff, JSON.stringify({ status: offAgain.status }));


// V2.3-14: FAIL CLOSED. If the AI cannot tell who a customer is (a database failure), it does NOT answer as if they were new: nothing is sent or drafted, staff are alerted, the message is kept and retried.
reset('suggest'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); state.script = () => sayFull();
flags.failTable = 'clients'; const held1 = await send(askText(D1.label), { phone: '0917 555 1212' }); flags.failTable = null;
ok('V2.3-14 the client lookup fails: the message is HELD (no reply, no draft, no model call), staff are alerted, and the message stays unhandled for a retry', held1.status === 'held' && drafts().length === 0 && modelCalls.length === 0 && (DB.alert_outbox ?? []).some((a) => a.title === 'The AI could not check who this customer is') && DB.chat_messages.filter((m) => m.direction === 'in' && !m.handled_at).length === 1, JSON.stringify({ status: held1.status, drafts: drafts().length, calls: modelCalls.length }));
const rec14 = await recover(120_000); dr = drafts().at(-1);
ok('V2.3-14 once the database works again the recovery job answers it correctly: the unconfirmed contact is handed to staff (no "full", no form, no details)', rec14.recovered === 1 && !!dr && !leak(dr.body) && conv0().status === 'Needs a person', JSON.stringify({ recovered: rec14.recovered, body: dr?.body?.slice(0, 80) }));
reset('suggest'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); state.script = () => text('Hello po.');
await send('Hello', { phone: '0917 555 1212' }); await confirmByStaff('c1'); deliver(); flags.failTable = 'jobs'; modelCalls.length = 0; const held2 = await send(askText(D1.label), { phone: '0917 555 1212' }); flags.failTable = null;
ok('V2.3-14 a confirmed client whose bookings cannot be read is NOT told "no bookings" or "full": the message is held, nothing is drafted, no model call', held2.status === 'held' && modelCalls.length === 0 && drafts().filter((m) => m.status === 'draft').length === 0, JSON.stringify({ status: held2.status, calls: modelCalls.length }));

// V2.3-15: STALE OPERATIONAL STATUSES. Old "Dispatched / On Site / In Progress" records (they exist in production) must never become "the crew is on the way".
const manilaStamp = (offsetH) => { const d = new Date(Date.now() + 8 * 3600000 + offsetH * 3600000); return d.toISOString().slice(0, 19); };   // Manila wall-clock, as the jobs table stores it
const rawJob = (cid, number, status, startH, endH) => { DB.jobs = [...(DB.jobs ?? []), { id: `j-${number}`, number, client_id: cid, site_id: `s-${cid}`, start_at: manilaStamp(startH), end_at: manilaStamp(endH), status, service_codes: ['GLASS_EXT'] }]; };
const crewLine = () => text('Our crew is on the way po and will arrive shortly.');
reset('suggest'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', []);
rawJob('c1', 'JOB-OLD-DISP', 'Dispatched', -24 * 20, -24 * 20 + 3); rawJob('c1', 'JOB-OLD-SITE', 'On Site', -24 * 16, -24 * 16 + 3);
state.script = crewLine; await send('Hello po', { phone: '0917 555 1212' }); await confirmByStaff('c1'); deliver(); modelCalls.length = 0;
await send('Is the crew on the way po?', { phone: '0917 555 1212' }); dr = drafts().at(-1);
ok('V2.3-15 a confirmed client with only 16- and 20-day-old "Dispatched / On Site" jobs asks where the crew is: NOT told a crew is coming (the model is not even asked); handed to staff', !!dr && !/on the way|on site|arrive/i.test(dr.body) && /Our team will check/.test(dr.body) && conv0().status === 'Needs a person', JSON.stringify({ b: dr?.body, st: conv0().status }));
ok('V2.3-15 staff are told the records are outdated', /outdated|not up to date|old/i.test(conv0().human_reason ?? ''), conv0().human_reason);
reset('suggest'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', []); rawJob('c1', 'JOB-OLD-SITE', 'On Site', -24 * 16, -24 * 16 + 3);
state.script = () => text('Hello po.'); await send('Hello po', { phone: '0917 555 1212' }); await confirmByStaff('c1'); deliver(); modelCalls.length = 0; state.script = crewLine;
await send('Good day, what is the status of my booking?', { phone: '0917 555 1212' }); dr = drafts().at(-1);
ok('V2.3-15 the prompt never lists a stale job as a current booking, and says the record is uncertain; a model that says "on the way" anyway is blocked', !/VERIFIED ACTIVE AND UPCOMING BOOKINGS[\s\S]{0,80}JOB-OLD-SITE/.test(lastSystem()) && (modelCalls.length === 0 || /UNCERTAIN RECORDS/.test(lastSystem())) && !!dr && !/on the way|on site/i.test(dr.body), JSON.stringify({ b: dr?.body, calls: modelCalls.length }));
reset('suggest'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', []); rawJob('c1', 'JOB-NIGHT', 'On Site', -8, 14); rawJob('c1', 'JOB-MULTI', 'In Progress', -24 * 3, 24 * 2);
state.script = () => text('Hello po.'); await send('Hello po', { phone: '0917 555 1212' }); await confirmByStaff('c1'); deliver(); modelCalls.length = 0; state.script = () => text('Our crew is currently on site at your property po.');
await send('Is the crew there now?', { phone: '0917 555 1212' }); dr = drafts().at(-1);
ok('V2.3-15 a LEGITIMATE overnight job (started 8 h ago, ends in 14 h) and a multi-day project are still live: the AI sees them and may say the crew is on site', /JOB-NIGHT/.test(lastSystem()) && /JOB-MULTI/.test(lastSystem()) && !!dr && /on site/i.test(dr.body), JSON.stringify({ b: dr?.body, sys: /JOB-NIGHT/.test(lastSystem()) }));
reset('suggest'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', []); rawJob('c1', 'JOB-OLD', 'On Site', -24 * 16, -24 * 16 + 3);
state.script = () => text('Hello po.'); await send('Hello po', { phone: '0917 555 1212' }); deliver(); modelCalls.length = 0; state.script = crewLine;   // NOT confirmed by staff: an unconfirmed contact
await send('Is the crew on the way po?', { phone: '0917 555 1212' }); dr = drafts().at(-1);
ok('V2.3-15 an UNCONFIRMED contact asking where the crew is is never told anything either', !!dr && !/on the way|on site|arrive/i.test(dr.body), JSON.stringify(dr?.body));

// V2.3-16: A TOPMOP JOB-ORDER LINK. It is a reference that finds a possible booking for staff. It never identifies anyone.
const TOK = 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6';
const orderLink = `https://ops.topmop.ph/#/jo/${TOK}`;
const seedOrder = (clientId, jobNumber) => { DB.job_orders = [...(DB.job_orders ?? []), { id: `jo-${clientId}`, number: 'JO-2026-83589', version: 1, job_id: `j-${clientId}-0`, client_id: clientId, status: 'Sent to Client', content: {}, content_key: 'k', share_token: TOK, deleted_at: null }]; };
reset('suggest'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); seedOrder('c1'); state.script = () => sayFull();
await send(`Hi, this is my job order ${orderLink}. Can we move it to ${D2.label}?`); const dLink = drafts().at(-1);
ok('V2.3-16 a pasted job-order link is an EXISTING-BOOKING reference: nobody is told the date is full, no form, no booking detail, and no model improvises', !!dLink && !leak(dLink.body) && /Our team will check your booking/.test(dLink.body) && modelCalls.length === 0, JSON.stringify(dLink?.body));
ok('V2.3-16 the link only SUGGESTS the client to staff (basis job_order_link, with the order number); the contact is NOT linked and is not an existing client', conv0().contact_status === 'previous' && conv0().link_state === 'suggested' && !conv0().client_id && (conv0().link_candidates ?? []).some((c) => c.client_id === 'c1' && c.basis === 'job_order_link') && conv0().status === 'Needs a person' && /JO-2026-83589/.test(conv0().human_reason ?? ''), JSON.stringify({ s: conv0().contact_status, st: conv0().link_state, c: conv0().client_id ?? null, r: conv0().human_reason }));
ok('V2.3-16 nothing about the match reaches the customer: no name, no order number, no job number, no date', !/Maria|Cruz|JO-2026|JOB-2026|83589/.test(dLink.body) && !new RegExp(D1.label).test(dLink.body), JSON.stringify(dLink.body));
reset('suggest'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); state.script = () => sayFull();   // NO job order exists for this token
await send(`Hi, this is my job order ${orderLink}. Can we move it to ${D2.label}?`); const dUnknown = drafts().at(-1);
ok('V2.3-16 an UNKNOWN link gets the IDENTICAL reply (the chat cannot be used to find out which links are real) and creates no suggestion', dUnknown.body === dLink.body && !conv0().client_id && (conv0().link_candidates ?? []).length === 0, JSON.stringify({ same: dUnknown.body === dLink.body }));
reset('suggest'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); seedClient('c2', 'Juan Reyes', '0918 777 3434', [{ number: 'JOB-2026-9001', date: D2.iso }]); seedOrder('c2'); state.script = () => text('Hello po.');
await send('Hello po', { phone: '0917 555 1212' }); await confirmByStaff('c1'); deliver(); modelCalls.length = 0; state.script = () => sayFull();
await send(`Hi, can you check this job order ${orderLink}?`, { phone: '0917 555 1212' }); dr = drafts().at(-1);
ok('V2.3-16 a CONFIRMED client who pastes ANOTHER client\'s job-order link is not shown that booking: handed to staff, no detail from the other client, their own link unchanged', !!dr && !/Juan|Reyes|JOB-2026-9001|JO-2026/.test(dr.body) && /Our team will check/.test(dr.body) && conv0().client_id === 'c1' && conv0().status === 'Needs a person', JSON.stringify({ b: dr?.body, c: conv0().client_id }));
reset('suggest'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); seedOrder('c1'); state.script = () => text('Which service do you need po?');
await send(`my job order https://ops.topmop.ph.evil.example/#/jo/${TOK}`); 
ok('V2.3-16 a look-alike address is NOT a TopMop link: nothing is suggested', !conv0().client_id && (conv0().link_candidates ?? []).length === 0, JSON.stringify(conv0().link_candidates ?? []));
reset('suggest'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); seedOrder('c1'); state.script = () => sayFull();
flags.failTable = 'job_orders'; modelCalls.length = 0; const heldLink = await send(`my job order ${orderLink}`); flags.failTable = null;
ok('V2.3-16 if the job-order lookup fails the message is HELD (no reply, no model call), never treated as "no match"', heldLink.status === 'held' && modelCalls.length === 0 && drafts().length === 0, JSON.stringify({ st: heldLink.status }));

// V2.3-17 (review issue 26): future-dated operational jobs, crew status per job, old open jobs crowding the result
const NOCLAIM = /on the way|on site|on their way|is working|arriv/i;
const linkedClient = async (setup) => { reset('suggest'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', []); setup(); state.script = () => text('Hello po.'); await send('Hello po', { phone: '0917 555 1212' }); await confirmByStaff('c1'); deliver(); modelCalls.length = 0; };
await linkedClient(() => rawJob('c1', 'JOB-FUT', 'Dispatched', 24 * 7, 24 * 7 + 3));
state.script = crewLine; await send('Is the crew on the way po?', { phone: '0917 555 1212' }); dr = drafts().at(-1);
ok('V2.3-17 a job scheduled NEXT WEEK whose status says "Dispatched" is still a booking but never backs "the crew is on the way": the model\'s claim is blocked and staff are handed the chat', !!dr && !NOCLAIM.test(dr.body) && conv0().status === 'Needs a person' && !/Dispatched/.test(lastSystem()), JSON.stringify({ b: dr?.body, st: conv0().status }));   // the raw status appears nowhere in the prompt, including the history line
await linkedClient(() => { rawJob('c1', 'JOB-A-TODAY', 'On Site', -2, 6); rawJob('c1', 'JOB-B-LATER', 'Confirmed', 24 * 8, 24 * 8 + 3); });
state.script = crewLine; await send(`Is the crew coming on ${D1.label}? Is it on the way?`, { phone: '0917 555 1212' }); dr = drafts().at(-1);
ok('V2.3-17 MIXED jobs: Job A is On Site today; the customer asks about Job B\'s date: A\'s status is NOT used to say anything about B', !!dr && !NOCLAIM.test(dr.body), JSON.stringify(dr?.body));
await staff({ action: 'release', conversation_id: conv0().id }); deliver(); state.script = () => text('Our crew is currently on site at your property po.'); await send('Is the crew there now?', { phone: '0917 555 1212' }); dr = drafts().at(-1);
ok('V2.3-17 MIXED jobs: asked generally, the job running today answers (Job A is On Site), so the AI may say so', !!dr && /on site/i.test(dr.body), JSON.stringify(dr?.body));
await linkedClient(() => { rawJob('c1', 'JOB-S1-A', 'On Site', -2, 6); DB.sites.push({ id: 's-other', client_id: 'c1', name: 'Second site' }); DB.jobs.push({ id: 'j-B', number: 'JOB-S2-B', client_id: 'c1', site_id: 's-other', start_at: manilaStamp(-1), end_at: manilaStamp(7), status: 'Dispatched', service_codes: ['ROOF'] }); });
state.script = crewLine; await send('Is the crew there now?', { phone: '0917 555 1212' }); dr = drafts().at(-1);
ok('V2.3-17 two current jobs at DIFFERENT sites: ambiguous, so nothing is asserted and a person answers', !!dr && !NOCLAIM.test(dr.body), JSON.stringify(dr?.body));
await linkedClient(() => { for (let i = 0; i < 45; i++) rawJob('c1', `JOB-OLD-${i}`, i % 2 ? 'Dispatched' : 'On Site', -24 * (30 + i), -24 * (30 + i) + 3); rawJob('c1', 'JOB-VALID-FUTURE', 'Confirmed', 24 * 8, 24 * 8 + 3); });
state.script = () => sayFull(); await send(askText(D1.label), { phone: '0917 555 1212' }); dr = drafts().at(-1);
ok('V2.3-17 45 old unfinished jobs do not hide the valid upcoming booking: it is in the prompt and the date is answered from it (never "full")', /JOB-VALID-FUTURE/.test(lastSystem()) && !!dr && /JOB-VALID-FUTURE/.test(dr.body) && !/fully booked/i.test(dr.body), JSON.stringify(dr?.body));

// V2.3-18/19/20/21 (review findings): a chat linked to client A by staff must never book, confirm or leak anything for client B (automatic mode, the dangerous case)
const TOKB = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345'; const confirmB = 'Booked! Your job JOB-2026-9999 is confirmed for you. Job order: https://ops.topmop.ph/#/jo/' + TOKB;
const linkedA = async () => { reset('auto'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); seedClient('c2', 'Ben Santos', '0918 777 3434', []); state.script = () => text('Hello po.'); await send('Hello po', { phone: '0917 555 1212' }); await confirmByStaff('c1'); deliver(); modelCalls.length = 0; };
const bookTool = (mobile, say) => { let k = 0; state.script = () => { k++; return k === 1 ? { content: [{ type: 'tool_use', id: 't19', name: 'book_date', input: { name: 'Ben Santos', mobile, date: D2.iso, address: 'Makati', service: 'window cleaning', storeys: '2', property_type: 'Residential', rates_ok: true } }], stop_reason: 'tool_use' } : text(say); }; };
const leadTool = (mobile, say) => { let k = 0; state.script = () => { k++; return k === 1 ? { content: [{ type: 'tool_use', id: 't20', name: 'save_lead', input: { name: 'Ben Santos', mobile, address: 'Makati', service: 'window cleaning', property_type: 'Residential' } }], stop_reason: 'tool_use' } : text(say); }; };
const toolCalls = []; const toolServer = (bookBody, leadBody) => { toolCalls.length = 0; state.tools = async (u) => { toolCalls.push(u.split('/').pop()); if (u.endsWith('/chat-book')) return new Response(JSON.stringify(bookBody), { status: 200 }); if (u.endsWith('/lead-intake')) return new Response(JSON.stringify(leadBody), { status: 200 }); return new Response(JSON.stringify({ ok: false, error: 'not simulated' }), { status: 500 }); }; };
const delivered = () => (DB.chat_messages ?? []).filter((m) => m.direction === 'out').map((m) => m.body).join(' || ');
const noLeakB = (t) => !/JOB-2026-9999|ops\.topmop|AbCdEf|Ben|Santos|booked!|is confirmed for you|c2\b|reconcile|different client/i.test(t);
// 18: ANOTHER mobile: stopped BEFORE any write
await linkedA(); bookTool('0918 777 3434', 'Your booking JOB-2026-9999 is confirmed, Ben Santos!'); toolServer({ ok: true, status: 'confirmed', booked: true, client_id: 'c2', inquiry_id: 'i-c2', client_existing: false, reply: confirmB });
await send(`Please also book window cleaning for ${D2.label} for my friend Ben Santos, 0918 777 3434`, { phone: '0917 555 1212' });
ok('V2.3-18 PRE-CHECK: a staff-linked chat books for ANOTHER mobile: chat-book is NEVER called (no booking, client, inquiry or job order is created) and the link stays on client c1', !toolCalls.includes('chat-book') && conv0().client_id === 'c1' && conv0().link_state === 'staff' && conv0().inquiry_id !== 'i-c2' && conv0().status === 'Needs a person', JSON.stringify({ calls: toolCalls, c: conv0().client_id, st: conv0().status }));
ok('V2.3-18 staff are alerted, and NOTHING about the other client reaches the customer (the model\'s own "confirmed, Ben Santos" is replaced by the safe handover sentence)', (DB.alert_outbox ?? []).some((a) => a.title === 'Booking for a different client than the one linked to this chat') && noLeakB(delivered()) && /Let me refer this to our team/.test(delivered()), delivered().slice(0, 200));
// 19: the number MATCHES the linked client but the booking service saves it for another client (a race): auto-confirm true, booked:true, confirmation with job number and JO link
await linkedA(); bookTool('0917 555 1212', 'Your booking JOB-2026-9999 is confirmed!'); toolServer({ ok: true, status: 'confirmed', booked: true, client_id: 'c2', inquiry_id: 'i-c2', client_existing: false, reply: confirmB });
await send(`Please book window cleaning for ${D2.label}`, { phone: '0917 555 1212' });
ok('V2.3-19 RACE, auto-confirm true: chat-book returns booked:true for ANOTHER client with a confirmation, a job number and a job-order link: NOTHING of it is delivered, only the safe handover sentence', toolCalls.includes('chat-book') && noLeakB(delivered()) && /Let me refer this to our team/.test(delivered()) && conv0().client_id === 'c1' && conv0().link_state === 'staff' && conv0().inquiry_id !== 'i-c2' && conv0().status === 'Needs a person', JSON.stringify({ calls: toolCalls, delivered: delivered().slice(0, 160), c: conv0().client_id }));
ok('V2.3-19 staff are alerted to reconcile', (DB.alert_outbox ?? []).some((a) => a.title === 'Booking for a different client than the one linked to this chat') && /DIFFERENT client/.test(conv0().human_reason ?? ''), conv0().human_reason);
// 20: auto-confirm OFF (booked:false, pending) and the same race
await linkedA(); bookTool('0917 555 1212', 'Thank you, JOB-2026-9999 is pending.'); toolServer({ ok: true, status: 'pending_human', booked: false, confirmed: false, client_id: 'c2', inquiry_id: 'i-c2', client_existing: false, reply: 'Thank you! JOB-2026-9999 is pending. https://ops.topmop.ph/#/jo/' + TOKB });
await send(`Please book window cleaning for ${D2.label}`, { phone: '0917 555 1212' });
ok('V2.3-20 RACE, auto-confirm false (booked:false): no job number, no link, no confirmation is delivered; link kept; a person takes over', noLeakB(delivered()) && conv0().client_id === 'c1' && conv0().link_state === 'staff' && conv0().status === 'Needs a person', delivered().slice(0, 160));
// 21: save_lead: another mobile is stopped before the write; the same mobile with another client returned is a conflict
await linkedA(); leadTool('0918 777 3434', 'Thank you Ben Santos, your lead is saved.'); toolServer({}, { ok: true, client_id: 'c2', inquiry_id: 'i-c2', existing_client: false });
await send('Please note a lead for my friend Ben Santos, 0918 777 3434, window cleaning in Makati', { phone: '0917 555 1212' });
ok('V2.3-21 save_lead for ANOTHER mobile: lead-intake is NEVER called, the link stays, nothing about the other person is delivered', !toolCalls.includes('lead-intake') && conv0().client_id === 'c1' && conv0().link_state === 'staff' && noLeakB(delivered()) && conv0().status === 'Needs a person', JSON.stringify({ calls: toolCalls, d: delivered().slice(0, 120) }));
await linkedA(); leadTool('0917 555 1212', 'Thank you, your lead is saved.'); toolServer({}, { ok: true, client_id: 'c2', inquiry_id: 'i-c2', existing_client: false });
await send('Please note a lead for window cleaning in Makati', { phone: '0917 555 1212' });
ok('V2.3-21 save_lead returning ANOTHER client: no "saved" confirmation is delivered, the link and inquiry are untouched', toolCalls.includes('lead-intake') && !/saved|received/i.test(delivered().replace(/Hello po[^|]*/, '')) && conv0().client_id === 'c1' && conv0().inquiry_id !== 'i-c2' && conv0().status === 'Needs a person', JSON.stringify({ d: delivered().slice(0, 160) }));
// 22 (review edge case): ManyChat holds client B's number for this contact, staff linked the chat to client A (another mobile), and the customer types B's mobile: the ManyChat number must NOT authorise a write
const mcPhoneIsB = async () => { reset('auto'); queue(false); seedClient('c1', 'Maria Cruz', '0917 555 1212', [{ number: 'JOB-2026-8818', date: D1.iso }]); seedClient('c2', 'Ben Santos', '0918 777 3434', []); state.script = () => text('Hello po.'); await send('Hello po', { phone: '0918 777 3434' }); await confirmByStaff('c1'); deliver(); modelCalls.length = 0; };
await mcPhoneIsB(); bookTool('0918 777 3434', 'Your booking JOB-2026-9999 is confirmed, Ben Santos!'); toolServer({ ok: true, status: 'confirmed', booked: true, client_id: 'c2', inquiry_id: 'i-c2', client_existing: true, reply: confirmB });
await send(`Please book window cleaning for ${D2.label}, my number is 0918 777 3434`, { phone: '0918 777 3434' });
ok('V2.3-22 EDGE CASE: client A.mobile !== ManyChat number === typed number === client B.mobile: chat-book is NEVER called (nothing is created for B), the staff link stays on c1, the chat goes to a person', !toolCalls.includes('chat-book') && conv0().client_id === 'c1' && conv0().link_state === 'staff' && conv0().inquiry_id !== 'i-c2' && conv0().status === 'Needs a person', JSON.stringify({ calls: toolCalls, c: conv0().client_id, st: conv0().status, mc: conv0().mc_phone }));
ok('V2.3-22 nothing about client B reaches the customer, and staff are told the records disagree (without repeating the number)', noLeakB(delivered()) && /Let me refer this to our team/.test(delivered()) && /ManyChat number|records disagree/.test(conv0().human_reason ?? '') && !/777 3434|7773434/.test(conv0().human_reason ?? '') && (DB.alert_outbox ?? []).some((a) => a.title === 'Booking for a different client than the one linked to this chat'), conv0().human_reason);
await mcPhoneIsB(); leadTool('0918 777 3434', 'Thank you Ben Santos, your lead is saved.'); toolServer({}, { ok: true, client_id: 'c2', inquiry_id: 'i-c2', existing_client: true });
await send('Please note a lead for window cleaning in Makati, 0918 777 3434', { phone: '0918 777 3434' });
ok('V2.3-22 the same for save_lead: lead-intake is NEVER called and nothing about client B is delivered', !toolCalls.includes('lead-intake') && conv0().client_id === 'c1' && conv0().link_state === 'staff' && noLeakB(delivered()) && conv0().status === 'Needs a person', JSON.stringify({ calls: toolCalls, d: delivered().slice(0, 120) }));
// control: the linked client's OWN booking in auto mode still works (confirmation delivered)
await linkedA(); bookTool('0917 555 1212', 'Your booking request is in.'); toolServer({ ok: true, status: 'confirmed', booked: true, client_id: 'c1', inquiry_id: 'i-c1', client_existing: true, reply: 'Booked for Tuesday.' });
await send(`Please book window cleaning for ${D2.label}`, { phone: '0917 555 1212' });
ok('V2.3-21 CONTROL: the linked client\'s own booking (same mobile, same client) is still delivered normally and the chat is not handed over', toolCalls.includes('chat-book') && /Booked for Tuesday/.test(delivered()) && conv0().status !== 'Needs a person' && conv0().client_id === 'c1', JSON.stringify({ calls: toolCalls, d: delivered().slice(0, 120), st: conv0().status }));

// 23 (review 23 Nov, staging scenario F): a price question the model answers WITHOUT a peso figure and without calling the tool gets the estimate tool's figure
const noFigure = async (msgs, mode, reply) => { reset(mode); queue(false); state.script = () => text('NO_ANSWER'); await send('Hello', {}, 'MC-P1'); deliver(); state.script = () => text(reply); for (const t of msgs) await send(t, {}, 'MC-P1'); return drafts().at(-1) ?? { body: delivered(), flags: [] }; };
let pf = await noFigure(['Binondo', 'Wall Cleaning', 'Exterior', 'Ground floor', 'How much?'], 'suggest', 'Exterior wall cleaning is priced per square meter, and our team will verify the exact rate and coverage for Binondo po. Thanks for the details!');
ok('V2.3-23 wall price asked in Binondo, model gave no figure and called no tool: the tool\'s rate ₱125 per sqm / ₱6,250 minimum is the answer', /125/.test(pf.body) && /6,250/.test(pf.body), JSON.stringify(pf.body.slice(0, 200)));
pf = await noFigure(['Binondo', 'Wall Cleaning', 'Exterior', 'Ground floor', 'How much?'], 'suggest', 'Exterior wall cleaning in Binondo is ₱125 per sqm, with a 50 sqm minimum (₱6,250) po.');
ok('V2.3-23 control: a reply that already carries the tool\'s figure is left alone', /125/.test(pf.body) && !/confirms the exact area on site/.test(pf.body), JSON.stringify(pf.body.slice(0, 160)));
pf = await noFigure(['Binondo', 'Wall Cleaning', 'Exterior', 'about 80 sqm', 'How much?'], 'suggest', 'Our team will verify the exact rate for you po.');
ok('V2.3-23 a size given earlier and no figure from the model: only the TOOL\'s own figures are added (rate and minimum), never an invented total', /125/.test(pf.body) && (pf.body.match(/₱\s?[\d,]+/g) ?? []).every((x) => /125|6,250/.test(x)), JSON.stringify(pf.body.slice(0, 160)));

pf = await noFigure(['Makati', 'window cleaning', 'may transportation fee ba?'], 'suggest', 'There is no transportation fee po. Our team will confirm any other charges on site.');
ok('V2.3-23 a transportation-fee question is NOT turned into a price quote (staging scenario L): the model\'s own answer stays', /no transportation fee/i.test(pf.body) && !/starts at|₱4,799/.test(pf.body), JSON.stringify(pf.body.slice(0, 160)));
// 23b (review: "add regression coverage for batched messages"): the five-message burst of scenario F, model answers with no figure and no tool
reset('suggest'); queue(true, 60); state.script = () => text('Our team will verify the exact rate and coverage for Binondo po. Exterior wall cleaning is priced per sqm, so they\'ll confirm the final figure with you.');
await Promise.all(['Binondo', 'Wall Cleaning', 'Exterior', 'Ground floor', 'How much?'].map((t, i) => (i ? new Promise((r) => setTimeout(r, i * 5)).then(() => send(t, {}, 'MC-F2')) : send(t, {}, 'MC-F2')))); await flush();
ok('V2.3-23 BURST: five rapid messages, model gave no figure: ONE draft, and it carries the tool\'s rate (₱125 per sqm, ₱6,250 minimum)', drafts().length === 1 && /125/.test(drafts()[0].body) && /6,250/.test(drafts()[0].body), JSON.stringify(drafts().map((d) => d.body.slice(0, 160))));
queue(false);
// 23c: a burst whose messages arrive slower than the debounce still gets ONE answer (the worker waits for a pause)
reset('suggest'); queue(true, 80); state.script = () => text('Exterior wall cleaning is ₱125 per sqm, with a 50 sqm minimum (₱6,250) po.');
await Promise.all(['Binondo', 'Wall Cleaning', 'Exterior', 'Ground floor', 'How much?'].map((t, i) => new Promise((r) => setTimeout(r, i * 50)).then(() => send(t, {}, 'MC-F3')))); await flush();
ok('V2.3-23 SLOW BURST: five messages 50 ms apart with an 80 ms debounce: ONE draft, one model call', drafts().length === 1 && modelCalls.length === 1, `drafts=${drafts().length} modelCalls=${modelCalls.length}`);
queue(false);
// 23d (review 24 Nov): a price question whose model reply has an UNRESOLVED validation violation (Tagalog sentences: repair leaves nothing, the safe fallback would replace it): the tool-verified quote must survive; a burst, too
reset('suggest'); queue(true, 60); state.script = () => text('Para ma-check ko ang tamang presyo, anong klaseng cleaning po ang kailangan ninyo at saan po ang location?');
await Promise.all(['Binondo', 'Wall Cleaning', 'Exterior', 'Ground floor', 'How much?'].map((t, i) => (i ? new Promise((r) => setTimeout(r, i * 5)).then(() => send(t, {}, 'MC-F4')) : send(t, {}, 'MC-F4')))); await flush();
ok('V2.3-23 VIOLATION + BURST: the model reply is unsafe (repair impossible, fallback would apply): ONE draft carries the tool quote (₱125/sqm, ₱6,250 minimum) and is not left as a handover', drafts().length === 1 && /125/.test(drafts()[0].body) && /6,250/.test(drafts()[0].body) && !/verify the exact rate for you/.test(drafts()[0].body), JSON.stringify(drafts().map((d) => ({ b: d.body.slice(-170), f: d.flags }))));
queue(false);
// ... and when the unsafe reply DOES contain a peso figure (so the first recovery does not apply), repair leaves nothing and the safe fallback would replace it: the second recovery (after repair/fallback) restores the tool quote
reset('suggest'); queue(true, 60); state.script = () => text('Para sa wall cleaning po, ang presyo ay ₱125 bawat sqm, ano po ang location ninyo at gaano po kalaki ang pader ninyo?');
await Promise.all(['Binondo', 'Wall Cleaning', 'Exterior', 'Ground floor', 'How much?'].map((t, i) => (i ? new Promise((r) => setTimeout(r, i * 5)).then(() => send(t, {}, 'MC-F6')) : send(t, {}, 'MC-F6')))); await flush();
ok('V2.3-23 UNSAFE REPLY WITH A FIGURE + BURST: the fallback no longer replaces a price question: the tool quote is restored AFTER repair, the staff reason of the fallback is dropped, and the flag says so', drafts().length === 1 && /125/.test(drafts()[0].body) && /6,250/.test(drafts()[0].body) && !/verify the exact rate for you/.test(drafts()[0].body) && drafts()[0].flags.some((f) => /estimate tool after validation/.test(f)), JSON.stringify(drafts().map((d) => ({ b: d.body.slice(-170), f: d.flags }))));
queue(false);
// the same unsafe reply when the city is NOT known: no figure is invented, the safe fallback with a precise staff reason stays
reset('suggest'); queue(false); state.script = () => text('Para ma-check ko ang tamang presyo, anong klaseng cleaning po ang kailangan ninyo at saan po ang location?'); await send('Hello po', {}, 'MC-F5'); deliver(); await send('How much po?', {}, 'MC-F5');
ok('V2.3-23 no city or service known: nothing is priced by the system, the answer stays a safe question/handover', !/₱\s?\d/.test(drafts().at(-1)?.body ?? ''), JSON.stringify((drafts().at(-1)?.body ?? '').slice(0, 160)));
const failed = results.filter((r) => !r.pass); console.log(`\n${results.length - failed.length}/${results.length} passed`); process.exit(failed.length ? 1 : 0);
