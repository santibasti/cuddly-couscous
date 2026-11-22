// Runs the REAL chat-brain code against an in-memory stand-in for Supabase. Nothing live is touched.
// A model can be scripted (deterministic tests) or real (CHATSIM_REAL=1: the Anthropic call goes out through the sandbox proxy with a credential saved on the environment; the database is still the in-memory one).
import { execSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
import { DB, flags } from './fakesb.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)); const root = path.resolve(here, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chatsim-')); const out = path.join(tmp, 'bundle.mjs');
execSync(`npx rolldown supabase/functions/chat-brain/index.ts --format esm --platform node -o "${out}" --external "npm:@supabase/supabase-js@2"`, { cwd: root, stdio: 'pipe' });
fs.writeFileSync(out, fs.readFileSync(out, 'utf8').replaceAll('npm:@supabase/supabase-js@2', pathToFileURL(path.join(here, 'fakesb.mjs')).href));
const handlers = []; let handler; const envs = { LEAD_INTAKE_KEY: 'sim-key', SUPABASE_URL: 'https://sim.invalid', SUPABASE_SERVICE_ROLE_KEY: 'x', ANTHROPIC_API_KEY: process.env.CHATSIM_REAL ? (process.env.ANTHROPIC_API_KEY || '') : 'sim', CHAT_DEBOUNCE_MS: '0' };
export const envs_ = envs;
globalThis.Deno = { env: { get: (k) => envs[k] }, serve: (h) => { handlers.push(h); handler = handlers[0]; } };
export const modelCalls = []; export const state = { script: null }; export const waits = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.startsWith('https://api.anthropic.com')) {
    const body = JSON.parse(init.body); modelCalls.push(body);
    if (process.env.CHATSIM_REAL) { const r = await realFetch(url, init); const j = await r.clone().json().catch(() => ({})); body._real = { status: r.status, content: j.content, error: j.error }; return r; }
    const res = state.script ? state.script(body, modelCalls.length) : { content: [{ type: 'text', text: 'STUB' }], stop_reason: 'end_turn' };
    return new Response(JSON.stringify(res), { status: 200 });
  }
  if (u.includes('/functions/v1/')) return state.tools ? state.tools(u, init) : (tools ? tools(u, init) : new Response(JSON.stringify({ ok: false, error: 'no tool server in the simulator' }), { status: 500 }));
  return new Response('{}', { status: 404 });
};
// the real price and date logic, served in memory (an empty calendar)
execSync(`npx rolldown scripts/chatsim/toolshim.ts --format esm --platform node -o "${path.join(tmp, 'toolshim.mjs')}"`, { cwd: root, stdio: 'pipe' });
const T = await import(pathToFileURL(path.join(tmp, 'toolshim.mjs')).href);
const tools = async (u, init) => {
  const b = JSON.parse(init.body); const lang = T.parseLang(b.lang); const j = (o) => new Response(JSON.stringify(o), { status: 200 });
  if (u.endsWith('/chat-estimate')) { const e = Array.isArray(b.items) ? T.estimateBundle(String(b.address ?? '').slice(0, 300), b.items, String(b.property_type ?? '')) : T.estimate(String(b.address ?? '').slice(0, 300), String(b.service ?? ''), Number(b.panels ?? b.qty), String(b.property_type ?? ''), b.with_main === true); return j({ ...e, reply: e.estimate_en || e.rates_en }); }
  if (u.endsWith('/chat-availability')) { const today = T.manilaDay(Date.now()); const r = T.checkAvailability(T.parseWanted(b.when ?? b.date, today), today, T.DEFAULT_RULES, { jobs: (DB.jobs ?? []).map((j) => ({ start_at: j.start_at, end_at: j.end_at, status: j.status })), field: Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, tier: 'Crew', status: 'active', department: 'Field Operations' })), vehicles: [], holidays: [] }); return j({ ...r, reply: T.pick(r, lang) }); }
  return new Response(JSON.stringify({ ok: false, error: 'not simulated' }), { status: 500 });
};
await import(pathToFileURL(out).href);
// the recovery function (answers messages a stopped worker left behind)
const outRec = path.join(tmp, 'recover.mjs');
execSync(`npx rolldown supabase/functions/chat-recover/index.ts --format esm --platform node -o "${outRec}" --external "npm:@supabase/supabase-js@2"`, { cwd: root, stdio: 'pipe' });
fs.writeFileSync(outRec, fs.readFileSync(outRec, 'utf8').replaceAll('npm:@supabase/supabase-js@2', pathToFileURL(path.join(here, 'fakesb.mjs')).href));
await import(pathToFileURL(outRec).href);
export const recover = async (ageMs = 60_000) => { for (const m of DB.chat_messages) if (m.direction === 'in' && !m.handled_at) m.created_at = new Date(Date.now() - ageMs).toISOString(); const r = await handlers[1](new Request('https://sim.invalid/', { method: 'POST', body: '{}' })); return r.json(); };
export const rb = (sections) => [{ status: 'published', version: 1, sections }];
export const reset = (mode = 'suggest', sections = [{ key: 'a', title: 'Identity', body: 'You are TopMop customer service.' }]) => { for (const k of Object.keys(DB)) DB[k].length = 0; DB.settings = [{ id: 'main', data: { chat_ai: { mode }, company: { phone: '0000' } } }]; DB.ai_rulebook = rb(sections); modelCalls.length = 0; state.script = null; state.tools = null; };
let n = 0;
export const send = async (text, extra = {}, id = 'MC-1001') => { const r = await handler(new Request('https://sim.invalid/?key=sim-key', { method: 'POST', body: JSON.stringify({ id, first_name: 'Test', last_input_text: text, message_id: `sim-${++n}`, ...extra }) })); return r.json(); };
export const deliver = () => { for (const m of DB.chat_messages) if (m.direction === 'out' && m.status === 'draft') m.status = 'approved'; };   // staff approve every draft
export { DB, flags };

// The production path: on Supabase the function answers "queued" at once and keeps working in the background (EdgeRuntime.waitUntil).
const bg = [];
export const queue = (on, debounceMs = 40) => { globalThis.EdgeRuntime = on ? { waitUntil: (p) => bg.push(p) } : undefined; envs.CHAT_DEBOUNCE_MS = String(debounceMs); };
export const flush = async () => { while (bg.length) await Promise.all(bg.splice(0)); };
export const setEnv = (k, v) => { envs[k] = v; };
// the staff function (link, unlink, re-check, release): the real chat-send code, the same in-memory database
const outSend = path.join(tmp, 'send.mjs');
execSync(`npx rolldown supabase/functions/chat-send/index.ts --format esm --platform node -o "${outSend}" --external "npm:@supabase/supabase-js@2"`, { cwd: root, stdio: 'pipe' });
fs.writeFileSync(outSend, fs.readFileSync(outSend, 'utf8').replaceAll('npm:@supabase/supabase-js@2', pathToFileURL(path.join(here, 'fakesb.mjs')).href));
await import(pathToFileURL(outSend).href);
export const staff = async (body) => { const r = await handlers[2](new Request('https://sim.invalid/', { method: 'POST', headers: { Authorization: 'Bearer staff' }, body: JSON.stringify(body) })); return r.json(); };
