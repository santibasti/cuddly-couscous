// Finds the parts of a site photo that identify a client (faces, licence plates, house numbers, name boards) so the app can blur them.
// body: { image: string }  (a JPEG as base64, no prefix)  →  { boxes: { label: string, x: number, y: number, w: number, h: number }[] }  (fractions 0–1 of the picture)
// Secrets: ANTHROPIC_API_KEY; optional AI_PRIVACY_MODEL (default claude-haiku-5-5)
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: cors });
const num = (v: unknown) => Math.min(1, Math.max(0, Number(v) || 0));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: u } = await asUser.auth.getUser();
  if (!u?.user) return json({ error: 'Please sign in again.' }, 401);
  if (!env('ANTHROPIC_API_KEY')) return json({ error: 'The AI key is not set up yet (ANTHROPIC_API_KEY).' }, 503);
  const { image } = await req.json().catch(() => ({}));
  if (typeof image !== 'string' || image.length < 100) return json({ error: 'No photo received.' }, 400);
  if (image.length > 3_000_000) return json({ error: 'The photo is too large.' }, 400);
  const system = 'You find privacy-sensitive details in photos taken at a client\'s property. Reply with JSON only: {"boxes":[{"label":"face|person|plate|house number|sign|document|other","x":0.0,"y":0.0,"w":0.0,"h":0.0}]}. x,y is the top-left corner and w,h the size, as fractions of the full picture width and height (0 to 1). Include faces, whole people, vehicle licence plates, house or street numbers, name boards, readable signs, and papers with text. Make boxes slightly generous. If there are none, return {"boxes":[]}.';
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env('AI_PRIVACY_MODEL') || 'claude-haiku-5-5', max_tokens: 1000, system, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } }, { type: 'text', text: 'List the privacy-sensitive boxes.' }] }] }) });
  if (!res.ok) { const detail = ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? ''; return json({ error: `The AI could not answer (${res.status}). ${detail}`.trim() }, 502); }
  const out = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (out.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
  let boxes: { label: string; x: number; y: number; w: number; h: number }[] = [];
  try {
    const m = text.match(/\{[\s\S]*\}/); const arr = (JSON.parse(m?.[0] ?? '{}') as { boxes?: Record<string, unknown>[] }).boxes ?? [];
    boxes = arr.slice(0, 30).map((b) => { const x = num(b.x), y = num(b.y); return { label: String(b.label ?? 'other').slice(0, 24), x, y, w: Math.min(num(b.w), 1 - x), h: Math.min(num(b.h), 1 - y) }; }).filter((b) => b.w > 0.01 && b.h > 0.01);
  } catch { return json({ error: 'The AI answer could not be read. Try again.' }, 502); }
  return json({ boxes });
});
