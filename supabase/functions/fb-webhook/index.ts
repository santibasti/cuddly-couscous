// Facebook Page messages → AI assistant → lead in TopMop.
//  • GET  : Facebook's webhook verification (FB_VERIFY_TOKEN).
//  • POST : a customer wrote to the Page. The message is stored, Claude writes a reply from TopMop's services and prices, and
//           - mode "suggest": the reply waits in the Inbox for staff to approve (default);
//           - mode "auto"   : the reply is sent right away (unless the AI says a person is needed);
//           - mode "off"    : messages are only stored.
//    When the customer has given their details, the AI creates a client + inquiry (source "Facebook") in TopMop.
// Secrets: FB_VERIFY_TOKEN, FB_APP_SECRET, FB_PAGE_TOKEN, ANTHROPIC_API_KEY; optional FB_AI_MODEL (default claude-haiku-5-5), APP_URL.
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const GRAPH = 'https://graph.facebook.com/v21.0';
const db = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

async function validSignature(req: Request, raw: string) {
  const sig = req.headers.get('x-hub-signature-256') ?? ''; const secret = env('FB_APP_SECRET');
  if (!secret || !sig.startsWith('sha256=')) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex.length === sig.length - 7 && hex === sig.slice(7);
}

async function sendToFacebook(psid: string, text: string) {
  const res = await fetch(`${GRAPH}/me/messages?access_token=${encodeURIComponent(env('FB_PAGE_TOKEN'))}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient: { id: psid }, messaging_type: 'RESPONSE', message: { text: text.slice(0, 1900) } }) });
  if (!res.ok) throw new Error(`Facebook ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

const TOOLS = [
  { name: 'save_lead', description: 'Save the customer as a lead in the TopMop system once you have at least their name AND a mobile number AND what service they want. Call again later to add details.',
    input_schema: { type: 'object', properties: { name: { type: 'string' }, mobile: { type: 'string', description: 'Philippine mobile, e.g. 09171234567' }, address: { type: 'string', description: 'Service location' }, property_type: { type: 'string', enum: ['Residential', 'Commercial'] }, service_codes: { type: 'array', items: { type: 'string' }, description: 'Codes from the service list, e.g. GLASS_EXT, ROOF, WALL, FLOOR, SOLAR' }, preferred_date: { type: 'string' }, details: { type: 'string', description: 'Everything useful: number of panels / floors / area, concerns, access' } }, required: ['name', 'mobile'] } },
  { name: 'needs_human', description: 'Hand the conversation to a TopMop staff member (complaint, custom or unusual job, price negotiation, urgent matter, anything you are not sure about, or the customer asks for a person).',
    input_schema: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] } },
];

async function knowledge(sb: ReturnType<typeof db>) {
  const [{ data: st }, { data: svcs }] = await Promise.all([sb.from('settings').select('data').eq('id', 'main').maybeSingle(), sb.from('services').select('code,name,unit,rate,minimum_qty,custom_quote,package_price,package_qty,excess_rate,packages').is('deleted_at', null)]);
  const company = st?.data?.company ?? {}; const notes = st?.data?.fb_ai?.notes ?? '';
  const peso = (n: number) => `PHP ${Number(n).toLocaleString('en-PH')}`;
  const lines = (svcs ?? []).filter((s) => s.code !== 'OTHER').map((s) => {
    if (s.custom_quote) return `- ${s.name} (code ${s.code}): price quoted per job after an ocular visit.`;
    let l = `- ${s.name} (code ${s.code}): ${peso(s.rate)} per ${s.unit}${s.minimum_qty > 1 ? `, minimum ${s.minimum_qty} ${s.unit}` : ''}.`;
    const pk = [...(s.package_price && s.package_qty ? [{ price: s.package_price, qty: s.package_qty, excess_rate: s.excess_rate ?? s.rate }] : []), ...(s.packages ?? [])];
    if (pk.length) l += ' Glass packages: ' + pk.map((p: { price: number; qty: number; excess_rate: number }) => `${peso(p.price)} for ${p.qty} panels (${peso(p.excess_rate)} per extra panel)`).join('; ') + '.';
    return l;
  });
  return { company, notes, services: lines.join('\n') };
}

