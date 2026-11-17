// Sends the chat messages that were scheduled for later (the automatic Job Order, a few minutes after the booking). Called every minute by the database (migration 0127).
// If WEBHOOK_SECRET is set the caller must send it as header x-webhook-secret (the database does). Needs MANYCHAT_API_TOKEN. Three tries per message; then the owner is alerted to send it by hand.
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const safeEq = (a: string, b: string) => { const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b); let d = x.length ^ y.length; for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0); return d === 0; };

Deno.serve(async (req) => {
  const secret = env('WEBHOOK_SECRET'); if (secret && !safeEq(req.headers.get('x-webhook-secret') ?? '', secret)) return new Response('forbidden', { status: 403 });
  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY')); const token = env('MANYCHAT_API_TOKEN');
  const { data: due } = await sb.from('chat_followups').select('*').eq('status', 'pending').lte('send_at', new Date().toISOString()).lt('attempts', 3).order('send_at').limit(20);
  let sent = 0, failed = 0;
  for (const f of due ?? []) {
    let err = '';
    if (!token) err = 'MANYCHAT_API_TOKEN is not set';
    else {
      try {
        const r = await fetch('https://api.manychat.com/fb/sending/sendContent', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ subscriber_id: f.subscriber_id, data: { version: 'v2', content: { messages: f.messages } } }) });
        if (!r.ok) err = `ManyChat said ${r.status}: ${(await r.text()).slice(0, 160)}`;
      } catch (e) { err = String((e as Error).message ?? e).slice(0, 160); }
    }
    if (!err) {
      sent++; const now = new Date().toISOString();
      await sb.from('chat_followups').update({ status: 'sent', sent_at: now, error: null, attempts: f.attempts + 1 }).eq('id', f.id);
      if (f.job_order_id) await sb.from('job_orders').update({ status: 'Sent to Client', sent_at: now, sent_by: 'chat', sent_via: 'Messenger chat (automatic)', last_sent_at: now, sent_count: 1 }).eq('id', f.job_order_id).is('sent_at', null);   // the Job Order counts as sent when the customer really got it
    } else {
      failed++; const tries = f.attempts + 1;
      await sb.from('chat_followups').update({ attempts: tries, error: err, status: tries >= 3 ? 'failed' : 'pending', send_at: new Date(Date.now() + 2 * 60_000).toISOString() }).eq('id', f.id);
      if (tries >= 3) await sb.from('alert_outbox').insert({ kind: 'lead', title: 'Job Order not delivered', body: `The scheduled Job Order message could not be sent (${err}). Please send the Job Order by hand.`, link: '/jobs' });
    }
  }
  return new Response(JSON.stringify({ ok: true, sent, failed }), { headers: { 'Content-Type': 'application/json' } });
});
