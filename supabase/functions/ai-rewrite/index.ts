// Rephrases a piece of a service report on request. Called by the app with the signed-in user's token; nothing is saved here.
// body: { text: string, mode: 'clearer'|'professional'|'shorter'|'simpler'|'fix'|'custom', instruction?: string, selection?: boolean }
// Secrets: ANTHROPIC_API_KEY; optional AI_REWRITE_MODEL (default claude-haiku-5-5)
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: cors });
const GOAL: Record<string, string> = {
  clearer: 'Rewrite it so it is clearer and easier to follow.',
  professional: 'Rewrite it in a more professional, polished tone suited to a client-facing report.',
  shorter: 'Make it shorter and more concise without losing any facts.',
  simpler: 'Rewrite it in simpler, plain English that any client can understand.',
  fix: 'Only fix spelling, grammar and punctuation. Keep the wording otherwise unchanged.',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const auth = req.headers.get('Authorization') ?? '';
  const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } } });
  const { data: u } = await asUser.auth.getUser();
  if (!u?.user) return json({ error: 'Please sign in again.' }, 401);
  if (!env('ANTHROPIC_API_KEY')) return json({ error: 'The AI key is not set up yet (ANTHROPIC_API_KEY).' }, 503);
  const { text, mode, instruction, selection } = await req.json().catch(() => ({}));
  const src = String(text ?? '').trim();
  if (!src) return json({ error: 'There is no text to rephrase.' }, 400);
  if (src.length > 6000) return json({ error: 'That text is too long. Select a smaller part.' }, 400);
  const goal = mode === 'custom' ? `Follow this instruction from the user: ${String(instruction ?? '').slice(0, 300)}` : (GOAL[String(mode)] ?? GOAL.clearer);
  const system = `You edit text for a window-cleaning company's service accomplishment report. ${goal}
Rules: keep every fact, number, date, name and measurement exactly as given; do not invent details; keep the same language as the input; keep the line structure (a blank line separates paragraphs, a line starting with "- " is a bullet) unless asked otherwise. ${selection ? 'The text is a fragment of a longer passage, so return only the rewritten fragment.' : ''} Reply with the rewritten text only, no quotes, no preface, no explanation.`;
  const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env('AI_REWRITE_MODEL') || 'claude-haiku-5-5', max_tokens: 1500, system, messages: [{ role: 'user', content: src }] }) });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? '';
    return json({ error: `The AI could not answer (${res.status}). ${detail}`.trim() }, 502);
  }
  const out = (await res.json()) as { content?: { type: string; text?: string }[] };
  const result = (out.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('').trim();
  if (!result) return json({ error: 'The AI returned nothing. Try again.' }, 502);
  return json({ text: result });
});