function systemPrompt(k: Awaited<ReturnType<typeof knowledge>>) {
  return `You are the Facebook Page assistant of ${k.company.name ?? 'TopMop Window Cleaning Solutions Corp.'}, a window, glass, roof, wall, floor and solar-panel cleaning company in the Philippines. You reply to customers on Messenger.

Style: friendly, brief (2-4 short sentences), plain English or Taglish matching the customer. Ask ONE question at a time. Never use markdown.
Goal: answer simply, then collect: name, mobile number, service location/address, what service, rough size (number of window panels or floors, or sqm), preferred date. Then call save_lead, and tell them our team will contact them to confirm the schedule or set an ocular visit.

Rules:
- Only quote prices from the list below. Price is "starting from / estimate" and is confirmed in a written quotation. Never invent prices, discounts, availability or dates. Never promise a schedule.
- Never ask for payment details, passwords or card numbers.
- If asked something not covered, or a complaint, custom/unusual job, negotiation, urgency: call needs_human.
- You are an automated assistant; say so if asked. Company phone: ${k.company.phone ?? ''}.

Services and prices:
${k.services}

${k.notes ? `Extra facts from the owner:\n${k.notes}\n` : ''}`;
}

async function ensureLead(sb: ReturnType<typeof db>, conv: { id: string; psid: string; client_id?: string; inquiry_id?: string; name?: string }, a: Record<string, unknown>) {
  const mobile = String(a.mobile ?? '').trim(); const name = String(a.name ?? conv.name ?? 'Facebook lead').trim();
  const details = [a.property_type && `Property: ${a.property_type}`, a.preferred_date && `Preferred date: ${a.preferred_date}`, a.details, 'Source: Facebook Messenger (AI assistant)'].filter(Boolean).join('\n');
  const codes = Array.isArray(a.service_codes) ? a.service_codes.map(String) : [];
  let clientId = conv.client_id;
  if (!clientId) {
    const { data: br } = await sb.from('branches').select('id').limit(1);
    const { data: c, error } = await sb.from('clients').insert({ name, contact_person: name, mobile, address: String(a.address ?? ''), type: a.property_type === 'Commercial' ? 'Commercial' : 'Residential', status: 'Prospect', notes: 'Created from a Facebook message', branch_id: br?.[0]?.id }).select('id').single();
    if (error) throw new Error(error.message); clientId = c.id;
  }
  if (conv.inquiry_id) { await sb.from('inquiries').update({ details, service_codes: codes }).eq('id', conv.inquiry_id); return { clientId, inquiryId: conv.inquiry_id }; }
  const { data: inq, error } = await sb.from('inquiries').insert({ client_id: clientId, service_codes: codes, stage: 'Inquiry', source: 'Facebook', details }).select('id').single();
  if (error) throw new Error(error.message);
  return { clientId, inquiryId: inq.id as string };
}

