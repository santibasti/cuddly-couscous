// Chat with the STAGING AI as one real ManyChat contact (yours). You type here; the AI's reply is delivered by ManyChat into that contact's Messenger chat.
//   set STAGING_URL=https://<staging-ref>.supabase.co
//   set STAGING_KEY=<the staging LEAD_INTAKE_KEY>
//   set STAGING_SUBSCRIBER=<your own ManyChat contact id>
//   node scripts\staging\send-as.mjs
// Needs on staging: chat_ai mode "auto" and the MANYCHAT_API_TOKEN secret (see supabase/staging/README.md, step 8). Refuses the production project.
import readline from 'node:readline';
const URL_ = (process.env.STAGING_URL || '').replace(/\/$/, ''), KEY = process.env.STAGING_KEY, SUB = process.env.STAGING_SUBSCRIBER;
if (!URL_ || !KEY || !SUB) { console.error('Set STAGING_URL, STAGING_KEY and STAGING_SUBSCRIBER.'); process.exit(2); }
if (/ghbumxivporzsalivgyg/.test(URL_)) { console.error('STOP: that is the PRODUCTION project. This script only runs on staging.'); process.exit(3); }
let n = 0;
const send = async (text) => {
  const r = await fetch(`${URL_}/functions/v1/chat-brain?key=${encodeURIComponent(KEY)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: 'messenger', subscriber_id: SUB, first_name: 'StagingTest', text, message_id: `stg-${SUB}-${Date.now()}-${++n}` }) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* not json */ }
  console.log(r.ok ? `  -> ${j?.status ?? 'ok'} (mode ${j?.mode ?? '?'}). In "queued" the reply arrives in Messenger within about 10 to 20 seconds.` : `  -> HTTP ${r.status}: ${t.slice(0, 200)}`);
};
console.log(`Chatting to STAGING as contact ${SUB}. Type a customer message and press Enter. Watch your Messenger chat for the replies. Type /quit to stop.`);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'customer> ' });
rl.prompt();
rl.on('line', async (line) => { const t = line.trim(); if (t === '/quit') { rl.close(); return; } if (t) await send(t); rl.prompt(); });
rl.on('close', () => process.exit(0));
