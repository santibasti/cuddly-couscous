// Marketing AI for the Facebook Page: writes post drafts on a schedule (tips, recently completed jobs, seasonal and promo posts) and publishes the approved ones when they are due.
// Runs every hour (pg_cron, migration 0058). Off until Admin → Settings → "Marketing AI" is switched on.
// body: { action: 'tick' }  (cron)   |   { action: 'generate', count?: number }  |   { action: 'post_now', id: string }  — the last two need a signed-in user with marketing.manage.
// Secrets: ANTHROPIC_API_KEY (writes the posts); FB_PAGE_TOKEN (publishes — a Page token with pages_manage_posts); optional MARKETING_MODEL (default claude-sonnet-5-5).
// Only photos marked "client agreed to marketing use" are ever posted, and the AI is never given client names, addresses or prices.
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: cors });
const db = () => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
const DONE = ['Work Completed', 'Leaving Site', 'Arrived at HQ', 'Closed'];
const TOPIC_TO_KIND: Record<string, string> = { 'Tips & tricks': 'Tip', 'Completed jobs': 'Completed job', 'Promos': 'Promo', 'Seasonal': 'Seasonal', 'Company news': 'Other' };

interface Cfg { mode?: 'off' | 'approve' | 'auto'; per_week?: number; days?: number[]; time?: string; topics?: string[]; voice?: string; tone?: string; website?: string; brief?: string; email?: string }
type Sb = ReturnType<typeof db>;

/** The next `n` slots (UTC ISO strings) on the chosen weekdays at the chosen Manila time, after `after`. */
function slots(cfg: Cfg, n: number, after: number): string[] {
  const days = cfg.days?.length ? cfg.days : [1, 4]; const [h, m] = (cfg.time || '10:00').split(':').map(Number); const out: string[] = [];
  const start = new Date(Date.now() + 8 * 3600_000); start.setUTCHours(0, 0, 0, 0);
  for (let i = 0; out.length < n && i < 120; i++) {
    const d = new Date(start.getTime() + i * 86400_000); if (!days.includes(d.getUTCDay())) continue;
    const at = d.getTime() + (h * 60 + m) * 60_000 - 8 * 3600_000; if (at > after) out.push(new Date(at).toISOString());
  }
  return out;
}