async function handle(psid: string, text: string, mid: string | undefined, ts: number) {
  const sb = db();
  let { data: conv } = await sb.from('fb_conversations').select('*').eq('psid', psid).maybeSingle();
  if (!conv) {
    let name: string | undefined;
    try { const r = await fetch(`${GRAPH}/${psid}?fields=name&access_token=${encodeURIComponent(env('FB_PAGE_TOKEN'))}`); if (r.ok) name = (await r.json()).name; } catch { /* name is optional */ }
    const { data } = await sb.from('fb_conversations').insert({ psid, name }).select('*').single(); conv = data;
  }
  if (!conv) return;
  const at = new Date(ts || Date.now()).toISOString();
  const ins = await sb.from('fb_messages').insert({ conversation_id: conv.id, direction: 'in', text, mid, created_at: at });
  if (ins.error) return; // duplicate delivery from Facebook
  await sb.from('fb_conversations').update({ last_message_at: at, last_customer_at: at, status: conv.status === 'Closed' ? 'Open' : conv.status }).eq('id', conv.id);

  const { data: st } = await sb.from('settings').select('data').eq('id', 'main').maybeSingle();
  const mode = st?.data?.fb_ai?.mode ?? 'off';
  if (mode === 'off' || !env('ANTHROPIC_API_KEY')) return;

  const { data: hist } = await sb.from('fb_messages').select('direction,text,status').eq('conversation_id', conv.id).in('status', ['received', 'sent']).order('created_at', { ascending: false }).limit(20);
  const messages: { role: 'user' | 'assistant'; content: unknown }[] = [];
  for (const m of (hist ?? []).reverse()) { const role = m.direction === 'in' ? 'user' : 'assistant'; if (messages.length && messages[messages.length - 1].role === role) messages[messages.length - 1].content += `\n${m.text}`; else messages.push({ role, content: m.text }); }
  if (!messages.length || messages[0].role !== 'user') messages.unshift({ role: 'user', content: '(conversation start)' });

  const k = await knowledge(sb); const system = systemPrompt(k);
  let reply = ''; let humanReason: string | undefined; let leadIds: { clientId: string; inquiryId: string } | undefined;
  for (let round = 0; round < 4; round++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: env('FB_AI_MODEL') || 'claude-haiku-5-5', max_tokens: 600, system, tools: TOOLS, messages }) });
    if (!res.ok) { humanReason = `AI error ${res.status}`; break; }
    const out = await res.json() as { content: { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }[]; stop_reason: string };
    reply = out.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    const uses = out.content.filter((b) => b.type === 'tool_use');
    if (!uses.length) break;
    messages.push({ role: 'assistant', content: out.content });
    const results: unknown[] = [];
    for (const u of uses) {
      let result = 'ok';
      try {
        if (u.name === 'save_lead') { leadIds = await ensureLead(sb, { ...conv, client_id: leadIds?.clientId ?? conv.client_id, inquiry_id: leadIds?.inquiryId ?? conv.inquiry_id }, u.input ?? {}); result = 'Lead saved in the TopMop system.'; }
        else if (u.name === 'needs_human') { humanReason = String(u.input?.reason ?? 'Needs a person'); result = 'A staff member has been notified.'; }
      } catch (e) { result = `Error: ${(e as Error).message}`; }
      results.push({ type: 'tool_result', tool_use_id: u.id, content: result });
    }
    messages.push({ role: 'user', content: results });
    if (out.stop_reason !== 'tool_use') break;
  }

  const patch: Record<string, unknown> = {};
  if (leadIds) { patch.inquiry_id = leadIds.inquiryId; patch.client_id = leadIds.clientId; if (!humanReason) patch.status = 'Lead created'; }
  if (humanReason) { patch.needs_human = true; patch.human_reason = humanReason; patch.status = 'Needs a person'; }
  if (Object.keys(patch).length) await sb.from('fb_conversations').update(patch).eq('id', conv.id);
  if (!reply) return;
  // a reply that needs a person is never sent automatically
  if (mode === 'auto' && !humanReason) {
    try { await sendToFacebook(psid, reply); await sb.from('fb_messages').insert({ conversation_id: conv.id, direction: 'out', text: reply, status: 'sent', by_ai: true }); }
    catch (e) { await sb.from('fb_messages').insert({ conversation_id: conv.id, direction: 'out', text: reply, status: 'draft', by_ai: true, error: (e as Error).message.slice(0, 250) }); }
  } else await sb.from('fb_messages').insert({ conversation_id: conv.id, direction: 'out', text: reply, status: 'draft', by_ai: true });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    if (url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === env('FB_VERIFY_TOKEN') && env('FB_VERIFY_TOKEN')) return new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 });
    return new Response('forbidden', { status: 403 });
  }
  const raw = await req.text();
  if (!(await validSignature(req, raw))) return new Response('bad signature', { status: 401 });
  try {
    const body = JSON.parse(raw);
    for (const entry of body.entry ?? []) for (const ev of entry.messaging ?? []) {
      if (!ev.message || ev.message.is_echo || !ev.sender?.id) continue;
      const text = ev.message.text ?? (ev.message.attachments?.length ? '[The customer sent a photo or attachment]' : '');
      if (text) await handle(String(ev.sender.id), text, ev.message.mid, ev.timestamp);
    }
  } catch (e) { console.error('fb-webhook', (e as Error).message); }
  return new Response('ok'); // always answer 200 so Facebook does not keep retrying
});
