// Real-model scenario run against a DEPLOYED STAGING project: real chat-brain Edge Function, real Claude, real Supabase (staging), real price/date functions.
// Run on your PC (Node 20+):
//   $env:STAGING_URL="https://<staging-ref>.supabase.co"; $env:STAGING_KEY="<LEAD_INTAKE_KEY of staging>"; $env:STAGING_SERVICE_KEY="<service role key of staging>"
//   node scripts/staging/run-scenarios.mjs
// Optional actual delivery to a ManyChat TEST contact: put the AI in Full mode on staging, set MANYCHAT_API_TOKEN on the staging function, and pass  $env:STAGING_SUBSCRIBER="<your test contact's ManyChat id>"
// It refuses to run against production, uses subscriber ids that start with "stg-", and deletes its own test rows at the end (staging only).
const URL_ = (process.env.STAGING_URL || '').replace(/\/$/, ''), KEY = process.env.STAGING_KEY, SVC = process.env.STAGING_SERVICE_KEY, REAL_SUB = process.env.STAGING_SUBSCRIBER;
if (!URL_ || !KEY || !SVC) { console.error('Set STAGING_URL, STAGING_KEY and STAGING_SERVICE_KEY.'); process.exit(2); }
if (/ghbumxivporzsalivgyg/.test(URL_)) { console.error('STOP: that is the PRODUCTION project. This script only runs on staging.'); process.exit(3); }
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };
const rest = async (p, init = {}) => { const r = await fetch(`${URL_}/rest/v1/${p}`, { headers: H, ...init }); const t = await r.text(); return t ? JSON.parse(t) : []; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now(); let n = 0; const sent = []; const diag = new Set();
const post = (sub, text, extra = {}) => fetch(`${URL_}/functions/v1/chat-brain?key=${encodeURIComponent(KEY)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sub, first_name: 'StagingTest', last_input_text: text, message_id: `${sub}-${++n}`, ...extra }) }).then(async (r) => { const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* not json */ } if (!r.ok || !j) { diag.add(`chat-brain HTTP ${r.status}: ${t.slice(0, 300)}`); } return j; });
const convOf = async (sub) => (await rest(`chat_conversations?subscriber_id=eq.${encodeURIComponent(sub)}&select=*`))[0];
const outs = async (sub) => { const c = await convOf(sub); return c ? rest(`chat_messages?conversation_id=eq.${c.id}&direction=eq.out&order=created_at&select=body,status,flags,actions,error,created_at`) : []; };
const waitFor = async (sub, count, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const o = await outs(sub); if (o.length >= count) return o; await sleep(1500); } return outs(sub); };
const approve = async (sub) => { const c = await convOf(sub); if (c) await rest(`chat_messages?conversation_id=eq.${c.id}&direction=eq.out&status=eq.draft`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) }); };   // stands in for staff approval in AI Chat
let lastSub = ''; const talk = async (sub, msgs, extra = {}) => { lastSub = sub; let i = 0; for (const m of msgs) { await post(sub, m, extra); i++; await waitFor(sub, i); await approve(sub); } return (await outs(sub)).at(-1)?.body ?? ''; };
const last = (b) => b.split('\n\n---\n\n').pop().trim();
const TL = new Set('ang ng sa mga ko mo ka ako ikaw siya kami tayo kayo sila ninyo niyo namin natin nila ito iyan iyon yung ay at para kung kapag pag saan ano anong anu alin paano bakit kailan magkano mayroon meron wala hindi huwag lang naman din rin na pa nang kasi pero dahil tamang presyo klaseng kailangan gusto pwede puwede salamat opo oo sige muna ba nga daw raw'.split(' '));
const tagalog = (t) => { const w = t.toLowerCase().replace(/[^a-zñ\s'-]/g, ' ').split(/\s+/).filter(Boolean); return w.length >= 6 && w.filter((x) => TL.has(x) || /^(ma|mag|nag|pag|ipa|ire|i)-/.test(x)).length / w.length > 0.3; };
const sentences = (t) => t.replace(/\s+/g, ' ').trim().replace(/\b(brgy|st|ave|blvd|rd|bldg|apt|hwy|dist|mt|mr|mrs|dr|sr|jr)\./gi, '$1\u0001').split(/(?<=[.!?])\s+/).map((x) => x.replace(/\u0001/g, '.')).filter(Boolean);
const base = (r) => ({ english: !tagalog(r), two_sentences: sentences(r).length <= 2, one_question: (r.match(/\?/g) ?? []).length <= 1, no_photo_ask: !/\b(send|share|upload)\b.{0,20}\b(photos?|pictures?|videos?)/i.test(r), no_quantity_ask: !/how many (glass |solar )?(panels|windows)|square met/i.test(r), not_the_fallback: !/refer this to our team so we can give you accurate|verify that for you/i.test(r) });
const rows = []; const verdict = (name, reply, checks) => { if (!String(reply).replace(/[|\s]/g, '')) checks = { ...checks, got_a_reply: false }; const f = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k); rows.push({ name, reply, fail: f, sub: lastSub }); console.log(`${f.length ? 'FAIL' : 'PASS'}  ${name}\n      reply: ${JSON.stringify(reply)}${f.length ? `\n      failed: ${f.join(', ')}` : ''}`); };
const why = async (sub) => { const o = await outs(sub); const c = await convOf(sub); const m = c ? await rest(`chat_messages?conversation_id=eq.${c.id}&select=direction,status,error,handled_at&order=created_at`) : []; return JSON.stringify({ outs: o.map((x) => ({ status: x.status, error: x.error, flags: x.flags, actions: x.actions })), rows: m.map((x) => `${x.direction}:${x.status}:${x.handled_at ? 'handled' : 'pending'}${x.error ? ':' + String(x.error).slice(0, 120) : ''}`) }); };
const S = (tag) => { const s = `stg-${stamp}-${tag}`; sent.push(s); return s; };

let r = last(await talk(S('A'), ['Binondo', 'Wall Cleaning']));
verdict('A: remembers Binondo, asks the wall type, no booking, no location re-ask', r, { ...base(r), no_booking_offer: !/book|schedule|appointment|reserv/i.test(r), no_location_reask: !/location|city|where/i.test(r), wall_question: /exterior|interior/i.test(r) });
r = last(await talk(S('B'), ['Binondo', 'Wall Cleaning', 'Exterior', 'Ground floor', 'How much?']));
verdict('B: all facts remembered; a verified price comes back', r, { ...base(r), has_price: /₱\s?\d/.test(r), no_reasking: !(r.match(/[^.?!]*\?/g) ?? []).some((q) => /location|city|exterior or|interior|which service|what floor|how many floors/i.test(q)), no_booking_offer: !/book|schedule|appointment|reserv/i.test(r) });
r = last(await talk(S('C'), ['Makati', 'window cleaning', 'How much?', 'Okay, thank you.']));
verdict('C: "Okay, thank you." brief, no booking offer', r, { ...base(r), no_booking_offer: !/book|schedule|appointment|reserv|date/i.test(r), brief: r.split(/\s+/).length <= 15 });
const d1 = S('D1'); r = last(await talk(d1, ['Can I schedule tomorrow?']));
verdict('D1: nothing known: the welcome already asks the location; the form is NOT sent before the city is known', r, { english: !tagalog(r), no_form_yet: !/Reservation Date:/i.test(r), no_two_questions: (r.match(/\?/g) ?? []).length <= 1 });
const d2 = S('D2'); r = await talk(d2, ['Makati', 'window cleaning', 'Can I schedule tomorrow?']);
verdict('D2: city known and booking asked: the approved booking form goes out as its own message', r, { form_sent: r.includes('Name:\nAddress:\nContact Number:\nEmail:\nNo. of House Storey:\nReservation Date:\nService Window, Wall, Roof, Solar, Floor?') });
const d3 = S('D3'); const FILLED = 'Name: Maria Santos\nAddress: 12 Maple St, Brgy. Bahay Toro, Quezon City\nContact Number: 0917 555 1212\nEmail:\nNo. of House Storey: 2\nReservation Date: Saturday\nService Window'; for (const [i, m] of ['Quezon City', 'I want to book', FILLED].entries()) { await post(d3, m); await waitFor(d3, i + 1, 90000); await approve(d3); }
const d3o = await outs(d3); const d3l = last(d3o.at(-1)?.body ?? ''); verdict('D3: full booking with the form: the form, then the date is checked and the request handled; never says it is booked in suggest mode', d3o.map((o) => last(o.body)).join(' || '), { form_sent: d3o.some((o) => /Reservation Date:/.test(o.body)), form_once: d3o.filter((o) => /Reservation Date:/.test(o.body)).length === 1, answered_the_filled_form: d3o.length >= 3 && !/Reservation Date:/.test(d3o.at(-1)?.body ?? ''), no_wrong_confirmation: !/\b(is|are) (now )?(booked|confirmed)\b/i.test(d3l), not_empty: d3l.length > 5 });
r = last(await talk(S('E'), ['Magkano po magpalinis ng bintana namin sa bahay sa Makati?']));
verdict('E: pure Tagalog question: English / English-dominant Taglish reply with the Makati price', r, { ...base(r), has_price: /₱\s?4,?799/.test(r) });
const f = S('F'); await Promise.all(['Binondo', 'Wall Cleaning', 'Exterior', 'Ground floor', 'How much?'].map((t, i) => sleep(i * 300).then(() => post(f, t)))); const fo = await waitFor(f, 1, 90000); await sleep(8000); const fo2 = await outs(f);
r = last(fo2.at(-1)?.body ?? ''); verdict('F: five rapid messages: one reply, all facts used', r, { one_reply: fo2.length === 1, ...base(r), has_price: /₱\s?\d/.test(r) });
if (rows.at(-1).fail.length) console.log(`      state: ${await why(f)}`);
const g = S('G'); r = last(await talk(g, ['Binondo', 'Wall Cleaning', 'Exterior', 'Ground floor', 'cream paint', 'gated village', 'weekdays only', 'two coats', 'its old', 'any scratches?', 'and stains?', 'rust on some parts', 'how long does it take?', 'is it safe for the paint?', 'How much?']));
verdict('G: 15 messages later the price still uses wall / exterior', r, { ...base(r), has_price: /₱\s?\d/.test(r), no_reasking: !/location|city|exterior or|interior|which service/i.test(r) });
r = last(await talk(S('H'), ['How much for window cleaning in Calamba, Laguna?']));
verdict('H: Laguna: the province price with the municipality to be confirmed by the team', r, { ...base(r), has_price: /12,?799/.test(r), says_team_confirms: /municipality|confirm|verify/i.test(r) });
r = last(await talk(S('I'), ['How much for window cleaning in Angeles, Pampanga?']));
verdict('I: Pampanga: the province price (₱12,799) with the municipality to be confirmed by the team', r, { ...base(r), has_price: /12,?799/.test(r), says_team_confirms: /municipality|confirm|verify/i.test(r) });
r = last(await talk(S('J'), ['How much for window cleaning in Tarlac City?']));
verdict('J: a place not in the price list (Tarlac): no price, the team verifies rate and coverage', r, { ...base(r), no_price: !/₱\s?\d/.test(r), says_team_verifies: /verify|confirm|check/i.test(r) });
const k = S('K'); await talk(k, ['Do I need to make a downpayment?', 'what payment methods do you accept?']); const ko = await outs(k);
const k1 = last(ko[0]?.body ?? ''), k2 = last(ko[1]?.body ?? '');
verdict('K: payment questions are answered from the policy (no downpayment, on completion, cash/GCash/bank/cheque) and the AI does not go silent', `${k1} || ${k2}`, { ...base(k1), no_downpayment: /no down ?payment/i.test(k1), on_completion: /complet/i.test(k1), second_answered: ko.length >= 2 && k2.length > 5, methods_listed: /gcash/i.test(k2) && /cheque|check/i.test(k2) && /cash/i.test(k2) && /bank/i.test(k2), not_handed_over: !/refer this to our team|inconvenience/i.test(`${k1} ${k2}`) });
const l = S('L'); const lo = await (async () => { await talk(l, ['Makati', 'window cleaning', 'may transportation fee ba?']); return outs(l); })(); const l1 = last(lo.at(-1)?.body ?? '');
verdict('L: transportation fee: there is none, and the AI does not claim there are no other charges', l1, { ...base(l1), says_none: /no (transportation|travel|transport)/i.test(l1), no_blanket_claim: !/no (other|additional|hidden) (charges|fees)|wala nang iba/i.test(l1), not_handed_over: !/refer this to our team|inconvenience/i.test(l1) });
// V2.2 company knowledge (real model): each topic answered on its own, in short natural words
const V = async (tag, msgs) => last(await talk(S(tag), msgs)); const noBook = (x) => !/(would you like|want|ready|shall we|can i|may i|let me|i can|we can) .{0,25}(to )?(book|schedule|reserve|set (up )?an? (appointment|booking))|book(ing)? a date|set an? appointment|available dates?/i.test(x);   // an OFFER to book, not the word "booking"
r = await V('M', ['Can you remove acid rain marks on my windows?']);
verdict('M: acid rain: no removal or restoration is offered, nothing promised, regular cleaning only maintains the glass', r, { ...base(r), says_no_removal: /(don'?t|do not|cannot|can'?t|unable|not)\b.{0,45}\b(offer|provide|remov\w*|restor\w*)/i.test(r), no_promise: !/\b(we('ll| will| can)) (try|remove|restore|fix|polish)/i.test(r), no_prevention_claim: !/\bprevent/i.test(r) || /(cannot|can'?t|not)\b.{0,30}prevent/i.test(r), no_booking_offer: noBook(r) });
r = await V('N', ['How many people will come to clean?']);
verdict('N: crew: 3–5 per service, depending on the job', r, { ...base(r), crew_3_to_5: /3\s*(–|-|to)\s*5/i.test(r), no_booking_offer: noBook(r) });
r = await V('O', ['We have an office building. Can you give us a quote?']);
verdict('O: commercial: Google Maps assessment, photos optional (never asked or required), ₱2,500 ocular deductible, no price', r, { ...base(r), google_maps: /Google Maps/i.test(r), photos_optional: /optional/i.test(r), ocular_fee: /2,500/.test(r), deductible: /deduct/i.test(r), no_rate_table_price: !/₱\s?(4,799|5,799|6,799|12,799)/.test(r), photos_not_requested: !(/(send|share|upload|provide|attach)\b.{0,25}\b(photos?|pictures?)/i.test(r) && !/optional|if you (like|want|wish)/i.test(r)) && !/photos?\b.{0,20}\b(required|needed|must)/i.test(r) });
r = await V('P', ['What do you use to clean exterior and interior glass?']);
verdict('P: glass methods: exterior purified deionized water with water-fed poles, interior traditional methods', r, { ...base(r), exterior_method: /(deioni[sz]ed|purified)/i.test(r) && /water[- ]fed/i.test(r), interior_traditional: /traditional/i.test(r) });
r = await V('Q', ['What do we need to prepare at the house for the cleaning?']);
verdict('Q: site needs: own equipment, only water access and electricity if needed', r, { ...base(r), water: /water/i.test(r), electricity: /electric/i.test(r), own_equipment: /\b(own|bring)\b/i.test(r), no_booking_offer: noBook(r) });
r = await V('R', ['How do you clean roofs?']);
verdict('R: roof method: hybrid soft washing and regulated pressure, depends on the roof, no guarantee', r, { ...base(r), soft_wash: /soft ?wash/i.test(r), regulated_pressure: /pressure/i.test(r), depends: /(depend|material|condition)/i.test(r), no_guarantee: !/guarantee/i.test(r) });
r = await V('T', ['How much for window cleaning in Makati? I only have 15 panels.']);
verdict('T: minimum charge: 15 window panels in Makati are still ₱4,799 (never prorated)', r, { ...base(r), full_package: /4,799/.test(r), no_proration: !/pro-?rat|only pay for the actual/i.test(r) });
r = await V('U', ['How much for roof cleaning in Makati, about 60 sqm?']);
verdict('U: minimum charge: 60 sqm of roof is ₱14,500 (100 sqm minimum), not ₱8,700', r, { ...base(r), full_minimum: /14,500/.test(r), not_prorated: !/8,700/.test(r) });
r = await V('W', ['Exterior wall cleaning in Makati, only 20 sqm. How much?']);
verdict('W: minimum charge: 20 sqm of wall is ₱6,250 (50 sqm minimum)', r, { ...base(r), full_minimum: /6,250/.test(r), not_prorated: !/2,500/.test(r) });
r = await V('X', ['Solar panel cleaning in Makati, 10 panels. How much?']);
verdict('X: minimum charge: 10 solar panels are ₱4,900 (20 panel minimum), the minimum is NOT waived for a standalone service', r, { ...base(r), full_minimum: /4,900/.test(r), not_waived: !/2,450/.test(r) });
r = await V('S', ['Makati', 'window cleaning', 'I have 15 window panels and I want to add 10 solar panels. What is the total?']);
verdict('S: bundle: window package ₱4,799 (first, keeps its minimum) + 10 solar panels × ₱245 = ₱2,450 (second, minimum waived) = ₱7,249; not free, not a discount', r, { ...base(r), combined_total: /7,249/.test(r), not_free: !/\bfree\b|discount/i.test(r) });
r = await V('Y', ['Makati', 'window cleaning', 'I have 15 window panels, 10 solar panels and about 60 sqm of roof. What is the total for all three?']);
verdict('Y: three services together: window ₱4,799 (first, keeps its minimum) + solar ₱2,450 + roof ₱8,700 (no minimum) = ₱15,949', r, { ...base(r), combined_total: /15,949/.test(r), not_free: !/\bfree\b|discount/i.test(r) });

/* ============ V2.3: previous contacts and existing clients (real model, real staging database; test clients and jobs are seeded and deleted again) ============ */
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const inDays = (k) => { const d = new Date(Date.now() + k * 86400000 + 8 * 3600000); return { iso: d.toISOString().slice(0, 10), label: `${MON[d.getUTCMonth()]} ${d.getUTCDate()}` }; };
const D1 = inDays(8), D2 = inDays(15); const seeded = { jobs: [], sites: [], clients: [] }; let seedFail = '';
const ten = (k) => `9${String(stamp).slice(-7)}${String(k).padStart(2, '0')}`;                  // a unique 10-digit mobile per run and per client: no collision with real staging clients
const mob = (k) => { const n = ten(k); return `0${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`; };   // 09XX XXX XXXX
const more = async (sub, text, extra = {}) => { lastSub = sub; const before = (await outs(sub)).length; await post(sub, text, extra); await waitFor(sub, before + 1); await approve(sub); };   // a further message in a conversation that already has replies
const ins = async (table, row) => { const r = await fetch(`${URL_}/rest/v1/${table}`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify(row) }); const t = await r.text(); if (!r.ok) { seedFail = `${table}: ${t.slice(0, 200)}`; return null; } return JSON.parse(t)[0]; };
const seedClient = async (key, name, mobile, jobs = []) => {
  const id = `stg-${stamp}-${key}`; const c = await ins('clients', { id, name, contact_person: name, mobile, type: 'Residential', status: 'Active', address: 'Makati' }); if (!c) return null; seeded.clients.push(id);
  const sid = `stg-${stamp}-s-${key}`; if (await ins('sites', { id: sid, client_id: id, name: `${name} residence`, address: 'Makati' })) seeded.sites.push(sid);
  for (const [i, j] of jobs.entries()) { const jid = `stg-${stamp}-j-${key}-${i}`; if (await ins('jobs', { id: jid, number: j.number, client_id: id, site_id: sid, start_at: `${j.date}T09:00:00`, end_at: `${j.date}T12:00:00`, status: j.status ?? 'Confirmed', service_codes: j.codes ?? ['GLASS_EXT'] })) seeded.jobs.push(jid); }
  return id;
};
const jobNo = (k) => `JOB-9${String(stamp).slice(-5)}-${k}`;
const full = (sub) => outs(sub).then((o) => o.at(-1)?.body ?? '');
const noForm = (x) => !/Reservation Date:|Please copy this and fill/i.test(x); const noFull = (x) => !/fully booked|is full|not available|too soon|nearest (open )?dates/i.test(x);

// N1: a brand-new customer with no prior record: unchanged (the welcome is sent)
const n1 = S('N1'); await talk(n1, ['Hi, how much is window cleaning in Makati?']); let fb = await full(n1); let cv = await convOf(n1);
verdict('V2.3-N1: a brand-new customer is NEW and gets the standard welcome', last(fb), { welcome: /TopMop offers professional exterior cleaning/.test(fb), status_new: !cv?.contact_status || cv.contact_status === 'new', no_client: !cv?.client_id });
// P1: messaged before the AI was installed (ManyChat first-contact date long before): PREVIOUS contact, never an existing client
const p1 = S('P1'); await talk(p1, ['Hello po'], { subscribed: '2026-01-05T08:00:00Z' }); fb = await full(p1); cv = await convOf(p1);
verdict('V2.3-P1: a contact from before the AI (old Messenger chats, no service history) is a PREVIOUS contact: no welcome, no menu, not an existing client', last(fb), { no_welcome: !/TopMop offers professional exterior cleaning|May we know your location/.test(fb), status_previous: cv?.contact_status === 'previous', not_existing: !cv?.client_id && cv?.contact_status !== 'existing', no_invented_history: !/last time|your previous (job|booking|service)|welcome back.*(job|booking)/i.test(fb) });
// E1: a manually created job order; the client record is created AFTER the chat began; the customer asks about the booking
const e1 = S('E1'); await talk(e1, ['Hello po']); const c1 = await seedClient('e1', 'Maria Cruz', mob(1), [{ number: jobNo(1), date: D1.iso }]);
if (!c1) verdict('V2.3-E1: existing client (manual job order, client record newer than the chat) asks about their booking', seedFail || 'seeding failed', { seeded: false });
else { await more(e1, `Hi po, are we still scheduled for ${D1.label}?`, { phone: mob(1) }); fb = await full(e1); cv = await convOf(e1);
  verdict('V2.3-E1: existing client (manual job order, client record created after the chat) asks about their booking: recognised, answered from their own job, never "full", no form', last(fb), { existing: cv?.contact_status === 'existing' && cv?.client_id === c1, basis_mobile: cv?.link_basis === 'mobile', cites_own_booking: fb.includes(jobNo(1)) || new RegExp(D1.label.split(' ')[1]).test(fb), never_full: noFull(fb), no_form: noForm(fb), no_welcome: !/TopMop offers professional/.test(fb) }); }
// E2: a reminder about a high ceiling for a booked job
const e2 = S('E2'); const c2 = await seedClient('e2', 'Ana Reyes', mob(2), [{ number: jobNo(2), date: D1.iso }]);
if (c2) { await talk(e2, [`Reminder lang po, mataas po ang ceiling namin. We are scheduled ${D1.label}.`], { phone: mob(2) }); fb = await full(e2); cv = await convOf(e2);
  verdict('V2.3-E2: a reminder about a high ceiling from an existing client is not a new inquiry: no form, no welcome, no calendar, the team is alerted', last(fb), { existing: cv?.contact_status === 'existing', no_form: noForm(fb), no_welcome: !/TopMop offers professional/.test(fb), never_full: noFull(fb), no_location_ask: !/location|city|where/i.test(fb), english: !tagalog(fb) }); }
// E3: several bookings: the asked date picks the right job
const e3 = S('E3'); const c3 = await seedClient('e3', 'Ben Santos', mob(3), [{ number: jobNo(31), date: D1.iso }, { number: jobNo(32), date: D2.iso, status: 'Pending', codes: ['ROOF'] }]);
if (c3) { await talk(e3, [`Is my booking on ${D2.label} still on?`], { phone: mob(3) }); fb = await full(e3);
  verdict('V2.3-E3: a client with several bookings: the asked date is answered from the right job', last(fb), { right_job: fb.includes(jobNo(32)) || new RegExp(D2.label.split(' ')[1]).test(fb), never_full: noFull(fb), no_form: noForm(fb) }); }
// E4: identical names on two clients: matched by mobile, never by name
const e4 = S('E4'); const c4a = await seedClient('e4a', 'Carla Lim', mob(41), [{ number: jobNo(41), date: D1.iso }]); const c4b = await seedClient('e4b', 'Carla Lim', mob(42), [{ number: jobNo(42), date: D2.iso }]);
if (c4a && c4b) { await talk(e4, [`Are we still scheduled for ${D2.label}?`], { phone: mob(42) }); fb = await full(e4); cv = await convOf(e4);
  verdict('V2.3-E4: two clients with the SAME NAME: the contact is matched to the right one by mobile and only their job is used', last(fb), { right_client: cv?.client_id === c4b, only_their_job: !fb.includes(jobNo(41)), never_full: noFull(fb) }); }
// E5: no phone number: the customer says they booked: ask once, then a person; a number typed in the chat is only a suggestion
const e5 = S('E5'); const c5 = await seedClient('e5', 'Dina Gomez', mob(5), [{ number: jobNo(5), date: D1.iso }]);
if (c5) { await talk(e5, [`Hi, we are scheduled ${D1.label} po. Dina Gomez here.`]); fb = await full(e5); cv = await convOf(e5); const ask = fb;
  await more(e5, `My number is ${mob(5)}`); fb = await full(e5); const cv2 = await convOf(e5);
  verdict('V2.3-E5: no phone number: a NAME never links; the AI asks once for the mobile or job order number (no form, no calendar, no details)', last(ask), { not_linked: !cv?.client_id && cv?.contact_status !== 'existing', asks_reference: /mobile number or job order number/i.test(ask), no_form: noForm(ask), never_full: noFull(ask), no_leak: !ask.includes(jobNo(5)) });
  verdict('V2.3-E5: a number typed in the chat is only a SUGGESTION: staff confirm, the customer is not linked, a person takes over, no details leak', last(fb), { suggested: cv2?.link_state === 'suggested' && !cv2?.client_id, candidate_listed: (cv2?.link_candidates ?? []).some((x) => x.client_id === c5), handed_over: cv2?.status === 'Needs a person', no_leak: !fb.includes(jobNo(5)) }); }
// E6: the same mobile on two client records: ambiguous, staff decide
const e6 = S('E6'); const c6a = await seedClient('e6a', 'Eva Tan', mob(6), []); const c6b = await seedClient('e6b', 'Evan Tan', mob(6), []);
if (c6a && c6b) { await talk(e6, ['Hello po'], { phone: mob(6) }); cv = await convOf(e6);
  verdict('V2.3-E6: the SAME mobile on two client records is AMBIGUOUS: nobody is linked and staff are asked to choose', await full(e6), { ambiguous: cv?.link_state === 'ambiguous', none_linked: !cv?.client_id, previous: cv?.contact_status === 'previous', two_candidates: (cv?.link_candidates ?? []).length === 2 }); }
if (seedFail) console.log(`\nSEEDING NOTE (a test client or job could not be created on staging): ${seedFail}`);
for (const [t, ids] of [['jobs', seeded.jobs], ['sites', seeded.sites], ['clients', seeded.clients]]) for (const id of ids) await fetch(`${URL_}/rest/v1/${t}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: H });   // clean up the seeded test data (staging only)

if (REAL_SUB) { await post(REAL_SUB, 'Staging delivery test: How much for window cleaning in Makati?'); console.log(`\nSent a test message as ManyChat contact ${REAL_SUB}. In Full mode the reply should arrive in that Messenger chat within ~15 seconds; check it by eye.`); }
for (const x of rows.filter((y) => y.fail.length && y.sub)) { const c = await convOf(x.sub); if (!c) continue; const m = await rest(`chat_messages?conversation_id=eq.${c.id}&select=direction,status,body,created_at,handled_at,flags&order=created_at`); console.log(`\nTIMELINE for ${x.name.split(':')[0]} (in = customer, out = our reply):`); for (const y of m) console.log(`  ${y.created_at.slice(11, 19)} ${y.direction} ${y.status}${y.handled_at ? '' : ' UNHANDLED'} ${JSON.stringify(String(y.body).replace(/\n+/g, ' ').slice(0, 110))}${y.flags?.length ? ' flags=' + JSON.stringify(y.flags).slice(0, 160) : ''}`); }
const empty = sent.length ? await Promise.all(sent.slice(0, 1).map(why)) : []; if (rows.some((x) => !x.reply)) console.log(`\nFirst conversation state (why replies may be empty):\n  ${empty[0]}`);
for (const s of sent) { const c = await convOf(s); if (c) { await rest(`chat_messages?conversation_id=eq.${c.id}`, { method: 'DELETE' }); await rest(`chat_conversations?id=eq.${c.id}`, { method: 'DELETE' }); } }   // clean up the test rows (staging only)
if (diag.size) console.log(`\nDIAGNOSTICS from the function:\n  ${[...diag].join('\n  ')}`);
const failed = rows.filter((x) => x.fail.length); console.log(`\n${rows.length - failed.length}/${rows.length} passed`); process.exit(failed.length ? 1 : 0);
