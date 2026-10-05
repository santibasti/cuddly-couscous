// Creates the demo accounts in Supabase Auth (password: demo123).
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/create-demo-users.mjs
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role key — never ship it to the browser).'); process.exit(1); }
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const users = [
  ['owner@sunrise.ph', 'Maria Santos'], ['manager@sunrise.ph', 'Carlo Reyes'], ['staff@sunrise.ph', 'Ana Lim'], ['ben@sunrise.ph', 'Ben Cruz'], ['viewer@sunrise.ph', 'Vince Tan'],
];
for (const [email, full_name] of users) {
  const { error } = await admin.auth.admin.createUser({ email, password: 'demo123', email_confirm: true, user_metadata: { full_name } });
  console.log(error ? `✗ ${email}: ${error.message}` : `✓ ${email}`);
}
