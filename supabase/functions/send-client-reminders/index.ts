// SMS reminders to the client through Semaphore: the evening before the service and at 7:00 AM on the service day.
// Runs every 10 minutes (pg_cron, see migration 0048). Off until Admin → Settings → "SMS reminders to clients" is ticked.
// Secrets: SEMAPHORE_API_KEY (required), SEMAPHORE_SENDER (optional approved sender name), WEBHOOK_SECRET (optional, header x-webhook-secret), ALERT_SMS_TO (the number the Admin "sample reminder" goes to).
// Each reminder is sent once per job and service date (client_sms_log), so running often is safe. Times are Asia/Manila.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { clientMessage } from './message.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const LIVE = ['Confirmed', 'Dispatch Checklist Pending', 'Dispatched'];
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret', 'Content-Type': 'application/json' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: cors });

/** 09171234567 / +639171234567 / 9171234567 → 09171234567; anything else is not a Philippine mobile number. */
function mobile(raw?: string | null): string | null {
  const d = (raw ?? '').replace(/\D/g, '');
  if (/^09\d{9}$/.test(d)) return d;
  if (/^639\d{9}$/.test(d)) return '0' + d.slice(2);
  if (/^9\d{9}$/.test(d)) return '0' + d;
  return null;
}
async function semaphore(to: string, message: string) {
  const body = new URLSearchParams({ apikey: env('SEMAPHORE_API_KEY'), number: to, message });
  if (env('SEMAPHORE_SENDER')) body.set('sendername', env('SEMAPHORE_SENDER'));
  const res = await fetch('https://api.semaphore.co/api/v4/messages', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`Semaphore ${res.status}: ${text.slice(0, 200)}`);
  const j = JSON.parse(text); if (!Array.isArray(j) || !j.length) throw new Error(text.slice(0, 200));
}

/** Compares two secrets without stopping at the first different character. */
const safeEq = (a: string, b: string) => { const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b); let d = x.length ^ y.length; for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0); return d === 0; };

type Db = ReturnType<typeof createClient>;
type Job = { id: string; number: string; start_at: string; client_id: string; site_id: string; leader_id: string | null; crew_ids: string[] | null; vehicle_id: string | null };

/** Everything the text needs for one booking: who to send to, and the message (arrival window, team and vehicle from the Job Order, else from the booking itself). */
async function compose(db: Db, j: Job, kind: 'day_before' | 'morning', max?: number) {
  const date = String(j.start_at).slice(0, 10), time = String(j.start_at).slice(11, 16);
  const [{ data: site }, { data: client }, { data: jo }] = await Promise.all([
    db.from('sites').select('name, contact_person, contact_mobile').eq('id', j.site_id).maybeSingle(), db.from('clients').select('name, mobile, contact_person, salutation').eq('id', j.client_id).maybeSingle(),
    db.from('job_orders').select('content').eq('job_id', j.id).is('deleted_at', null).order('version', { ascending: false }).limit(1).maybeSingle(),   // the Job Order is the source of the arrival window, team and vehicle
  ]);
  const siteMobile = mobile(site?.contact_mobile); const to = siteMobile ?? mobile(client?.mobile);
  // who the text is addressed to: the site contact when their number is used, otherwise the client's contact. A saved Sir / Mam belongs to the client's own contact.
  const toName = siteMobile ? (site?.contact_person || client?.contact_person || client?.name) : (client?.contact_person || client?.name);
  const saved = !siteMobile || !site?.contact_person || site.contact_person === client?.contact_person ? client?.salutation : null;
  const c = (jo?.content ?? {}) as { arrival_from?: string; arrival_to?: string; team?: { leader?: string; crew?: string[] }; vehicle?: { name?: string } };
  let leader = c.team?.leader, crew = c.team?.crew; let vehicle = c.vehicle?.name;
  if (!leader && !crew?.length) {   // no Job Order yet: use the booking itself
    const ids = [j.leader_id, ...(j.crew_ids ?? [])].filter(Boolean) as string[];
    const { data: emps } = ids.length ? await db.from('employees').select('id, full_name').in('id', ids) : { data: [] };
    const nm = (id?: string | null) => (emps ?? []).find((e: { id: string }) => e.id === id)?.full_name as string | undefined;
    leader = nm(j.leader_id); crew = (j.crew_ids ?? []).map((id: string) => nm(id)).filter(Boolean) as string[];
  }
  if (!vehicle && j.vehicle_id) { const { data: v } = await db.from('assets').select('name').eq('id', j.vehicle_id).maybeSingle(); vehicle = v?.name; }
  return { to, date, message: clientMessage({ kind, date, time: c.arrival_from || time, etaTo: c.arrival_to, to: toName, salutation: saved, leader, crew, vehicle }, max) };
}

