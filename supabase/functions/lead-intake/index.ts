// Lead intake: any chatbot tool (ManyChat, Chatfuel, Botpress, Zapier, Make …) or a website form can send a lead here.
// It creates (or finds, by mobile number) the client and an inquiry (source "Facebook" unless you send another), and queues an alert for the owner.
// POST JSON, with the key either in the header  x-api-key: <LEAD_INTAKE_KEY>  or in the address  ?key=<LEAD_INTAKE_KEY>
//   { "name": "Maria Santos", "mobile": "0917 123 4567", "address": "Alabang, Muntinlupa", "service": "window cleaning",
//     "property_type": "Residential", "preferred_date": "next Saturday", "details": "2-storey house, about 30 windows", "source": "Facebook" }
// Only name and (mobile or email) are required. Secret: LEAD_INTAKE_KEY.
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-api-key, authorization, apikey', 'Content-Type': 'application/json' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: cors });
const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

/** 09171234567 / +63 917 123 4567 / 9171234567 → 09171234567; anything else is kept as typed. */
function mobile(raw: string) {
  const d = raw.replace(/\D/g, '');
  if (/^09\d{9}$/.test(d)) return d; if (/^639\d{9}$/.test(d)) return '0' + d.slice(2); if (/^9\d{9}$/.test(d)) return '0' + d;
  return raw;
}
/** "window cleaning, roof" → ['GLASS_EXT', 'ROOF'] */
function serviceCodes(input: unknown): string[] {
  const arr = Array.isArray(input) ? input.map(String) : [String(input ?? '')];
  const t = arr.join(' ').toLowerCase(); const out = new Set<string>();
  for (const a of arr) if (/^[A-Z_]{3,}$/.test(a.trim())) out.add(a.trim());
  if (/glass|window|salamin|bintana|facade|façade|curtain/.test(t)) out.add('GLASS_EXT');
  if (/roof|bubong/.test(t)) out.add('ROOF');
  if (/solar/.test(t)) out.add('SOLAR');
  if (/wall|pader/.test(t)) out.add('WALL');
  if (/floor|hardscape|driveway|sahig/.test(t)) out.add('FLOOR');
  if (/gutter/.test(t)) out.add('GUTTER'); if (/ceiling/.test(t)) out.add('CEILING'); if (/acp|cladding/.test(t)) out.add('ACP');
  return [...out];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  const key = env('LEAD_INTAKE_KEY'); const url = new URL(req.url);
  const given = req.headers.get('x-api-key') ?? url.searchParams.get('key') ?? '';
  if (!key || given !== key) return json({ error: 'Invalid or missing key' }, 401);
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!b) return json({ error: 'Send a JSON body' }, 400);

  const name = clip(b.name ?? b.full_name, 120); const mob = mobile(clip(b.mobile ?? b.phone ?? b.contact_number, 40)); const email = clip(b.email, 120);
  if (!name) return json({ error: 'name is required' }, 400);
  if (!mob && !email) return json({ error: 'mobile (or email) is required' }, 400);
  const address = clip(b.address ?? b.location, 300); const property = /commercial|business|office|store|company/i.test(clip(b.property_type ?? b.type, 40)) ? 'Commercial' : 'Residential';
  const codes = serviceCodes(b.service_codes ?? b.service ?? b.services);
  const source = clip(b.source, 40) || 'Facebook';
  const details = [clip(b.service, 200) && `Service wanted: ${clip(b.service, 200)}`, `Property: ${property}`, clip(b.preferred_date, 80) && `Preferred date: ${clip(b.preferred_date, 80)}`, clip(b.details ?? b.message ?? b.notes, 1500), `Source: ${source} (lead intake)`].filter(Boolean).join('\n');

  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  let clientId: string | undefined; let existing = false;
  if (mob) { const { data } = await sb.from('clients').select('id').eq('mobile', mob).is('deleted_at', null).limit(1); if (data?.length) { clientId = data[0].id; existing = true; } }
  if (!clientId) {
    const { data: br } = await sb.from('branches').select('id').is('deleted_at', null).limit(1);
    const { data: c, error } = await sb.from('clients').insert({ name, contact_person: name, mobile: mob, email, address, billing_address: address, type: property, status: 'Prospect', notes: `Created from a ${source} lead`, branch_id: br?.[0]?.id }).select('id').single();
    if (error) return json({ error: error.message }, 500); clientId = c.id;
  }
  const { data: inq, error } = await sb.from('inquiries').insert({ client_id: clientId, service_codes: codes, stage: 'Inquiry', source, details }).select('id').single();
  if (error) return json({ error: error.message }, 500);
  // the owner is alerted (the same outbox that sends the SMS alerts)
  await sb.from('alert_outbox').insert({ kind: 'lead', title: 'New lead', body: `${name}${mob ? ` ${mob}` : ''}${address ? `, ${address}` : ''} — ${b.service ? clip(b.service, 80) : 'service not specified'} (${source})`, link: `/clients/${clientId}` });
  return json({ ok: true, client_id: clientId, inquiry_id: inq.id, existing_client: existing });
});
