// SMS reminders to the client through Semaphore: the evening before the service and at 7:00 AM on the service day.
// Runs every 10 minutes (pg_cron, see migration 0048). Off until Admin → Settings → "SMS reminders to clients" is ticked.
// Secrets: SEMAPHORE_API_KEY (required), SEMAPHORE_SENDER (optional approved sender name), WEBHOOK_SECRET (optional, header x-webhook-secret).
// Each reminder is sent once per job and service date (client_sms_log), so running often is safe. Times are Asia/Manila.
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const LIVE = ['Confirmed', 'Dispatch Checklist Pending', 'Dispatched'];

const gsm = (s: string) => s.replace(/₱\s?/g, 'PHP ').replace(/[—–]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E\n]/g, '');
/** 09171234567 / +639171234567 / 9171234567 → 09171234567; anything else is not a Philippine mobile number. */
function mobile(raw?: string | null): string | null {
  const d = (raw ?? '').replace(/\D/g, '');
  if (/^09\d{9}$/.test(d)) return d;
  if (/^639\d{9}$/.test(d)) return '0' + d.slice(2);
  if (/^9\d{9}$/.test(d)) return '0' + d;
  return null;
}
const nice = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const dayName = (ymd: string) => new Date(ymd + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

async function semaphore(to: string, message: string) {
  const body = new URLSearchParams({ apikey: env('SEMAPHORE_API_KEY'), number: to, message });
  if (env('SEMAPHORE_SENDER')) body.set('sendername', env('SEMAPHORE_SENDER'));
  const res = await fetch('https://api.semaphore.co/api/v4/messages', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`Semaphore ${res.status}: ${text.slice(0, 200)}`);
  const j = JSON.parse(text); if (!Array.isArray(j) || !j.length) throw new Error(text.slice(0, 200));
}

Deno.serve(async (req) => {
  const secret = env('WEBHOOK_SECRET');
  if (secret && req.headers.get('x-webhook-secret') !== secret) return new Response('forbidden', { status: 403 });
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: st } = await db.from('settings').select('data').eq('id', 'main').maybeSingle();
  const cfg = st?.data?.client_sms as { enabled?: boolean; day_before_time?: string; morning_time?: string } | undefined;
  if (!cfg?.enabled) return Response.json({ sent: 0, note: 'client SMS reminders are off' });
  const dayBeforeAt = cfg.day_before_time || '17:00', morningAt = cfg.morning_time || '07:00';
  const company = st?.data?.company ?? {};

  const manila = new Date(Date.now() + 8 * 3600_000).toISOString(); // Manila wall clock as an ISO string
  const today = manila.slice(0, 10), hhmm = manila.slice(11, 16);
  const tomorrow = new Date(Date.parse(today + 'T00:00:00Z') + 86400_000).toISOString().slice(0, 10);

  const dayAfter = new Date(Date.parse(tomorrow + 'T00:00:00Z') + 86400_000).toISOString().slice(0, 10);
  const { data: jobs, error } = await db.from('jobs').select('id, number, start_at, status, client_id, site_id').is('deleted_at', null).in('status', LIVE)
    .gte('start_at', today + 'T00:00').lt('start_at', dayAfter + 'T00:00');
  if (error) return new Response(error.message, { status: 500 });
  let sent = 0, skipped = 0;
  for (const j of jobs ?? []) {
    const date = String(j.start_at).slice(0, 10), time = String(j.start_at).slice(11, 16);
    let kind: 'day_before' | 'morning' | null = null;
    if (date === tomorrow && hhmm >= dayBeforeAt) kind = 'day_before';
    else if (date === today && hhmm >= morningAt && `${date}T${time}` > manila.slice(0, 16)) kind = 'morning';
    if (!kind) continue;
    const { data: done } = await db.from('client_sms_log').select('id').eq('job_id', j.id).eq('kind', kind).eq('service_date', date).maybeSingle();
    if (done) continue;
    const [{ data: site }, { data: client }] = await Promise.all([db.from('sites').select('name, contact_mobile').eq('id', j.site_id).maybeSingle(), db.from('clients').select('name, mobile').eq('id', j.client_id).maybeSingle()]);
    const to = mobile(site?.contact_mobile) ?? mobile(client?.mobile);
    const message = gsm(kind === 'day_before'
      ? `TopMop Window Cleaning: reminder - your service${site?.name ? ` at ${site.name}` : ''} is scheduled tomorrow, ${dayName(date)}, around ${nice(time)}. Please make sure we can access the area. Questions? ${company.phone ?? ''}`.trim()
      : `TopMop Window Cleaning: good morning! Our team is scheduled today${site?.name ? ` at ${site.name}` : ''} around ${nice(time)}. Questions? ${company.phone ?? ''}`.trim());
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