interface Poster { kicker: string; badge: string; badge_sub: string; areas: string[]; urgency: string; urgency_sub: string; features: { icon: string; label: string }[]; cards: { label: string; value: string }[]; note: string }
interface Graphic { on: boolean; headline: string; sub: string; points: string[]; style: 'auto'; poster: Poster }
const ICONS = ['window', 'house', 'building', 'solar', 'shield', 'leaf', 'calendar', 'clock', 'sparkle', 'check', 'drop'];
const str = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const cleanPoster = (v: unknown): Poster => {
  const q = (v ?? {}) as Record<string, unknown>; const arr = (x: unknown) => (Array.isArray(x) ? x : []);
  return { kicker: str(q.kicker, 28), badge: str(q.badge, 24), badge_sub: str(q.badge_sub, 36), areas: arr(q.areas).slice(0, 4).map((a) => str(a, 22)).filter(Boolean), urgency: str(q.urgency, 34), urgency_sub: str(q.urgency_sub, 30),
    features: arr(q.features).slice(0, 3).map((f) => ({ icon: ICONS.includes(str((f as { icon?: unknown })?.icon, 12)) ? str((f as { icon?: unknown }).icon, 12) : 'check', label: str((f as { label?: unknown })?.label, 34) })).filter((f) => f.label),
    cards: arr(q.cards).slice(0, 2).map((c) => ({ label: str((c as { label?: unknown })?.label, 26), value: str((c as { value?: unknown })?.value, 22) })).filter((c) => c.label || c.value), note: str(q.note, 110) };
};
interface Lib { id: string; description: string; tags: string[] }
async function write(sb: Sb, cfg: Cfg, kind: string, ctx: string, recent: string[], lib: Lib[] = []): Promise<{ text: string; graphic: Graphic; media_ids: string[] }> {
  const { data: st } = await sb.from('settings').select('data').eq('id', 'main').maybeSingle();
  const co = st?.data?.company ?? {}; const notes = st?.data?.fb_ai?.notes ?? '';
  const system = `You are the social media writer for ${co.name || 'TopMop Window Cleaning Solutions Corp.'}, a professional window, glass, solar panel and property-care cleaning company in the Philippines. Write ONE Facebook Page post.
Voice: ${cfg.voice || 'easy to read; natural English with a light Filipino touch (Taglish is fine)'}.
Tone: ${cfg.tone && cfg.tone !== 'Mixed' ? cfg.tone : 'friendly and professional; vary the mood naturally from post to post'}. Let the tone show in the words, never state it.
Rules: 2–6 short lines, a clear hook in the first line, 0–3 relevant emojis, 2–4 hashtags at the end, a soft call to action (message us for a free quote). Never invent prices, discounts, awards, statistics, client names, addresses or promises. Do not mention anything you were not told. TopMop does NOT do high-rise work: never mention high-rise buildings, tall towers, rope access, harnesses or fall protection. No markdown.
${cfg.brief ? 'COMPANY KNOWLEDGE (authoritative — write only from these facts; if something is not here, do not claim it):\n' + cfg.brief.slice(0, 7000) : ''}
${notes ? 'More company facts:\n' + notes : ''}
Do not repeat these recent posts:\n${recent.slice(0, 8).map((t) => '- ' + t.slice(0, 120)).join('\n') || '(none yet)'}
Reply with JSON only, no markdown fence: {"text":"the post","graphic":{"headline":"max 6 words, the big bold title","sub":"max 22 words, one plain sentence under it","poster":{"kicker":"1-3 words shown first in colour (a place or a hook) or empty","badge":"max 3 words, the offer (for example FREE) or empty","badge_sub":"max 5 words under the badge or empty","areas":["up to 4 places — only places named in the company knowledge or the owner request"],"urgency":"max 5 words or empty — only when the request or company knowledge says slots or dates are limited","urgency_sub":"max 4 words or empty","features":[{"icon":"one of: window, house, building, solar, shield, leaf, calendar, clock, sparkle, check, drop","label":"max 4 words"}],"cards":[{"label":"max 3 words","value":"max 3 words"}],"note":"max 14 words or empty"}}}. Poster rules: features = up to 3 key benefits, steps or tips; cards = up to 2, ONLY real dates or hours stated in the request or company knowledge; leave any block empty rather than invent it; never invent offers, dates, prices or places; for a tip post put the tips in features and leave badge, urgency and cards empty. The graphic words are printed on an image, so no hashtags or emojis in them. ${lib.length ? ` Add "media_ids":[...] to the JSON: pick up to 2 photos from the library below that genuinely fit THIS post, or an empty list if none fit. Never pick a photo that does not match the topic.\nPhoto library (id | what it shows | tags):\n${lib.map((m) => `${m.id} | ${m.description} | ${m.tags.join(', ')}`).join('\n')}` : ''}`;
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env('MARKETING_MODEL') || 'claude-sonnet-5-5', max_tokens: 1300, system, messages: [{ role: 'user', content: `Post type: ${kind}.\n${ctx}` }] }) });
  if (!res.ok) { const d = ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? ''; throw new Error(`AI ${res.status}. ${d}`.trim()); }
  const out = (await res.json()) as { content?: { type: string; text?: string }[] };
  const t = (out.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('').trim();
  if (!t) throw new Error('The AI returned nothing.');
  try {
    const j = JSON.parse(t.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as { text?: string; graphic?: { headline?: string; sub?: string; points?: unknown; poster?: unknown } };
    if (j.text) {
      const g = j.graphic ?? {};
      const pick = (Array.isArray((j as { media_ids?: unknown }).media_ids) ? (j as { media_ids: unknown[] }).media_ids : []).map(String).filter((id) => lib.some((m) => m.id === id)).slice(0, 2);
      return { text: String(j.text).trim(), media_ids: pick, graphic: { on: true, headline: str(g.headline, 60), sub: str(g.sub, 160), points: Array.isArray(g.points) ? g.points.slice(0, 3).map((x) => String(x).slice(0, 60)) : [], style: 'auto', poster: cleanPoster(g.poster) } };
    }
  } catch { /* the model answered with plain text */ }
  return { text: t, media_ids: [], graphic: { on: true, headline: t.split('\n')[0].replace(/[#@]\S+/g, '').slice(0, 60).trim(), sub: '', points: [], style: 'auto', poster: cleanPoster({}) } };
}

const htmlToText = (html: string) => html.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<\/(p|div|li|h[1-6]|tr|section|br)>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

/** Reads the company website (home page + a few of its own pages) and has the AI write a factual company brief. */
async function learn(website: string): Promise<string> {
  let base: URL;
  try { base = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`); } catch { throw new Error('That website address is not valid.'); }
  if (base.protocol !== 'https:' && base.protocol !== 'http:') throw new Error('Use an http or https address.');
  if (!base.hostname.includes('.') || /^[\d.]+$/.test(base.hostname) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.)/.test(base.hostname)) throw new Error('Use your public website address, for example www.topmop.ph.');
  const get = async (u: string) => { const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TopMopBot/1.0)' }, signal: AbortSignal.timeout(12000), redirect: 'follow' }); if (!r.ok) throw new Error(`${u} answered ${r.status}`); return r.text(); };
  let home = '';
  try { home = await get(base.toString()); } catch (e) { throw new Error(`Could not open the website: ${(e as Error).message}`); }
  const host = base.hostname.replace(/^www\./, '');
  const links = new Map<string, number>();
  for (const m of home.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], base); u.hash = '';
      if (u.hostname.replace(/^www\./, '') !== host || !/^https?:$/.test(u.protocol) || /\.(jpe?g|png|gif|svg|webp|pdf|zip|css|js|ico|mp4)$/i.test(u.pathname) || u.href === base.href) continue;
      const score = (/(about|who-we|story|company)/i.test(u.pathname) ? 5 : 0) + (/(service|solution|offer|what-we)/i.test(u.pathname) ? 6 : 0) + (/(clean|window|glass|solar|roof|facade|floor|wall|ceiling|gutter|maintenance)/i.test(u.pathname) ? 4 : 0) + (/(faq|why|safety|project|portfolio|client|area|contact|package|price)/i.test(u.pathname) ? 3 : 0);
      links.set(u.href, Math.max(score, links.get(u.href) ?? 0));
    } catch { /* ignore bad links */ }
  }
  const pages = [...links.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([u]) => u);
  let text = `PAGE ${base.href}\n${htmlToText(home).slice(0, 9000)}`;
  const rest = await Promise.allSettled(pages.map(async (u) => `\n\nPAGE ${u}\n${htmlToText(await get(u)).slice(0, 5000)}`));
  for (const r of rest) if (r.status === 'fulfilled') text += r.value;
  if (text.replace(/PAGE \S+/g, '').trim().length < 400) throw new Error('The website text could not be read (the site may load its content with scripts). Paste the key facts into the box instead.');
  const system = `You write a factual company brief for the social media writer of a cleaning company, using ONLY the website text provided. Structure it with these headings: WHO WE ARE; SERVICES (each service with the specifics the site gives — methods, equipment, where it applies, benefits); CLIENTS AND SECTORS; SERVICE AREAS; WHAT MAKES US DIFFERENT (safety, training, equipment, products, certifications, experience); PHRASES AND STYLE the site uses; CONTACT; THINGS NOT STATED (list what the site does not say, such as prices, awards, years, so nobody invents them). Plain text, short bullet lines starting with "- ". Never add facts that are not in the text. Keep it under 900 words.`;
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env('MARKETING_MODEL') || 'claude-sonnet-5-5', max_tokens: 2200, system, messages: [{ role: 'user', content: text.slice(0, 45000) }] }) });
  if (!res.ok) { const d = ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? ''; throw new Error(`AI ${res.status}. ${d}`.trim()); }
  const out = (await res.json()) as { content?: { type: string; text?: string }[] };
  const brief = (out.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('').trim();
  if (!brief) throw new Error('The AI returned nothing.');
  return brief;
}

/** Makes drafts so that about two weeks ahead are always planned. */
async function topUp(sb: Sb, cfg: Cfg, forceCount?: number, ask?: { prompt: string; kind?: string; at?: string }) {
  const { data: libRows } = await sb.from('marketing_media').select('id, description, tags, used_count, quality').is('deleted_at', null).eq('ok_to_use', true).gte('quality', 3).order('used_count').order('created_at', { ascending: false }).limit(40);
  const library: Lib[] = (libRows ?? []).map((m) => ({ id: m.id, description: m.description, tags: m.tags ?? [] }));
  if (!env('ANTHROPIC_API_KEY')) return { made: 0, note: 'ANTHROPIC_API_KEY is not set' };
  const perWeek = Math.min(7, Math.max(1, cfg.per_week ?? 2));
  const { data: open } = await sb.from('marketing_posts').select('scheduled_at, text, kind, job_id').in('status', ['Idea', 'Approved']);
  const { data: past } = await sb.from('marketing_posts').select('text, job_id').in('status', ['Posted']).order('posted_at', { ascending: false }).limit(10);
  const recent = [...(open ?? []).map((p) => p.text), ...(past ?? []).map((p) => p.text)];
  const want = forceCount ?? Math.max(0, perWeek * 2 - (open ?? []).filter((p) => Date.parse(p.scheduled_at) > Date.now()).length);
  if (!want) return { made: 0 };
  const taken = new Set((open ?? []).map((p) => p.scheduled_at));
  const free = ask?.at && Date.parse(ask.at) > Date.now() ? [new Date(ask.at).toISOString()] : slots(cfg, want + taken.size + 4, Date.now()).filter((s) => !taken.has(s)).slice(0, want);
  const topics = (cfg.topics?.length ? cfg.topics : Object.keys(TOPIC_TO_KIND)).map((t) => TOPIC_TO_KIND[t]).filter(Boolean);
  const usedJobs = new Set([...(open ?? []), ...(past ?? [])].map((p) => p.job_id).filter(Boolean));
  const { data: svc } = await sb.from('services').select('code, name');
  const nameOf = (c: string) => svc?.find((s) => s.code === c)?.name ?? c;
  const month = new Date(Date.now() + 8 * 3600_000).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  let made = 0;
  for (const [i, at] of free.entries()) {
    let kind = ask ? (['Tip', 'Completed job', 'Promo', 'Seasonal', 'Other'].includes(ask.kind ?? '') ? (ask.kind as string) : 'Other') : (topics[(recent.length + i) % topics.length] ?? 'Tip');
    let ctx = `Pick something useful for property owners and facility managers. Current month: ${month}.`;
    let jobId: string | null = null; let photoIds: string[] = [];
    if (kind === 'Completed job') {
      const { data: jobs } = await sb.from('jobs').select('id, service_codes, end_at').is('deleted_at', null).in('status', DONE).order('end_at', { ascending: false }).limit(40);
      for (const j of jobs ?? []) {
        if (usedJobs.has(j.id)) continue;
        const { data: ph } = await sb.from('job_photos').select('id, kind').eq('job_id', j.id).eq('client_ok', true).is('deleted_at', null).limit(8);
        if (!ph?.length) continue;
        jobId = j.id; usedJobs.add(j.id);
        photoIds = [...ph.filter((p) => p.kind === 'Before'), ...ph.filter((p) => p.kind === 'After'), ...ph.filter((p) => p.kind !== 'Before' && p.kind !== 'After')].slice(0, 4).map((p) => p.id);
        ctx = `A job we just finished: ${(j.service_codes as string[]).map(nameOf).join(', ')}. Photos are attached to the post. Speak generally ("a commercial building", "a home") — do not say who or where.`;
        break;
      }
      if (!jobId) kind = 'Tip';
    }
    if (ask) ctx = `The owner has asked for this specific post. Follow the request closely, using only the company knowledge and what the request itself says. Do not add facts that are in neither.\nOWNER REQUEST: ${ask.prompt.slice(0, 1200)}\n${ctx.startsWith('A job we just finished') ? ctx : ''}`;
    if (!ask && kind === 'Seasonal') ctx = `Write a seasonal post for the Philippines for ${month} (weather, typhoon/rainy season, dust/summer, holidays) tied to cleaning or property care.`;
    if (!ask && kind === 'Promo') ctx = 'Write a soft promotional post inviting people to book a free ocular visit or quotation. Do not mention any price or discount.';
    if (!ask && kind === 'Other') ctx = 'Write a short company post: our professional, trained crews, careful and tidy work, eco-safe products, or why regular cleaning protects glass and solar panels.';
    const { text, graphic, media_ids } = await write(sb, cfg, kind, ctx, recent, photoIds.length ? [] : library);
    recent.unshift(text);
    await sb.from('marketing_posts').insert({ kind, text, graphic, media_ids, photo_ids: photoIds, job_id: jobId, scheduled_at: at, status: cfg.mode === 'auto' ? 'Approved' : 'Idea', by_ai: true });
    for (const id of media_ids) { const row = libRows?.find((m) => m.id === id); await sb.from('marketing_media').update({ used_count: (row?.used_count ?? 0) + 1, last_used_at: new Date().toISOString() }).eq('id', id); if (row) { row.used_count++; library.sort((a, b) => (libRows?.find((m) => m.id === a.id)?.used_count ?? 0) - (libRows?.find((m) => m.id === b.id)?.used_count ?? 0)); } }
    made++;
  }
  return { made };
}

async function fbPost(sb: Sb, p: { id: string; text: string; photo_ids: string[]; media_ids?: string[]; image_path?: string | null }) {
  const token = env('FB_PAGE_TOKEN');
  if (!token) throw new Error('FB_PAGE_TOKEN is not set yet.');
  const media: { media_fbid: string }[] = [];
  const up = async (signedUrl: string) => {
    const r = await fetch(`https://graph.facebook.com/v21.0/me/photos?access_token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: signedUrl, published: false }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.id) throw new Error(`Facebook photo upload: ${JSON.stringify(j).slice(0, 200)}`);
    media.push({ media_fbid: j.id });
  };
  if (p.image_path) { const { data: g } = await sb.storage.from('marketing-graphics').createSignedUrl(p.image_path, 600); if (g?.signedUrl) await up(g.signedUrl); }
  if (p.media_ids?.length) {
    const { data: lm } = await sb.from('marketing_media').select('id, path').in('id', p.media_ids).eq('ok_to_use', true).is('deleted_at', null);
    for (const x of lm ?? []) { const { data: g } = await sb.storage.from('marketing-graphics').createSignedUrl(x.path, 600); if (g?.signedUrl) await up(g.signedUrl); }
  }
  if (p.photo_ids?.length) {
    const { data: ph } = await sb.from('job_photos').select('id, path, client_ok').in('id', p.photo_ids).eq('client_ok', true).is('deleted_at', null);
    for (const x of ph ?? []) {
      const { data: s } = await sb.storage.from('job-photos').createSignedUrl(x.path, 600);
      if (!s?.signedUrl) continue;
      await up(s.signedUrl);
    }
  }
  const body: Record<string, unknown> = { message: p.text };
  if (media.length) body.attached_media = media;
  const r = await fetch(`https://graph.facebook.com/v21.0/me/feed?access_token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) throw new Error(`Facebook: ${JSON.stringify(j).slice(0, 220)}`);
  return String(j.id);
}

async function publish(sb: Sb, id: string) {
  const { data: p } = await sb.from('marketing_posts').select('id, text, photo_ids, media_ids, image_path, status').eq('id', id).maybeSingle();
  if (!p || (p.status !== 'Approved' && p.status !== 'Failed')) return { ok: false, error: 'Only an approved post can be posted.' };
  try {
    const fb = await fbPost(sb, p);
    await sb.from('marketing_posts').update({ status: 'Posted', fb_post_id: fb, posted_at: new Date().toISOString(), error: null, updated_at: new Date().toISOString() }).eq('id', id);
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message;
    await sb.from('marketing_posts').update({ status: 'Failed', error: msg.slice(0, 400), updated_at: new Date().toISOString() }).eq('id', id);
    return { ok: false, error: msg };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const body = (await req.json().catch(() => ({}))) as { action?: string; count?: number; id?: string; tone?: string; website?: string; prompt?: string; kind?: string; at?: string };
  const sb = db();
  const { data: st } = await sb.from('settings').select('data').eq('id', 'main').maybeSingle();
  const cfg = (st?.data?.marketing ?? {}) as Cfg;
  if (body.action === 'generate' || body.action === 'post_now' || body.action === 'learn') {
    const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: ok } = await asUser.rpc('can_manage_marketing');
    if (ok !== true) return json({ error: 'Not allowed' }, 403);
    if (body.action === 'learn') { try { return json({ brief: await learn(String(body.website ?? cfg.website ?? 'https://www.topmop.ph')) }); } catch (e) { return json({ error: (e as Error).message }, 502); } }
    if (body.action === 'post_now') { const r = await publish(sb, String(body.id ?? '')); return json(r, r.ok ? 200 : 502); }
    try { return json(await topUp(sb, { ...cfg, tone: body.tone || cfg.tone, mode: cfg.mode === 'auto' ? 'auto' : 'approve' }, Math.min(5, Math.max(1, body.prompt ? 1 : (body.count ?? 3))), body.prompt?.trim() ? { prompt: body.prompt, kind: body.kind, at: body.at } : undefined)); } catch (e) { return json({ error: (e as Error).message }, 502); }
  }
  // scheduled tick (cron): drafts are only made, and approved posts only published, while the Marketing AI is switched on
  if (!cfg.mode || cfg.mode === 'off') return json({ note: 'Marketing AI is off' });
  let made = 0; let posted = 0; const errors: string[] = [];
  try { made = (await topUp(sb, cfg)).made ?? 0; } catch (e) { errors.push((e as Error).message); }
  const { data: due } = await sb.from('marketing_posts').select('id').eq('status', 'Approved').lte('scheduled_at', new Date().toISOString()).order('scheduled_at').limit(3);
  for (const p of due ?? []) { const r = await publish(sb, p.id); if (r.ok) posted++; else if (r.error) errors.push(r.error); }
  return json({ made, posted, errors });
});
