// The Owner / Admin sets a new password for any login (a crew member who forgot theirs, a new hire, …).
// body: { user_id: string, password: string }  →  { ok: true }
// Needs the "Manage users & permissions" permission. The password is never stored or logged by us; the change is recorded in the audit log without it.
// Uses the project's own service key (provided to every Supabase function automatically — nothing to configure).
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const [{ data: ok }, { data: who }, body] = await Promise.all([asUser.rpc('can_manage_users'), asUser.auth.getUser(), req.json().catch(() => ({}))]);
  if (ok !== true || !who?.user) return json({ error: 'Only the Owner / Admin can set passwords.' }, 403);
  const { user_id, password } = body as { user_id?: string; password?: string };
  if (typeof user_id !== 'string' || !user_id) return json({ error: 'Choose a login.' }, 400);
  if (typeof password !== 'string' || password.length < 8) return json({ error: 'The password must be at least 8 characters.' }, 400);
  if (password.length > 72) return json({ error: 'The password is too long (72 characters at most).' }, 400);
  const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: target } = await admin.from('profiles').select('id, name').eq('id', user_id).maybeSingle();
  if (!target) return json({ error: 'That login was not found.' }, 404);
  const { error } = await admin.auth.admin.updateUserById(user_id, { password });
  if (error) return json({ error: error.message }, 400);
  const { data: me } = await admin.from('profiles').select('name').eq('id', who.user.id).maybeSingle();
  await admin.from('audit_logs').insert({ user_id: who.user.id, user_name: me?.name ?? 'Admin', action: 'update', table_name: 'users', record_id: user_id, summary: `Password set for ${target.name ?? 'a login'} by ${me?.name ?? 'Admin'}` });
  return json({ ok: true });
});
