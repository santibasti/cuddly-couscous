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

interface Cfg { mode?: 'off' | 'approve' | 'auto'; per_week?: number; days?: number[]; time?: string; topics?: string[]; voice?: string }
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

async function write(sb: Sb, cfg: Cfg, kind: string, ctx: string, recent: string[]): Promise<string> {
  const { data: st } = await sb.from('settings').select('data').eq('id', 'main').maybeSingle();
  const co = st?.data?.company ?? {}; const notes = st?.data?.fb_ai?.notes ?? '';
  const system = `You are the social media writer for ${co.name || 'TopMop Window Cleaning Solutions Corp.'}, a professional window, glass, solar panel and property-care cleaning company in the Philippines. Write ONE Facebook Page post.
Voice: ${cfg.voice || 'friendly, professional, easy to read; natural English with a light Filipino touch (Taglish is fine)'}.
Rules: 2–6 short lines, a clear hook in the first line, 0–3 relevant emojis, 2–4 hashtags at the end, a soft call to action (message us for a free quote). Never invent prices, discounts, awards, statistics, client names, addresses or promises. Do not mention anything you were not told. No markdown.
${notes ? 'Company facts:\n' + notes : ''}
Do not repeat these recent posts:\n${recent.slice(0, 8).map((t) => '- ' + t.slice(0, 120)).join('\n') || '(none yet)'}
Reply with the post text only.`;
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env('MARKETING_MODEL') || 'claude-sonnet-5-5', max_tokens: 500, system, messages: [{ role: 'user', content: `Post type: ${kind}.\n${ctx}` }] }) });
  if (!res.ok) { const d = ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? ''; throw new Error(`AI ${res.status}. ${d}`.trim()); }
  const out = (await res.json()) as { content?: { type: string; text?: string }[] };
  const t = (out.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('').trim();
  if (!t) throw new Error('The AI returned nothing.');
  return t;
}

/** Makes drafts so that about two weeks ahead are always planned. */
async function topUp(sb: Sb, cfg: Cfg, forceCount?: number) {
  if (!env('ANTHROPIC_API_KEY')) return { made: 0, note: 'ANTHROPIC_API_KEY is not set' };
  const perWeek = Math.min(7, Math.max(1, cfg.per_week ?? 2));
  const { data: open } = await sb.from('marketing_posts').select('scheduled_at, text, kind, job_id').in('status', ['Idea', 'Approved']);
  const { data: past } = await sb.from('marketing_posts').select('text, job_id').in('status', ['Posted']).order('posted_at', { ascending: false }).limit(10);
  const recent = [...(open ?? []).map((p) => p.text), ...(past ?? []).map((p) => p.text)];
  const want = forceCount ?? Math.max(0, perWeek * 2 - (open ?? []).filter((p) => Date.parse(p.scheduled_at) > Date.now()).length);
  if (!want) return { made: 0 };
  const taken = new Set((open ?? []).map((p) => p.scheduled_at));
  const free = slots(cfg, want + taken.size + 4, Date.now()).filter((s) => !taken.has(s)).slice(0, want);
  const topics = (cfg.topics?.length ? cfg.topics : Object.keys(TOPIC_TO_KIND)).map((t) => TOPIC_TO_KIND[t]).filter(Boolean);
  const usedJobs = new Set([...(open ?? []), ...(past ?? [])].map((p) => p.job_id).filter(Boolean));
  const { data: svc } = await sb.from('services').select('code, name');
  const nameOf = (c: string) => svc?.find((s) => s.code === c)?.name ?? c;
  const month = new Date(Date.now() + 8 * 3600_000).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  let made = 0;
  for (const [i, at] of free.entries()) {
    let kind = topics[(recent.length + i) % topics.length] ?? 'Tip';
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
    if (kind === 'Seasonal') ctx = `Write a seasonal post for the Philippines for ${month} (weather, typhoon/rainy season, dust/summer, holidays) tied to cleaning or property care.`;
    if (kind === 'Promo') ctx = 'Write a soft promotional post inviting people to book a free ocular visit or quotation. Do not mention any price or discount.';
    if (kind === 'Other') ctx = 'Write a short company post: our trained team, safety first (harness and fall protection), eco-safe products, or why regular cleaning protects glass and solar panels.';
    const text = await write(sb, cfg, kind, ctx, recent);
    recent.unshift(text);
    await sb.from('marketing_posts').insert({ kind, text, photo_ids: photoIds, job_id: jobId, scheduled_at: at, status: cfg.mode === 'auto' ? 'Approved' : 'Idea', by_ai: true });
    made++;
  }
  return { made };
}

async function fbPost(sb: Sb, p: { id: string; text: string; photo_ids: string[] }) {
  const token = env('FB_PAGE_TOKEN');
  if (!token) throw new Error('FB_PAGE_TOKEN is not set yet.');
  const media: { media_fbid: string }[] = [];
  if (p.photo_ids?.length) {
    const { data: ph } = await sb.from('job_photos').select('id, path, client_ok').in('id', p.photo_ids).eq('client_ok', true).is('deleted_at', null);
    for (const x of ph ?? []) {
      const { data: s } = await sb.storage.from('job-photos').createSignedUrl(x.path, 600);
      if (!s?.signedUrl) continue;
      const r = await fetch(`https://graph.facebook.com/v21.0/me/photos?access_token=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: s.signedUrl, published: false }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.id) throw new Error(`Facebook photo upload: ${JSON.stringify(j).slice(0, 200)}`);
      media.push({ media_fbid: j.id });
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
  const { data: p } = await sb.from('marketing_posts').select('id, text, photo_ids, status').eq('id', id).maybeSingle();
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
  const body = (await req.json().catch(() => ({}))) as { action?: string; count?: number; id?: string };
  const sb = db();
  const { data: st } = await sb.from('settings').select('data').eq('id', 'main').maybeSingle();
  const cfg = (st?.data?.marketing ?? {}) as Cfg;
  if (body.action === 'generate' || body.action === 'post_now') {
    const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: ok } = await asUser.rpc('can_manage_marketing');
    if (ok !== true) return json({ error: 'Not allowed' }, 403);
    if (body.action === 'post_now') { const r = await publish(sb, String(body.id ?? '')); return json(r, r.ok ? 200 : 502); }
    try { return json(await topUp(sb, { ...cfg, mode: cfg.mode === 'auto' ? 'auto' : 'approve' }, Math.min(5, Math.max(1, body.count ?? 3)))); } catch (e) { return json({ error: (e as Error).message }, 502); }
  }
  // scheduled tick (cron): drafts are only made, and approved posts only published, while the Marketing AI is switched on
  if (!cfg.mode || cfg.mode === 'off') return json({ note: 'Marketing AI is off' });
  let made = 0; let posted = 0; const errors: string[] = [];
  try { made = (await topUp(sb, cfg)).made ?? 0; } catch (e) { errors.push((e as Error).message); }
  const { data: due } = await sb.from('marketing_posts').select('id').eq('status', 'Approved').lte('scheduled_at', new Date().toISOString()).order('scheduled_at').limit(3);
  for (const p of due ?? []) { const r = await publish(sb, p.id); if (r.ok) posted++; else if (r.error) errors.push(r.error); }
  return json({ made, posted, errors });
});
