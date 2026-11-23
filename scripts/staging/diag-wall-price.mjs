// Diagnostic (staging only): asks the same wall-cleaning price question N times and prints, for each, the reply AND the tool trace (which tools the AI called and what they returned).
//   node scripts/staging/diag-wall-price.mjs [times]      needs STAGING_URL, STAGING_KEY, STAGING_SERVICE_KEY. Removes its own test rows. Prints no keys.
const URL_ = (process.env.STAGING_URL || '').replace(/\/$/, ''), KEY = process.env.STAGING_KEY, SVC = process.env.STAGING_SERVICE_KEY, N = Number(process.argv[2] || 6);
if (!URL_ || !KEY || !SVC) { console.log('Set STAGING_URL, STAGING_KEY and STAGING_SERVICE_KEY.'); process.exit(2); }
if (/ghbumxivporzsalivgyg/.test(URL_)) { console.log('STOP: production.'); process.exit(3); }
const H = { apikey: SVC, Authorization: `Bearer ${SVC}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const stamp = Date.now(); let n = 0;
const rest = async (p, init = {}) => { const r = await fetch(`${URL_}/rest/v1/${p}`, { headers: H, ...init, signal: AbortSignal.timeout(60000) }); const t = await r.text(); return t ? JSON.parse(t) : []; };
const post = (sub, text) => fetch(`${URL_}/functions/v1/chat-brain?key=${encodeURIComponent(KEY)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sub, first_name: 'StagingTest', last_input_text: text, message_id: `${sub}-${++n}` }), signal: AbortSignal.timeout(90000) });
const conv = async (sub) => (await rest(`chat_conversations?subscriber_id=eq.${encodeURIComponent(sub)}&select=id`))[0];
const outs = async (sub) => { const c = await conv(sub); return c ? rest(`chat_messages?conversation_id=eq.${c.id}&direction=eq.out&order=created_at&select=id,body,tool_log,flags,error`) : []; };
const wait = async (sub, k) => { for (let i = 0; i < 40; i++) { const o = await outs(sub); if (o.length >= k) return o; await sleep(1500); } return outs(sub); };
const approve = async (sub) => { const c = await conv(sub); if (c) await rest(`chat_messages?conversation_id=eq.${c.id}&direction=eq.out&status=eq.draft`, { method: 'PATCH', body: JSON.stringify({ status: 'approved' }) }); };
const brief = (x) => JSON.stringify(x).slice(0, 700);
let priced = 0; const subs = [];
for (let i = 1; i <= N; i++) {
  const sub = `stg-${stamp}-diag${i}`; subs.push(sub); let k = 0;
  if (process.env.BATCH) { await Promise.all(['Binondo', 'Wall Cleaning', 'Exterior', 'Ground floor', 'How much?'].map((t, j) => sleep(j * 300).then(() => post(sub, t)))); await wait(sub, 1); await sleep(8000); }   // BATCH=1: five rapid messages, exactly like staging scenario F
  else for (const m of ['Binondo', 'Wall Cleaning', 'Exterior', 'Ground floor', 'How much?']) { await post(sub, m); k++; await wait(sub, k); await approve(sub); }
  const o = (await outs(sub)).at(-1); const body = (o?.body ?? '').split('\n\n---\n\n').pop(); const hasPrice = /₱\s?\d/.test(body); if (hasPrice) priced++;
  console.log(`\n#${i} ${hasPrice ? 'PRICE GIVEN' : 'NO PRICE'}: ${JSON.stringify(body.slice(0, 200))}`);
  const log = Array.isArray(o?.tool_log) ? o.tool_log : []; console.log(`   tools called: ${log.length ? log.map((t) => t.name ?? t.tool ?? '?').join(', ') : '(none)'}`);
  for (const t of log) console.log(`   - ${brief(t)}`);
  if (o?.flags?.length) console.log(`   flags: ${brief(o.flags)}`); if (o?.error) console.log(`   error: ${o.error}`);
}
console.log(`\nSUMMARY: price given in ${priced} of ${N} tries.`);
for (const s of subs) { const c = await conv(s); if (c) { await rest(`chat_messages?conversation_id=eq.${c.id}`, { method: 'DELETE' }); await rest(`chat_conversations?id=eq.${c.id}`, { method: 'DELETE' }); } }
