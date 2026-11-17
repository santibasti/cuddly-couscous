// "Is that date free?" for the chatbot (ManyChat or any tool that can call a web address). Read-only: it checks the calendar, it never books or holds anything.
// POST JSON, key in the header  x-api-key: <LEAD_INTAKE_KEY>  or in the address  ?key=<LEAD_INTAKE_KEY>   (the same secret as lead-intake)
//   { "date": "2026-11-21" }   or   { "when": "next Saturday" }   (also "bukas", "Nov 21", "sa sabado" ...)   optional: { "crew_needed": 4 }
// Optional "lang": "en" | "tl" | "taglish" (the language the customer writes; Taglish customers get Taglish) → the ready-to-send text is also in "reply".
// Answer: { ok, status: available | full | closed | too_soon | unclear, requested, requested_label, alternatives: [{date,label}], alt1_date, alt1_label, ..., reply_en, reply_tl }
// The rules (earliest day, closed weekdays, daily job limit, how many alternatives) come from Admin → Settings → Messenger booking rules. A person always confirms the booking.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { addDays, checkAvailability, manilaDay, normalizeRules, parseLang, parseWanted, pick } from './logic.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-api-key, authorization, apikey', 'Content-Type': 'application/json' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: cors });
const safeEq = (a: string, b: string) => { const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b); let d = x.length ^ y.length; for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0); return d === 0; };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  const key = env('LEAD_INTAKE_KEY'); const given = req.headers.get('x-api-key') ?? new URL(req.url).searchParams.get('key') ?? '';
  if (!key || !safeEq(given, key)) return json({ error: 'Invalid or missing key' }, 401);
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null; if (!b) return json({ error: 'Send a JSON body' }, 400);

  const today = manilaDay(Date.now()); const wanted = parseWanted(b.date ?? b.when ?? b.preferred_date, today);
  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: st } = await sb.from('settings').select('data').eq('id', 'main').maybeSingle();
  const rules = normalizeRules((st?.data as Record<string, unknown> | undefined)?.chat_booking);
  if (b.crew_needed !== undefined) rules.crew_needed = normalizeRules({ crew_needed: b.crew_needed }).crew_needed;
  const to = addDays(today, rules.horizon_days + rules.lead_days + 14);
  const [jobs, emps, cars, hol] = await Promise.all([
    sb.from('jobs').select('start_at, end_at, status, leader_id, crew_ids, vehicle_id').is('deleted_at', null).lte('start_at', to + 'T23:59').gte('end_at', today),
    sb.from('employees').select('id, tier, status, department').is('deleted_at', null).eq('department', 'Field Operations'),
    sb.from('assets').select('id').is('deleted_at', null).eq('category', 'Vehicle').eq('status', 'Available'),
    sb.from('holidays').select('date, kind').is('deleted_at', null).eq('kind', 'Regular').gte('date', today).lte('date', to),
  ]);
  if (jobs.error || emps.error || cars.error) return json({ error: 'Could not read the calendar' }, 500);
  const r = checkAvailability(wanted, today, rules, {
    jobs: jobs.data ?? [], field: (emps.data ?? []).filter((e: { status?: string }) => e.status !== 'inactive'), vehicles: cars.data ?? [], holidays: (hol.data ?? []).map((h: { date: string }) => h.date),
  });
  const flat: Record<string, string> = {}; r.alternatives.forEach((a, i) => { flat[`alt${i + 1}_date`] = a.date; flat[`alt${i + 1}_label`] = a.label; });
  return json({ ...r, reply: pick(r, parseLang(b.lang ?? b.language)), ...flat, alt_count: r.alternatives.length });
});
