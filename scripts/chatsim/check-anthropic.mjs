// One cheap call to the Anthropic API: prints the HTTP status and the error type/message (never the key). Run:  node scripts/chatsim/check-anthropic.mjs [model]
const key = process.env.ANTHROPIC_API_KEY; if (!key) { console.log('ANTHROPIC_API_KEY is not set in this window.'); process.exit(2); }
const model = process.argv[2] || 'claude-haiku-5-5';
console.log(`key present: yes, length ${key.length}, starts "${key.slice(0, 7)}", model: ${model}`);
const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model, max_tokens: 20, messages: [{ role: 'user', content: 'Say OK.' }] }) });
const j = await r.json().catch(() => ({}));
console.log(`HTTP ${r.status}`); if (j.error) console.log(`error: ${j.error.type}: ${j.error.message}`); else console.log(`reply: ${JSON.stringify(j.content?.[0]?.text)}`);
process.exit(r.ok ? 0 : 1);
