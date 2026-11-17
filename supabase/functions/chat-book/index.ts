// The chat books an open date by itself. POST JSON, key in  x-api-key: <LEAD_INTAKE_KEY>  or  ?key=<LEAD_INTAKE_KEY>  (the same secret as lead-intake).
//   { "name": "Maria Santos", "mobile": "0917 123 4567", "address": "Alabang, Muntinlupa", "service": "window cleaning", "date": "2026-11-21" (or "when": "next Saturday"), "details": "...", "source": "Facebook" }
// Always saves the lead (client + inquiry). Then:
//   - the date is not open (or not understood): nothing is booked, the answer offers the nearest open dates;
//   - the date is open and Admin switched on "Book open dates automatically": the date is booked as a Confirmed job (no team, vehicle or price yet) and the answer says so;
//   - the date is open but the switch is off: the answer says our team will confirm (a person books it, as before).
// Answer: { ok, status: confirmed | pending_human | full | closed | too_soon | unclear, booked, job_number, ..., reply_en, reply_tl, alt1_label, alt1_date, ... }
import { createClient } from 'npm:@supabase/supabase-js@2';
import { addDays, bookedReply, checkAvailability, manilaDay, normalizeRules, parseWanted } from '../chat-availability/logic.ts';

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
  const today = manilaDay(Date.now()), wanted = parseWanted(b.date ?? b.when ?? b.preferred_date, today);
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
  if (!avail.ok) return json({ ...avail, booked: false, confirmed: false, ...flat(avail.alternatives), alt_count: avail.alternatives.length });       // nothing saved, nothing booked: the chat asks for another date

  // the lead: the client (same mobile = same client) and an inquiry
  let clientId: string | undefined; { const { data } = await sb.from('clients').select('id').eq('mobile', mob).is('deleted_at', null).limit(1); if (data?.length) clientId = data[0].id; }
  if (!clientId) {
    const { data: br } = await sb.from('branches').select('id').is('deleted_at', null).limit(1);
    const { data: c, error } = await sb.from('clients').insert({ name, contact_person: name, mobile: mob, email: clip(b.email, 120), address, billing_address: address, type: /commercial|business|office|store|company/i.test(clip(b.property_type ?? b.type, 40)) ? 'Commercial' : 'Residential', status: 'Prospect', notes: `Created from a ${source} chat booking`, branch_id: br?.[0]?.id ?? null }).select('id').single();
    if (error) return json({ error: error.message }, 500); clientId = c.id;
  }
  const codes = serviceCodes(b.service_codes ?? b.service);
  const details = [clip(b.service, 200) && `Service wanted: ${clip(b.service, 200)}`, `Requested date: ${wanted}`, clip(b.details ?? b.message, 1500), `Source: ${source} chat`].filter(Boolean).join('\n');
  const { data: inq, error: ie } = await sb.from('inquiries').insert({ client_id: clientId, service_codes: codes, stage: 'Inquiry', source, details }).select('id').single();
  if (ie) return json({ error: ie.message }, 500);

  if (!rules.auto_confirm) {                                                                                                                         // the switch is off: a person books it, as before
    await sb.from('alert_outbox').insert({ kind: 'lead', title: 'New lead with a date', body: `${name} ${mob}${address ? `, ${address}` : ''}, wants ${avail.requested_label} (${source}). Date looks open: please confirm.`, link: `/clients/${clientId}` });
    return json({ ...avail, status: 'pending_human', booked: false, confirmed: false, client_id: clientId, inquiry_id: inq.id, alt_count: 0 });
  }
  const { data: res, error: be } = await sb.rpc('chat_book', { p: { date: wanted, client_id: clientId, inquiry_id: inq.id, address, service_codes: codes, max_jobs: rules.max_jobs_per_day } });
  if (be || !res?.ok) {                                                                                                                              // lost the race for the last place, or the booking could not be made: never say "booked"
    const fresh = res?.reason === 'full' ? await sb.from('jobs').select('start_at, end_at, status, leader_id, crew_ids, vehicle_id').is('deleted_at', null).lte('start_at', to + 'T23:59').gte('end_at', today) : null;
    const again = checkAvailability(wanted, today, rules, { ...facts, jobs: fresh?.data ?? facts.jobs });
    await sb.from('alert_outbox').insert({ kind: 'lead', title: 'Chat booking needs a person', body: `${name} ${mob} asked for ${avail.requested_label}. ${res?.reason === 'full' ? 'The date just filled up.' : 'The automatic booking failed.'}`, link: `/clients/${clientId}` });
    return json({ ...(res?.reason === 'full' ? again : { ...avail, ok: false, status: 'pending_human', reply_en: 'Thank you! Our team will confirm your date shortly.', reply_tl: 'Salamat po! Kukumpirmahin po ng aming team ang inyong petsa.' }), booked: false, confirmed: false, client_id: clientId, inquiry_id: inq.id, ...flat(again.alternatives), alt_count: again.alternatives.length });
  }
  await sb.from('alert_outbox').insert({ kind: 'booking', title: 'Booked automatically', body: `${name}, ${address || 'address to be confirmed'}: ${res.number} on ${avail.requested_label} (booked by the chat). Team, vehicle and price are still to be arranged.`, link: `/jobs/${res.job_id}` });
  const r = bookedReply(avail.requested_label ?? wanted!, res.number);
  return json({ ok: true, status: 'confirmed', booked: true, confirmed: true, requested: wanted, requested_label: avail.requested_label, job_number: res.number, job_id: res.job_id, client_id: clientId, inquiry_id: inq.id, alternatives: [], alt_count: 0, ...r });
});
