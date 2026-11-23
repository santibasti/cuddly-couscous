// Checks that your ManyChat API token and your test contact's ID work (read-only: it only reads the contact). Prints no token.
//   set "MANYCHAT_API_TOKEN=<token>"   set "STAGING_SUBSCRIBER=<contact id>"   node scripts/staging/check-manychat.mjs
const token = process.env.MANYCHAT_API_TOKEN, sub = process.env.STAGING_SUBSCRIBER;
if (!token || !sub) { console.log('STOP: set MANYCHAT_API_TOKEN and STAGING_SUBSCRIBER in this window first.'); process.exit(2); }
console.log(`token length ${token.length} (a real ManyChat token is long, about 30+ characters; "..." has length 3), starts "${token.slice(0, 4)}"`);
const r = await fetch(`https://api.manychat.com/fb/subscriber/getInfo?subscriber_id=${encodeURIComponent(sub)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) }).catch((e) => ({ status: `network error: ${e.message}` }));
if (typeof r.status !== 'number') { console.log(r.status); process.exit(1); }
const j = await r.json().catch(() => ({})); console.log(`ManyChat answered HTTP ${r.status}, status "${j.status ?? ''}"`);
if (r.ok && j.data) console.log(`OK: contact found: ${j.data.first_name ?? ''} ${j.data.last_name ?? ''} (subscribed: ${j.data.subscribed ?? '?'}, last interaction: ${j.data.last_interaction ?? '?'})`); else console.log(`NOT OK: ${JSON.stringify(j).slice(0, 220)}`);
process.exit(r.ok && j.data ? 0 : 1);
