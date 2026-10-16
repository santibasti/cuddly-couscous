// Describes a photo for the Marketing AI's library: what it shows, tags, how good it looks, and anything that could identify a client.
// body: { image: string }  (a JPEG as base64, no prefix)  →  { description, tags, quality, privacy_note }
// Secrets: ANTHROPIC_API_KEY; optional AI_PHOTO_MODEL (default claude-haiku-5-5)
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: ok } = await asUser.rpc('can_manage_marketing');
  if (ok !== true) return json({ error: 'Not allowed' }, 403);
  if (!env('ANTHROPIC_API_KEY')) return json({ error: 'The AI key is not set up yet (ANTHROPIC_API_KEY).' }, 503);
  const { image } = await req.json().catch(() => ({}));
  if (typeof image !== 'string' || image.length < 100) return json({ error: 'No photo received.' }, 400);
  if (image.length > 3_000_000) return json({ error: 'The photo is too large.' }, 400);
  const system = 'You catalogue photos for the Facebook Page of a window, glass, solar panel and property-care cleaning company. Reply with JSON only: {"description":"one plain sentence of what the photo shows (subject, place type, what work or result is visible)","tags":["3 to 8 lowercase tags, e.g. glass, high-rise, solar panel, before, after, crew, equipment, roof, facade, interior, safety harness, tips"],"quality":1-5 (5 = sharp, well lit, good composition for a Page; 1 = blurry or dark or unflattering),"privacy_note":"empty string if safe, otherwise say briefly what could identify a person or client: a clear face, a licence plate, a house or street number, a name board or sign, a document"}.';
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env('AI_PHOTO_MODEL') || 'claude-haiku-5-5', max_tokens: 500, system, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } }, { type: 'text', text: 'Catalogue this photo.' }] }] }),
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? '';
    return json({ error: `The AI could not answer (${res.status}). ${detail}`.trim() }, 502);
  }
  const out = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (out.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
  try {
    const j = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as { description?: string; tags?: unknown; quality?: unknown; privacy_note?: unknown };
    const q = Math.round(Number(j.quality));
    return json({
      description: String(j.description ?? '').slice(0, 240),
      tags: Array.isArray(j.tags) ? j.tags.slice(0, 8).map((t) => String(t).toLowerCase().slice(0, 24)) : [],
      quality: q >= 1 && q <= 5 ? q : 3,
      privacy_note: String(j.privacy_note ?? '').slice(0, 200),
    });
  } catch { return json({ error: 'The AI answer could not be read. Try again.' }, 502); }
});
