#!/usr/bin/env node
// Creates staff logins (Team Leaders, crew, office) in Supabase and links each one to its employee record, so attendance,
// "my jobs" and permissions work for that person. Run it on your own computer — the service key never goes into the app or GitHub.
//
//   1. Supabase → Project Settings → API → copy the project URL and the service_role key.
//   2. Windows (cmd):   set SUPABASE_URL=https://xxxx.supabase.co
//                       set SUPABASE_SERVICE_ROLE_KEY=eyJ...
//   3. node scripts/create-staff.mjs --list            (shows employees and who already has a login)
//   4. copy scripts/staff.example.json to staff.json and edit it (email, role, employee code)
//   5. node scripts/create-staff.mjs staff.json --dry-run     then again without --dry-run
//
// Roles: owner, ops, finance, leader (Team Leader), field (crew), viewer.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (see the top of this file).'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const ROLES = ['owner', 'ops', 'finance', 'leader', 'field', 'viewer'];
const args = process.argv.slice(2); const dry = args.includes('--dry-run'); const file = args.find((a) => !a.startsWith('--'));

const must = async (p) => { const { data, error } = await p; if (error) throw new Error(error.message); return data; };
const employees = await must(sb.from('employees').select('id, code, full_name, position, department, status').is('deleted_at', null).order('code'));
const profiles = await must(sb.from('profiles').select('id, email, role, employee_id, active'));

if (args.includes('--list') || !file) {
  console.log('\nEmployees and their logins:\n');
  for (const e of employees) { const p = profiles.find((x) => x.employee_id === e.id); console.log(`${e.code.padEnd(8)} ${e.full_name.padEnd(28)} ${e.position.padEnd(30)} ${p ? `${p.email} (${p.role}${p.active ? '' : ', disabled'})` : '— no login yet'}`); }
  console.log('\nTo add logins: copy scripts/staff.example.json to staff.json, edit it, then run:  node scripts/create-staff.mjs staff.json --dry-run');
  process.exit(0);
}

const staff = JSON.parse(readFileSync(file, 'utf8'));
const pw = () => { const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from({ length: 10 }, () => c[Math.floor(Math.random() * c.length)]).join(''); };
const out = [];
for (const s of staff) {
  const email = String(s.email ?? '').trim().toLowerCase();
  const emp = employees.find((e) => e.code === s.employee);
  const problems = [];
  if (!/^\S+@\S+\.\S+$/.test(email)) problems.push('invalid email');
  if (!ROLES.includes(s.role)) problems.push(`role must be one of ${ROLES.join(', ')}`);
  if (s.role !== 'viewer' && !emp) problems.push(`no employee with code "${s.employee}"`);
  const taken = emp && profiles.find((p) => p.employee_id === emp.id && p.email !== email);
  if (taken) problems.push(`${emp.full_name} is already linked to ${taken.email}`);
  if (problems.length) { out.push({ email, status: `SKIPPED: ${problems.join('; ')}` }); continue; }
  const name = s.name || emp?.full_name || email;
  if (dry) { out.push({ email, role: s.role, employee: emp ? `${emp.code} ${emp.full_name}` : '—', status: 'would create / update' }); continue; }
  const password = s.password || pw(); let id; let created = false;
  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (error) {
    if (!/already|registered|exists/i.test(error.message)) { out.push({ email, status: `FAILED: ${error.message}` }); continue; }
    id = profiles.find((p) => p.email === email)?.id;
    if (!id) { const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 }); id = list?.users.find((u) => u.email?.toLowerCase() === email)?.id; }
    if (!id) { out.push({ email, status: 'FAILED: login exists but could not be found' }); continue; }
  } else { id = data.user.id; created = true; }
  const { error: pe } = await sb.from('profiles').upsert({ id, name, email, role: s.role, employee_id: emp?.id ?? null, active: true }, { onConflict: 'id' });
  out.push({ email, role: s.role, employee: emp ? `${emp.code} ${emp.full_name}` : '—', password: created ? password : '(unchanged — existing login)', status: pe ? `PROFILE FAILED: ${pe.message}` : created ? 'created' : 'updated' });
}
console.table(out);
if (!dry && out.some((o) => o.status === 'created')) console.log('\nGive each person their email and password privately. They can change the password after signing in. Do not keep this output in a shared place.');
