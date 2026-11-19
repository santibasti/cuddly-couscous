// Safety net for the customer-service chat: answers customer messages that were left unanswered because a background worker stopped or crashed.
// Called every minute by the database (see supabase/cron/chat-recover.sql). If WEBHOOK_SECRET is set the caller must send it as header x-webhook-secret (the database does).
// It only touches conversations that have a customer message older than 45 seconds with no answer, respects the per-conversation lock (a live worker is never disturbed) and the AI mode
// (off = nothing; a "Needs a person" conversation stays silent). In full mode without MANYCHAT_API_TOKEN a recovered answer is saved as a DRAFT for staff instead of being sent.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseMode } from '../_shared/brain.ts';
import { createWorker } from '../_shared/chatworker.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const safeEq = (a: string, b: string) => { const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b); let d = x.length ^ y.length; for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0); return d === 0; };

Deno.serve(async (req) => {
  const secret = env('WEBHOOK_SECRET'); if (secret && !safeEq(req.headers.get('x-webhook-secret') ?? '', secret)) return new Response('forbidden', { status: 403 });
  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: st } = await sb.from('settings').select('data').eq('id', 'main').maybeSingle(); const cfg = (st?.data as Record<string, unknown> | undefined)?.chat_ai as { mode?: string; model?: string } | undefined; const mode = parseMode(cfg?.mode);
  if (mode === 'off' || !env('ANTHROPIC_API_KEY')) return json({ ok: true, recovered: 0, note: 'AI is off or has no key' });
  const cutoff = new Date(Date.now() - 45_000).toISOString();
  const { data: stale, error } = await sb.from('chat_messages').select('conversation_id').eq('direction', 'in').is('handled_at', null).lt('created_at', cutoff).order('created_at', { ascending: true }).limit(100);
  if (error) return json({ ok: true, recovered: 0, note: 'migration 0133 is not applied yet' });
  const ids = [...new Set((stale ?? []).map((r: { conversation_id: string }) => r.conversation_id))].slice(0, 5);
  const token = env('MANYCHAT_API_TOKEN'); const eff = mode === 'auto' && !token ? 'suggest' : mode; let recovered = 0;
  for (const id of ids) {
    try {
      const { data: conv } = await sb.from('chat_conversations').select('*').eq('id', id).maybeSingle(); if (!conv || conv.status === 'Needs a person') continue;
      const worker = createWorker({ sb, env, conv, sub: conv.subscriber_id, channel: conv.channel, text: '', lang: conv.lang ?? 'en', honorific: 'Ma’am/Sir', returning: conv.returning_customer ? { note: conv.returning_note || 'Returning customer' } : null, photo: false,
        mode: eff, cfg, st, queued: true, token, key: env('LEAD_INTAKE_KEY'), model: cfg?.model || env('CHAT_AI_MODEL') || 'claude-haiku-5-5', appUrl: env('APP_URL') || 'https://ops.topmop.ph', debounceMs: 0 });
      const o = await worker(); if (o.status !== 'merged' && o.status !== 'retry') recovered++;
    } catch (e) { await sb.from('alert_outbox').insert({ kind: 'chat', title: 'The AI chat could not recover a message', body: String((e as Error).message ?? e).slice(0, 160), link: '/ai-chat' }); }
  }
  return json({ ok: true, recovered });
});
