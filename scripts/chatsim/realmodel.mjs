// Real-model conversation tests for TopMop AI V2: the real chat-brain code, the real Claude model, an in-memory database and the real price/date logic. Nothing live is touched.
// Needs a Claude API key in the environment variable ANTHROPIC_API_KEY.   Run:  CHATSIM_REAL=1 node scripts/chatsim/realmodel.mjs [model]
if (!process.env.ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY is not set: no real-model test was run.'); process.exit(2); }
process.env.CHATSIM_REAL = '1';
const { send, reset, deliver, modelCalls, DB, queue, flush } = await import('./harness.mjs');
const { tooTagalog } = await import('./checks.mjs');
const model = process.argv[2]; const rows = [];
const lastReply = () => { const r = DB.chat_messages.filter((m) => m.direction === 'out').at(-1); return r ? r.body.split('\n\n---\n\n').pop().trim() : ''; };
const sentences = (t) => t.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).filter(Boolean);
const verdict = (name, reply, checks) => { const f = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k); rows.push({ name, reply, fail: f }); console.log(`${f.length ? 'FAIL' : 'PASS'}  ${name}\n      reply: ${JSON.stringify(reply)}${f.length ? `\n      failed: ${f.join(', ')}` : ''}`); };
const base = (r) => ({ real_answer_not_the_fallback: !/refer this to our team so we can give you accurate|verify that for you/i.test(r), english: !tooTagalog(r), short: sentences(r).length <= 2 && r.split(/\s+/).length <= 45, one_question: (r.match(/\?/g) ?? []).length <= 1, no_photo_ask: !/\b(send|share|upload)\b.{0,20}\b(photos?|pictures?|videos?)/i.test(r), no_quantity_ask: !/how many (glass |solar )?(panels|windows)|square met/i.test(r) });
const setup = (mode = 'auto') => { reset(mode, [{ key: 'a', title: 'Identity and rules', body: process.env.RULEBOOK_TEXT || 'You are TopMop customer service for exterior cleaning (windows, walls, roofs, solar panels) in Metro Manila.' }]); queue(false); if (model) DB.settings[0].data.chat_ai.model = model; };
const talk = async (id, msgs) => { for (const m of msgs) { await send(m, {}, id); deliver(); } };

setup(); await talk('A', ['Binondo', 'Wall Cleaning']); let r = lastReply();
verdict('A: Binondo + Wall Cleaning: remembers Binondo, asks about the wall type, no booking', r, { ...base(r), no_booking_offer: !/book|schedule|appointment|reserv/i.test(r), no_location_reask: !/location|city|where/i.test(r), asks_or_acknowledges_wall: /exterior|interior|wall/i.test(r) });
setup(); await talk('B', ['Binondo', 'Wall Cleaning', 'Exterior', 'Ground floor', 'How much?']); r = lastReply();
verdict('B: all facts remembered, a verified price comes back', r, { ...base(r), has_price: /₱\s?\d/.test(r), no_reasking: !/location|city|exterior or|interior|which service|what floor|how many floors/i.test(r), no_booking_offer: !/book|schedule|appointment|reserv/i.test(r) });
setup(); await talk('C', ['Makati', 'window cleaning', 'How much?', 'Okay, thank you.']); r = lastReply();
verdict('C: "Okay, thank you." gets a brief acknowledgment, no booking offer', r, { ...base(r), is_acknowledgment: /welcome|glad|anytime|po/i.test(r), no_booking_offer: !/book|schedule|appointment|reserv|date/i.test(r), brief: r.split(/\s+/).length <= 15 });
setup(); await talk('D1', ['Can I schedule tomorrow?']); r = lastReply();
verdict('D1: scheduling with nothing known: asks only for the missing location/service', r, { ...base(r), asks_missing: /location|city|service|which/i.test(r), no_form_yet: !/Reservation Date:/i.test(r) });
setup(); await talk('D2', ['Makati', 'window cleaning', 'Can I schedule tomorrow?']); r = DB.chat_messages.filter((m) => m.direction === 'out').at(-1)?.body ?? '';
verdict('D2: scheduling with location and service known: date is checked, then the form (or a date answer)', r, { english: !tooTagalog(r), date_or_form: /tomorrow|open|available|booking|Reservation Date|Name:/i.test(r), no_location_reask: !/May I know your location/i.test(r) });
setup(); await talk('E', ['Magkano po magpalinis ng bintana namin sa bahay sa Makati?']); r = lastReply();
verdict('E: pure Tagalog question: English or English-dominant Taglish reply with the verified price', r, { ...base(r), has_price: /₱\s?\d/.test(r) });
setup('suggest'); queue(true, 80); await Promise.all(['Binondo', 'Wall Cleaning', 'Exterior', 'Ground floor', 'How much?'].map((t, i) => new Promise((res) => setTimeout(res, i * 8)).then(() => send(t, {}, 'F')))); await flush();
const ds = DB.chat_messages.filter((m) => m.direction === 'out'); r = (ds.at(-1)?.body ?? '').split('\n\n---\n\n').pop();
verdict('F: five rapid messages: one draft, all facts used', r, { one_draft: ds.length === 1, one_ai_call_batch: modelCalls.filter((c) => !JSON.stringify(c.messages).includes('Rewrite that reply')).length === 1, ...base(r), has_price: /₱\s?\d/.test(r) });
setup(); const long = ['Binondo', 'Wall Cleaning', 'Exterior', 'Ground floor', 'cream paint', 'gated village', 'weekdays only', 'two coats', 'its old', 'any scratches?', 'and stains?', 'rust on some parts', 'how long does it take?', 'is it safe for the paint?', 'How much?'];
await talk('G', long); r = lastReply();
verdict('G: 15 messages later the price still uses Binondo / wall / exterior', r, { ...base(r), has_price: /₱\s?\d/.test(r), no_reasking: !/location|city|exterior or|interior|which service/i.test(r) });
const failed = rows.filter((x) => x.fail.length); console.log(`\n${rows.length - failed.length}/${rows.length} passed (model: ${model || 'default claude-haiku-5-5'}; model calls made: ${modelCalls.length})`); process.exit(failed.length ? 1 : 0);
