// Executive tab: writes the business analysis from the company's own computed figures, and (separately) researches the outside market.
// body: { mode: 'analysis' | 'research', summary: object }   → { result: {...}, model: string }
// The figures are calculated by the app; the AI is told to use only those numbers and to label every claim as data, assumption or research.
// Two modes are called separately so each stays well inside the function time limit.
// Secrets: ANTHROPIC_API_KEY; optional AI_EXECUTIVE_MODEL (default claude-opus-5-5), AI_EXECUTIVE_RESEARCH_MODEL (default claude-sonnet-5-5)
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: cors });

const CONTEXT = `The business is TopMop Window Cleaning Solutions Corp., a Philippine company that cleans building glass and facades and maintains surfaces for commercial and residential clients (Metro Manila and nearby provinces). Crews of trained technicians work from a headquarters with company vehicles and equipment. Amounts are in Philippine pesos, revenue is net of VAT.`;

const ANALYSIS_SYSTEM = `You are a seasoned operator who has scaled service businesses into very large companies, advising the owner of a small Philippine window-cleaning company. Be direct, practical and honest — including when the data is thin or the answer is "not yet". ${CONTEXT}

RULES
- Use ONLY the figures in the data you are given. Never invent a number, benchmark or statistic. If you need something that is not in the data, list it under "data_gaps" instead.
- Every recommendation says whether it rests on the company's data ("data") or on an assumption ("assumption"), and how confident you are.
- The forecast and the capacity / constraint findings were calculated by the software: explain and interrogate them, do not recompute them differently. Say what could make the forecast wrong.
- Answer the owner's two questions explicitly: what the forecast means for the next three months, and whether OPERATIONS (crew, vehicles, scheduling, delivery) are the constraint on growth or whether demand (sales) is. Use the capacity numbers as evidence.
- Prefer a few high-leverage decisions over a long list. Rank by expected impact. Consider margins by service, pricing, capacity, repeat business, collections and cash, hiring, equipment and risk.
- Do not give legal, tax or safety-compliance rulings; flag them for a professional.
Reply with JSON only, exactly in this shape (no text outside the JSON):
{"headline":"one sentence",
"health":"strong|steady|watch|at_risk",
"summary":"3-5 sentences for the owner",
"working":["what is going well, with the figure that shows it"],
"risks":[{"risk":"","why":"","severity":"high|medium|low"}],
"constraints":{"verdict":"operations|demand|balanced|unclear","explanation":"2-4 sentences","evidence":["figures that support it"],"what_to_do":["concrete steps"]},
"forecast":{"outlook":"what the next 3 months look like in plain words","assumptions":["..."],"could_change_it":["..."]},
"decisions":[{"title":"","why":"","expected_impact":"","effort":"low|medium|high","confidence":"low|medium|high","basis":"data|assumption","first_step":""}],
"plan":{"days_30":[""],"days_60":[""],"days_90":[""]},
"questions":["things only the owner can answer that would sharpen this advice"],
"data_gaps":["data the system does not record that would help"]}
Give at most 6 decisions, 5 risks and 4 items in each plan list.`;

const RESEARCH_SYSTEM = `You research for the owner of a small Philippine window-cleaning / facade-maintenance company. ${CONTEXT}
Use web search to find CURRENT, verifiable information that could improve the business: market demand and growth drivers in the Philippines, typical pricing and how competitors position themselves, adjacent services worth adding (for example solar-panel cleaning, pressure washing, janitorial / facade maintenance contracts), equipment or safety practice for work at height, recurring-contract and pricing models, and ways to win commercial clients (property managers, malls, offices, condominiums).
RULES
- Every finding needs a source URL you actually found. If you cannot verify something, leave it out or say it is unverified. Never invent figures, companies or links.
- Keep the focus on what THIS company could do. Mention the company's own numbers only if given below.
- Be concise.
Reply with JSON only (no text outside it):
{"findings":[{"topic":"","finding":"","why_it_matters":"","source_title":"","source_url":""}],
"ideas":[{"idea":"","how_to_test_cheaply":"","source_url":""}],
"caution":"one sentence on how reliable this research is"}
At most 8 findings and 5 ideas.`;

async function call(model: string, system: string, user: string, maxTokens: number, web: boolean) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 135_000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctl.signal, headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }], ...(web ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }] } : {}) }),
    });
    if (!res.ok) { const d = ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? ''; throw new Error(`The AI could not answer (${res.status}). ${d}`.trim()); }
    const out = (await res.json()) as { content?: { type: string; text?: string }[] };
    return (out.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
  } catch (e) { if ((e as Error).name === 'AbortError') throw new Error('The AI took too long. Try again.'); throw e; } finally { clearTimeout(timer); }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const [{ data: ok }, body] = await Promise.all([asUser.rpc('can_view_executive'), req.json().catch(() => ({}))]);
  if (ok !== true) return json({ error: 'Not allowed' }, 403);
  if (!env('ANTHROPIC_API_KEY')) return json({ error: 'The AI key is not set up yet (ANTHROPIC_API_KEY).' }, 503);
  const { mode, summary } = body as { mode?: string; summary?: unknown };
  if (mode !== 'analysis' && mode !== 'research') return json({ error: 'Unknown report part.' }, 400);
  const data = JSON.stringify(summary ?? {});
  if (data.length < 20 || data.length > 60_000) return json({ error: 'The business summary is missing or too large.' }, 400);
  try {
    const model = mode === 'analysis' ? (env('AI_EXECUTIVE_MODEL') || 'claude-opus-5-5') : (env('AI_EXECUTIVE_RESEARCH_MODEL') || 'claude-sonnet-5-5');
    const raw = mode === 'analysis'
      ? await call(model, ANALYSIS_SYSTEM, `Company data (calculated by the software, totals and trends only):\n${data}`, 5000, false)
      : await call(model, RESEARCH_SYSTEM, `What the company's own numbers show (for focus only):\n${data}`, 4000, true);
    const result = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? 'null');
    if (!result || typeof result !== 'object') return json({ error: 'The AI answer could not be read. Try again.' }, 502);
    return json({ result, model });
  } catch (e) { return json({ error: (e as Error).message || 'The AI could not answer.' }, 502); }
});
