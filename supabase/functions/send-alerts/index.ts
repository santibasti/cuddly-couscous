// Delivers the owner alerts recorded in public.alert_outbox by WhatsApp and/or SMS (Twilio).
// Trigger it with a Database Webhook on INSERT into alert_outbox (instant) — it also flushes anything still unsent each time it runs.
// Secrets (supabase secrets set ...): TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and at least one pair:
//   WhatsApp: TWILIO_WHATSAPP_FROM (e.g. whatsapp:+14155238886), ALERT_WHATSAPP_TO (owner, e.g. +639171234567)
//   SMS:      TWILIO_SMS_FROM (a Twilio number),                 ALERT_SMS_TO (owner)
// Optional: APP_URL (links in the message, default https://cuddly-couscous-one.vercel.app), WEBHOOK_SECRET (the webhook sends it as header x-webhook-secret).
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const APP = env('APP_URL') || 'https://cuddly-couscous-one.vercel.app';

async function twilio(from: string, to: string, body: string) {
  const sid = env('TWILIO_ACCOUNT_SID');
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + btoa(`${sid}:${env('TWILIO_AUTH_TOKEN')}`), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ From: from, To: to, Body: body }),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

Deno.serve(async (req) => {
  const secret = env('WEBHOOK_SECRET');
  if (secret && req.headers.get('x-webhook-secret') !== secret) return new Response('forbidden', { status: 403 });
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: rows, error } = await db.from('alert_outbox').select('*').is('sent_at', null).lt('attempts', 5).order('id').limit(25);
  if (error) return new Response(error.message, { status: 500 });
  const targets: [string, string][] = [];
  if (env('TWILIO_WHATSAPP_FROM') && env('ALERT_WHATSAPP_TO')) targets.push([env('TWILIO_WHATSAPP_FROM'), `whatsapp:${env('ALERT_WHATSAPP_TO').replace(/^whatsapp:/, '')}`]);
  if (env('TWILIO_SMS_FROM') && env('ALERT_SMS_TO')) targets.push([env('TWILIO_SMS_FROM'), env('ALERT_SMS_TO')]);
  let sent = 0;
  for (const r of rows ?? []) {
    const text = `TopMop: ${r.title}\n${r.body}${r.link ? `\n${APP}/#${r.link}` : ''}`;
    try {
      if (!targets.length) throw new Error('No WhatsApp / SMS destination is configured');
      for (const [from, to] of targets) await twilio(from, to, text);
      await db.from('alert_outbox').update({ sent_at: new Date().toISOString(), error: null }).eq('id', r.id); sent++;
    } catch (e) {
      await db.from('alert_outbox').update({ attempts: r.attempts + 1, error: String((e as Error).message).slice(0, 300) }).eq('id', r.id);
    }
  }
  return Response.json({ sent, pending: (rows?.length ?? 0) - sent });
});
