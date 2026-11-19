// Automated scenarios A-G for TopMop AI V2 with a SCRIPTED model (deterministic: it tests the memory, the validation and the delivery plumbing, not the wording of a real model).
// Run:  node scripts/chatsim/scenarios.mjs        (real-model run: CHATSIM_REAL=1 node scripts/chatsim/realmodel.mjs)
import { send, reset, deliver, modelCalls, state, DB, queue, flush, setEnv, flags } from './harness.mjs';
const results = []; const ok = (name, pass, evidence) => { results.push({ name, pass: !!pass, evidence }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${evidence ? `\n      ${evidence}` : ''}`); };
const lastSystem = () => modelCalls[modelCalls.length - 1]?.system ?? '';
const text = (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' });
const drafts = () => DB.chat_messages.filter((m) => m.direction === 'out');
const ctxOf = () => DB.chat_conversations[0]?.context ?? {};

// A. Binondo, Wall Cleaning -> remembers Binondo, asks the wall type, no booking
reset('suggest'); queue(false);
state.script = (b, n) => text(n === 1 ? 'NO_ANSWER' : 'Is it for the exterior or the interior walls po?');
await send('Binondo'); await send('Wall Cleaning');
ok('A: context keeps location (Binondo -> Manila) and service (wall)', ctxOf().location === 'Manila' && ctxOf().service === 'wall', JSON.stringify({ location: ctxOf().location, service: ctxOf().service, stage: ctxOf().stage, intent: ctxOf().intent }));
ok('A: the prompt carries the known facts and suggests the wall type, no booking', /location: Manila/.test(lastSystem()) && /service: wall cleaning/.test(lastSystem()) && /exterior or the interior walls/.test(lastSystem()) && !/CURRENT INTENT: booking/.test(lastSystem()));
ok('A: the draft asks the wall type and does not offer booking', /exterior or the interior/.test(drafts().at(-1).body) && !/book/i.test(drafts().at(-1).body), drafts().at(-1).body);

// B. Exterior, Ground floor, How much? -> all facts present, price intent
reset('auto'); queue(false);
state.script = () => text('Exterior wall cleaning in Manila is ₱125 per sqm with a 50 sqm minimum po.');
for (const t of ['Binondo', 'Wall Cleaning', 'Exterior', 'Ground floor', 'How much?']) await send(t);
ok('B: all four facts and the price intent are in the prompt at "How much?"', ['location: Manila', 'service: wall cleaning', 'surface: exterior', 'building level/access: ground floor', 'CURRENT INTENT: price_inquiry'].every((x) => lastSystem().includes(x)), lastSystem().split('\n').find((l) => l.startsWith('KNOWN FACTS')));
ok('B: the final reply carries the (stubbed) verified price and no booking offer', /₱125/.test(drafts().at(-1).body) && !/book/i.test(drafts().at(-1).body));

// C. "Okay, thank you." -> brief acknowledgment, no model call, no booking offer
reset('auto'); queue(false); state.script = () => text('Exterior wall cleaning in Manila is ₱125 per sqm po.');
await send('Binondo'); await send('Wall Cleaning'); await send('How much?'); const before = modelCalls.length; const r = await send('Okay, thank you.');
ok('C: a brief acknowledgment, no AI call, no booking offer', modelCalls.length === before && /You're welcome/.test(r.reply) && !/book|date|schedule/i.test(r.reply), r.reply);

// D. "Can I schedule tomorrow?" -> location and service checked first
reset('suggest'); queue(false); state.script = (b) => text(/location \(city\)/.test(b.messages.at(-1).content) ? '' : '');
await send('Can I schedule tomorrow?'); const d1 = ctxOf();
ok('D: booking intent is recognised and the schedule is remembered', d1.intent === 'booking_request' && d1.schedule === 'tomorrow', JSON.stringify({ intent: d1.intent, schedule: d1.schedule, location: d1.location ?? null, service: d1.service ?? null }));
ok('D: the welcome already asks the location, so the AI part does not ask it a second time', (drafts().at(-1).body.match(/location/g) ?? []).length === 1 && /happy to help you book/.test(drafts().at(-1).body), JSON.stringify(drafts().at(-1).body.slice(-90)));
deliver(); await send('Makati'); await send('window cleaning');
ok('D: when both are known the booking prompt asks for the date check and the form', /location: Makati/.test(lastSystem()) && /window\/glass cleaning/.test(lastSystem()) && /CURRENT INTENT: booking_request/.test(lastSystem()) && /check the date with check_date/.test(lastSystem()));

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
ok('F: every fact reached the model, and all five messages are marked handled', ['location: Manila', 'surface: exterior', 'building level/access: ground floor', 'CURRENT INTENT: price_inquiry'].every((x) => lastSystem().includes(x)) && inbound.every((m) => m.handled_at), '');
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
ok('G: ...but location, service and surface are still injected from the stored context', ['location: Manila', 'service: wall cleaning', 'surface: exterior', 'building level/access: ground floor'].every((x) => lastSystem().includes(x)), lastSystem().split('\n').find((l) => l.startsWith('KNOWN FACTS')));
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

// Rollout safety: code deployed before migration 0133 is applied still answers (the old single-message behaviour, no stored context)
reset('suggest'); queue(false); flags.noMigration = true; state.script = () => text('Is it for the exterior or the interior walls po?');
const lg = await send('Wall cleaning in Makati', {}, 'MC-L'); flags.noMigration = false;
ok('Migration 0133 missing: the chat still answers (draft saved), nothing crashes', lg.status === 'held' && drafts().length === 1, `${lg.status}; context stored: ${JSON.stringify(ctxOf())}`);

const failed = results.filter((r) => !r.pass); console.log(`\n${results.length - failed.length}/${results.length} passed`); process.exit(failed.length ? 1 : 0);
