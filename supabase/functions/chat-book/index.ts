// The chat books an open date by itself. POST JSON, key in  x-api-key: <LEAD_INTAKE_KEY>  or  ?key=<LEAD_INTAKE_KEY>  (the same secret as lead-intake).
//   optional: "panels" (glass panels, or square metres for roof / wall / floor) = the customer's own count: the answer then includes an ESTIMATE, always with "the crew does the final count on site";
//             "rates_ok": true = the customer said yes to the starting rates in the chat (saved on the inquiry with the time)
//   { "name": "Maria Santos", "mobile": "0917 123 4567", "address": "Alabang, Muntinlupa", "service": "window cleaning", "date": "2026-11-21" (or "when": "next Saturday"), "details": "...", "source": "Facebook" }
// Always saves the lead (client + inquiry). Then:
//   - the date is not open (or not understood): nothing is booked, the answer offers the nearest open dates;
//   - the date is open and Admin switched on "Book open dates automatically": the date is booked as a Confirmed job (no team, vehicle or price yet) and the answer says so;
//   - the date is open but the switch is off: the answer says our team will confirm (a person books it, as before).
//   optional: "lang": "en" | "tl" | "taglish" (Taglish customers get Taglish) → the ready-to-send text is also in "reply".
// When it books, it also makes the INTERNAL pre-approved quotation (never sent to the client: they agreed to the starting rates in the chat). If Admin switched on "Create and send the Job Order automatically",
// it also creates the Job Order (rates inside, quantities counted on site) and the answer carries its link (job_order_link); otherwise the app drafts the Job Order for you to send.
// Answer: { ok, status: confirmed | pending_human | full | closed | too_soon | unclear, booked, job_number, ..., reply_en, reply_tl, alt1_label, alt1_date, ... }
import { createClient } from 'npm:@supabase/supabase-js@2';
import { estimate } from '../_shared/estimate.ts';
import { chatQuotation } from '../_shared/chatquote.ts';
import { buildContent, contentKey } from '../_shared/appcore.mjs';
import { addDays, bookedReply, checkAvailability, manilaDay, normalizeRules, parseLang, parseWanted, pick } from '../chat-availability/logic.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-api-key, authorization, apikey', 'Content-Type': 'application/json' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: cors });
const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
const safeEq = (a: string, b: string) => { const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b); let d = x.length ^ y.length; for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0); return d === 0; };
function mobile(raw: string) { const d = raw.replace(/\D/g, ''); if (/^09\d{9}$/.test(d)) return d; if (/^639\d{9}$/.test(d)) return '0' + d.slice(2); if (/^9\d{9}$/.test(d)) return '0' + d; return raw; }
function serviceCodes(input: unknown): string[] {
  const t = String(Array.isArray(input) ? input.join(' ') : input ?? '').toLowerCase(); const out = new Set<string>();
  if (/glass|window|salamin|bintana|facade|façade|curtain/.test(t)) out.add('GLASS_EXT'); if (/roof|bubong/.test(t)) out.add('ROOF'); if (/solar/.test(t)) out.add('SOLAR'); if (/wall|pader/.test(t)) out.add('WALL');
  if (/floor|hardscape|driveway|sahig/.test(t)) out.add('FLOOR'); if (/gutter/.test(t)) out.add('GUTTER'); if (/ceiling/.test(t)) out.add('CEILING'); if (/acp|cladding/.test(t)) out.add('ACP');
  return [...out];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  const key = env('LEAD_INTAKE_KEY'); const given = req.headers.get('x-api-key') ?? new URL(req.url).searchParams.get('key') ?? '';
  if (!key || !safeEq(given, key)) return json({ error: 'Invalid or missing key' }, 401);
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null; if (!b) return json({ error: 'Send a JSON body' }, 400);
  const name = clip(b.name ?? b.full_name, 120), mob = mobile(clip(b.mobile ?? b.phone, 40)), address = clip(b.address ?? b.location, 300), source = clip(b.source, 40) || 'Facebook';
  if (!name || !mob) return json({ error: 'name and mobile are required' }, 400);

  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const lang = parseLang(b.lang ?? b.language); const today = manilaDay(Date.now()), wanted = parseWanted(b.date ?? b.when ?? b.preferred_date, today);
  const { data: st } = await sb.from('settings').select('data').eq('id', 'main').maybeSingle();
  const rules = normalizeRules((st?.data as Record<string, unknown> | undefined)?.chat_booking);
  const to = addDays(today, rules.horizon_days + rules.lead_days + 14);
  const [jobs, emps, cars, hol] = await Promise.all([
    sb.from('jobs').select('start_at, end_at, status, leader_id, crew_ids, vehicle_id').is('deleted_at', null).lte('start_at', to + 'T23:59').gte('end_at', today),
    sb.from('employees').select('id, tier, status, department').is('deleted_at', null).eq('department', 'Field Operations'),
    sb.from('assets').select('id').is('deleted_at', null).eq('category', 'Vehicle').eq('status', 'Available'),
    sb.from('holidays').select('date, kind').is('deleted_at', null).eq('kind', 'Regular').gte('date', today).lte('date', to),
  ]);
  if (jobs.error) return json({ error: 'Could not read the calendar' }, 500);
  const facts = { jobs: jobs.data ?? [], field: (emps.data ?? []).filter((e: { status?: string }) => e.status !== 'inactive'), vehicles: cars.data ?? [], holidays: (hol.data ?? []).map((h: { date: string }) => h.date) };
  const flat = (alts: { date: string; label: string }[]) => { const o: Record<string, string> = {}; alts.forEach((a, i) => { o[`alt${i + 1}_date`] = a.date; o[`alt${i + 1}_label`] = a.label; }); return o; };
  const avail = checkAvailability(wanted, today, rules, facts);
  const est0 = estimate(clip(b.address ?? b.location, 300), clip(b.service, 200), Number(b.panels ?? b.qty), clip(b.property_type ?? b.type, 40));
  // the estimate is added to the reply (never a fixed price): the crew does the final count on site
  const withEstimate = <T extends { reply_en: string; reply_tl: string; reply_tglish: string }>(r: T) => { const has = (est0.ok && !!est0.estimate) || est0.kind === 'commercial' || est0.kind === 'custom'; const o = { ...r, reply_en: has ? `${r.reply_en} ${est0.estimate_en}` : r.reply_en, reply_tl: has ? `${r.reply_tl} ${est0.estimate_tl}` : r.reply_tl, reply_tglish: has ? `${r.reply_tglish} ${est0.estimate_tglish}` : r.reply_tglish }; return { ...o, reply: pick(o, lang), estimate: has ? est0.estimate ?? null : null, estimate_note_en: has ? est0.estimate_en : '' }; };
  if (!avail.ok) return json({ ...avail, reply: pick(avail, lang), booked: false, confirmed: false, ...flat(avail.alternatives), alt_count: avail.alternatives.length });       // nothing saved, nothing booked: the chat asks for another date

  // the lead: the client (same mobile = same client) and an inquiry
  let clientId: string | undefined; { const { data } = await sb.from('clients').select('id').eq('mobile', mob).is('deleted_at', null).limit(1); if (data?.length) clientId = data[0].id; }
  if (!clientId) {
    const { data: br } = await sb.from('branches').select('id').is('deleted_at', null).limit(1);
    const { data: c, error } = await sb.from('clients').insert({ name, contact_person: name, mobile: mob, email: clip(b.email, 120), address, billing_address: address, type: /commercial|business|office|store|company/i.test(clip(b.property_type ?? b.type, 40)) ? 'Commercial' : 'Residential', status: 'Prospect', notes: `Created from a ${source} chat booking`, branch_id: br?.[0]?.id ?? null }).select('id').single();
    if (error) return json({ error: error.message }, 500); clientId = c.id;
  }
  const { data: rb } = await sb.from('ai_rulebook').select('version').eq('status', 'published').maybeSingle();                                          // which published rulebook version the conversation followed (kept on the inquiry)
  const est = estimate(address, clip(b.service, 200), Number(b.panels ?? b.qty), clip(b.property_type ?? b.type, 40)); const ratesOk = b.rates_ok === true || b.rates_ok === 'true' || b.rates_ok === 1;
  const codes = serviceCodes(b.service_codes ?? b.service);
  const details = [clip(b.service, 200) && `Service wanted: ${clip(b.service, 200)}`, `Requested date: ${wanted}`, `Starting rates agreed in the chat: ${ratesOk ? `yes, ${new Date().toISOString()}` : 'not stated'}`, clip(b.storeys, 40) ? `Number of storeys: ${clip(b.storeys, 40)}` : '', est.ok && est.estimate ? `Estimate given in the chat: ${est.estimate} for ${est.qty} ${est.unit ?? 'panels'} (the customer's own count; the crew counts on site)` : '', clip(b.details ?? b.message, 1500), `Source: ${source} chat`, rb?.version ? `Rulebook version: ${rb.version}` : ''].filter(Boolean).join('\n');
  const { data: inq, error: ie } = await sb.from('inquiries').insert({ client_id: clientId, service_codes: codes, stage: 'Inquiry', source, details }).select('id').single();
  if (ie) return json({ error: ie.message }, 500);

  if (!rules.auto_confirm || est.kind === 'commercial') {                                                                                                                         // the switch is off: a person books it, as before
    await sb.from('alert_outbox').insert({ kind: 'lead', title: 'New lead with a date', body: `${name} ${mob}${address ? `, ${address}` : ''}, wants ${avail.requested_label} (${source}). Date looks open: please confirm.`, link: `/clients/${clientId}` });
    return json({ ...avail, status: 'pending_human', booked: false, confirmed: false, client_id: clientId, inquiry_id: inq.id, alt_count: 0, ...withEstimate(avail) });
  }
  const { data: svcRows } = await sb.from('services').select('*').is('deleted_at', null);
  const cq = chatQuotation({ services: svcRows ?? [], settings: st?.data, address: address || 'the address given', service: clip(b.service, 200), today, property: clip(b.property_type ?? b.type, 40), addDays });          // null when the city is not in the rate list: the booking is still made, a person prices it
  const { data: res, error: be } = await sb.rpc('chat_book', { p: { date: wanted, client_id: clientId, inquiry_id: inq.id, address, service_codes: cq ? [cq.code] : codes, max_jobs: rules.max_jobs_per_day, ...(cq ? { quotation: cq.payload } : {}) } });
  if (be || !res?.ok) {                                                                                                                              // lost the race for the last place, or the booking could not be made: never say "booked"
    const fresh = res?.reason === 'full' ? await sb.from('jobs').select('start_at, end_at, status, leader_id, crew_ids, vehicle_id').is('deleted_at', null).lte('start_at', to + 'T23:59').gte('end_at', today) : null;
    const again = checkAvailability(wanted, today, rules, { ...facts, jobs: fresh?.data ?? facts.jobs });
    await sb.from('alert_outbox').insert({ kind: 'lead', title: 'Chat booking needs a person', body: `${name} ${mob} asked for ${avail.requested_label}. ${res?.reason === 'full' ? 'The date just filled up.' : 'The automatic booking failed.'}`, link: `/clients/${clientId}` });
    return json({ ...(res?.reason === 'full' ? again : { ...avail, ok: false, status: 'pending_human', reply_en: 'Thank you! Our team will confirm your date shortly.', reply_tl: 'Salamat po! Kukumpirmahin po ng aming team ang inyong petsa.', reply_tglish: 'Thank you po! Kukumpirmahin po ng team namin ang date ninyo shortly.' }), reply: pick(res?.reason === 'full' ? again : { reply_en: 'Thank you! Our team will confirm your date shortly.', reply_tl: 'Salamat po! Kukumpirmahin po ng aming team ang inyong petsa.', reply_tglish: 'Thank you po! Kukumpirmahin po ng team namin ang date ninyo shortly.' }, lang), booked: false, confirmed: false, client_id: clientId, inquiry_id: inq.id, ...flat(again.alternatives), alt_count: again.alternatives.length });
  }
  await sb.from('alert_outbox').insert({ kind: 'booking', title: 'Booked automatically', body: `${name}, ${address || 'address to be confirmed'}: ${res.number} on ${avail.requested_label} (booked by the chat). ${cq ? `Pre-approved at the starting rates (${res.quotation_number}); the Job Order follows.` : 'The city is not in the rate list: please price it.'} Team and vehicle are still to be arranged.`, link: `/jobs/${res.job_id}` });
  let link = ''; let joNumber = ''; let joLater = false; let joErr = '';
  if (rules.auto_job_order && cq && res.quotation_id) {                                                                                           // the owner switched on the automatic Job Order
    try {
      const [jr, cl, si, qu, ve, em] = await Promise.all([
        sb.from('jobs').select('*').eq('id', res.job_id).single(), sb.from('clients').select('*').eq('id', clientId).single(), sb.from('sites').select('*').eq('id', res.site_id).single(), sb.from('quotations').select('*').eq('id', res.quotation_id).single(),
        sb.from('variations').select('*').eq('job_id', res.job_id).is('deleted_at', null), sb.from('employees').select('id, full_name').is('deleted_at', null).limit(1),
      ]);
      const bad = [jr, cl, si, qu].find((x) => x.error || !x.data); if (bad) throw new Error(`could not read the booking records: ${bad.error?.message ?? 'not found'}`);
      const job = { ...jr.data, start_at: String(jr.data.start_at).slice(0, 16), end_at: String(jr.data.end_at).slice(0, 16), jo_prices: jr.data.jo_prices ?? undefined };
      const facts2: Record<string, unknown> = { settings: st?.data ?? {}, clients: [cl.data], sites: [si.data], quotations: [qu.data], variations: ve.data ?? [], employees: em.data ?? [], services: svcRows ?? [], invoices: [], assets: [], discount_requests: [], job_orders: [] };
      const db2 = new Proxy(facts2, { get: (t, k) => (k in t ? t[k as string] : []) });                                                            // the app's own Job Order code reads this like the app's data
      const content = buildContent(db2, job);
      const sub = clip(b.subscriber_id, 80), later = rules.job_order_delay_min > 0 && !!sub && !!env('MANYCHAT_API_TOKEN');      // sent later only when we can push it to the customer ourselves
      let { data: jo, error: je } = await sb.rpc('chat_job_order', { p: { job_id: res.job_id, content, content_key: contentKey(content), send: !later } });
      if (!je && jo?.ok === false && jo?.reason === 'exists') {                                                                                     // the app (open on someone's screen) already made its own Draft for this booking: use it instead of failing
        const { data: ex } = await sb.from('job_orders').select('id, number, status, share_token').eq('job_id', res.job_id).is('deleted_at', null).order('version', { ascending: false }).limit(1).maybeSingle();
        if (ex && ['Draft', 'Revised', 'Sent to Client'].includes(ex.status)) {
          if (!later && ex.status !== 'Sent to Client') { const now = new Date().toISOString(); await sb.from('job_orders').update({ status: 'Sent to Client', sent_at: now, sent_by: 'chat', sent_via: 'Messenger chat (automatic)', last_sent_at: now, sent_count: 1 }).eq('id', ex.id); }
          jo = { ok: true, job_order_id: ex.id, number: ex.number, share_token: ex.share_token }; je = null;
        }
      }
      if (je || !jo?.ok) throw new Error(`the Job Order could not be saved: ${je?.message ?? jo?.reason ?? 'no answer'}`);
      link = `${(env('APP_URL') || 'https://ops.topmop.ph').replace(/\/$/, '')}/#/jo/${jo.share_token}`; joNumber = jo.number;
      if (later) {
        const when = new Date(Date.now() + rules.job_order_delay_min * 60_000).toISOString(); const text = { en: `Here is your Job Order confirmation po, with our rates: ${link}`, tl: `Narito po ang inyong Job Order confirmation, kasama ang aming mga rate: ${link}`, taglish: `Ito po ang Job Order confirmation ninyo, kasama ang rates namin: ${link}` }[lang];
        const { error: fe } = await sb.from('chat_followups').insert({ channel: clip(b.channel, 20) || 'messenger', subscriber_id: sub, job_order_id: jo.job_order_id, messages: [{ type: 'text', text }], send_at: when });
        if (fe) throw new Error(`could not schedule the Job Order message: ${fe.message}`);
        joLater = true; link = '';
      }
    } catch (e) { joErr = String((e as Error).message ?? e).slice(0, 220); link = ''; joLater = false; }
    if (!link && !joLater) await sb.from('alert_outbox').insert({ kind: 'lead', title: 'Job Order not sent', body: `${name}: ${res.number} is booked but the automatic Job Order could not be made${joErr ? ` (${joErr})` : ''}. Please open the booking and send it.`, link: `/jobs/${res.job_id}` });
  }
  const r = bookedReply(avail.requested_label ?? wanted!, res.number, link || undefined, joLater);
  return json({ ok: true, status: 'confirmed', booked: true, confirmed: true, requested: wanted, requested_label: avail.requested_label, job_number: res.number, job_id: res.job_id, quotation_number: res.quotation_number ?? null, job_order_number: joNumber || null, job_order_link: link || null, job_order_later: joLater, job_order_error: joErr || null, client_id: clientId, inquiry_id: inq.id, alternatives: [], alt_count: 0, ...withEstimate(r) });
});