/** Admin → "Send me a sample reminder": the real text for the next upcoming booking (or a made-up one), sent ONLY to the alert number, never to a client. Needs a signed-in Owner / Admin. */
async function sample(req: Request, db: Db, kind: 'day_before' | 'morning') {
  const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const [{ data: ok }, { data: who }] = await Promise.all([asUser.rpc('can_admin_settings'), asUser.auth.getUser()]);
  if (ok !== true || !who?.user) return json({ error: 'Only the Owner / Admin can send a sample reminder.' }, 403);
  const { data: allowed, error: rateErr } = await asUser.rpc('ai_allow', { p_fn: 'client-sms-sample', p_max: 6, p_window_minutes: 60 });   // the same per-person limit table used for the AI helpers
  if (!rateErr && allowed === false) return json({ error: 'Six samples in the last hour is the limit. Please try again a little later.' }, 429);
  const to = env('ALERT_SMS_TO').split(',').map((x) => mobile(x.trim())).filter(Boolean)[0];
  if (!to) return json({ error: 'ALERT_SMS_TO is not set (or is not a mobile number), so there is nowhere to send the sample.' }, 400);
  if (!env('SEMAPHORE_API_KEY')) return json({ error: 'SEMAPHORE_API_KEY is not set.' }, 400);
  const now = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 16);
  const { data: next } = await db.from('jobs').select('id, number, start_at, client_id, site_id, leader_id, crew_ids, vehicle_id').is('deleted_at', null).in('status', LIVE).gte('start_at', now).order('start_at', { ascending: true }).limit(1).maybeSingle();
  const PRE = 'SAMPLE: ';
  const message = next
    ? PRE + (await compose(db, next as Job, kind, 306 - PRE.length)).message
    : PRE + clientMessage({ kind, date: new Date(Date.now() + 8 * 3600_000 + 86400_000).toISOString().slice(0, 10), time: '08:00', etaTo: '08:30', to: 'Mr. Juan Dela Cruz', leader: 'Nikko Ballado', crew: ['Leo Mercado', 'Adrian Padilla', 'Karl Lim'], vehicle: 'Service Van 2' }, 306 - PRE.length);
  try { await semaphore(to, message); } catch (e) { return json({ error: (e as Error).message }, 502); }
  return json({ ok: true, to: `${to.slice(0, 4)}***${to.slice(-4)}`, message, job: next?.number ?? null });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  // a sample request comes from the signed-in Admin's browser and is checked by who they are, not by the scheduler's secret
  if (req.method === 'POST' && req.headers.get('x-sample') === '1') {
    const b = await req.json().catch(() => ({})) as { kind?: string };
    return sample(req, db, b.kind === 'morning' ? 'morning' : 'day_before');
  }
  const secret = env('WEBHOOK_SECRET');
  if (secret && !safeEq(req.headers.get('x-webhook-secret') ?? '', secret)) return new Response('forbidden', { status: 403 });
  const { data: st } = await db.from('settings').select('data').eq('id', 'main').maybeSingle();
  const cfg = st?.data?.client_sms as { enabled?: boolean; day_before_time?: string; morning_time?: string } | undefined;
  if (!cfg?.enabled) return Response.json({ sent: 0, note: 'client SMS reminders are off' });
  const dayBeforeAt = cfg.day_before_time || '17:00', morningAt = cfg.morning_time || '07:00';

  const manila = new Date(Date.now() + 8 * 3600_000).toISOString(); // Manila wall clock as an ISO string
  const today = manila.slice(0, 10), hhmm = manila.slice(11, 16);
  const tomorrow = new Date(Date.parse(today + 'T00:00:00Z') + 86400_000).toISOString().slice(0, 10);

  const dayAfter = new Date(Date.parse(tomorrow + 'T00:00:00Z') + 86400_000).toISOString().slice(0, 10);
  const { data: jobs, error } = await db.from('jobs').select('id, number, start_at, status, client_id, site_id, leader_id, crew_ids, vehicle_id').is('deleted_at', null).in('status', LIVE)
    .gte('start_at', today + 'T00:00').lt('start_at', dayAfter + 'T00:00');
  if (error) return new Response(error.message, { status: 500 });
  let sent = 0, skipped = 0;
  for (const j of (jobs ?? []) as Job[]) {
    const date = String(j.start_at).slice(0, 10), time = String(j.start_at).slice(11, 16);
    let kind: 'day_before' | 'morning' | null = null;
    if (date === tomorrow && hhmm >= dayBeforeAt) kind = 'day_before';
    else if (date === today && hhmm >= morningAt && `${date}T${time}` > manila.slice(0, 16)) kind = 'morning';
    if (!kind) continue;
    const { data: done } = await db.from('client_sms_log').select('id').eq('job_id', j.id).eq('kind', kind).eq('service_date', date).maybeSingle();
    if (done) continue;
    const { to, message } = await compose(db, j, kind);
    const row = { job_id: j.id, kind, service_date: date, to_number: to, message };
    if (!to) { await db.from('client_sms_log').insert({ ...row, error: 'No valid mobile number on the site contact or the client', attempts: 5 }); skipped++; continue; }
    try {
      if (!env('SEMAPHORE_API_KEY')) throw new Error('SEMAPHORE_API_KEY is not set');
      await semaphore(to, message);
      await db.from('client_sms_log').insert({ ...row, sent_at: new Date().toISOString() }); sent++;
    } catch (e) {
      // not logged as sent: it is tried again at the next run (the unique key is only taken once it is sent or has no number)
      console.error(j.number, (e as Error).message);
    }
  }
  return Response.json({ sent, skipped });
});
