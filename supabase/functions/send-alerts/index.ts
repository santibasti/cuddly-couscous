// Delivers the owner alerts recorded in public.alert_outbox by SMS through Semaphore (https://semaphore.co, Philippines).
// Trigger it with a Database Webhook on INSERT into alert_outbox (instant) — it also flushes anything still unsent each time it runs.
// Secrets (supabase secrets set ...):
//   SEMAPHORE_API_KEY   your Semaphore API key
//   ALERT_SMS_TO        the owner's mobile, e.g. 09171234567 (several numbers: separate with commas)
// Optional: SEMAPHORE_SENDER (an approved sender name; default is Semaphore's shared sender), APP_URL (default https://cuddly-couscous-one.vercel.app),
//           WEBHOOK_SECRET (the webhook must then send it as header x-webhook-secret).
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const APP = env('APP_URL') || 'https://cuddly-couscous-one.vercel.app';

/** Plain SMS letters only: the peso sign and long dashes would turn the message into Unicode (70 characters per SMS instead of 160). */
const gsm = (s: string) => s.replace(/₱\s?/g, 'PHP ').replace(/[—–]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E\n]/g, '');

async function semaphore(to: string, message: string) {
  const body = new URLSearchParams({ apikey: env('SEMAPHORE_API_KEY'), number: to, message });
  if (env('SEMAPHORE_SENDER')) body.set('sendername', env('SEMAPHORE_SENDER'));
  const res = await fetch('https://api.semaphore.co/api/v4/messages', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const text = await res.text();
  if (!res.ok) throw new Error(`Semaphore ${res.status}: ${text.slice(0, 200)}`);
  try { const j = JSON.parse(text); if (!Array.isArray(j) || !j.length) throw new Error(text.slice(0, 200)); } catch (e) { throw new Error(`Semaphore: ${(e as Error).message}`); }
}

Deno.serve(async (req) => {
  const secret = env('WEBHOOK_SECRET');
  if (secret && req.headers.get('x-webhook-secret') !== secret) return new Response('forbidden', { status: 403 });
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: rows, error } = await db.from('alert_outbox').select('*').is('sent_at', null).lt('attempts', 5).order('id').limit(25);
  if (error) return new Response(error.message, { status: 500 });
  const to = env('ALERT_SMS_TO').replace(/\s/g, '');
  let sent = 0;
  for (const r of rows ?? []) {
    const text = gsm(`TopMop: ${r.title}\n${r.body}${r.link ? `\n${APP}/#${r.link}` : ''}`);
    try {
      if (!env('SEMAPHORE_API_KEY') || !to) throw new Error('SEMAPHORE_API_KEY / ALERT_SMS_TO is not set');
      await semaphore(to, text);
      await db.from('alert_outbox').update({ sent_at: new Date().toISOString(), error: null }).eq('id', r.id); sent++;
    } catch (e) {
      await db.from('alert_outbox').update({ attempts: r.attempts + 1, error: String((e as Error).message).slice(0, 300) }).eq('id', r.id);
    }
  }
  return Response.json({ sent, pending: (rows?.length ?? 0) - sent });
});
