// The starting rates and, when the customer gives a quantity, an estimate (ManyChat or any tool that can call a web address). Read-only, no database: the figures come from the approved rate table.
// POST JSON, key in  x-api-key: <LEAD_INTAKE_KEY>  or  ?key=<LEAD_INTAKE_KEY>
//   optional "property_type": "Residential" | "Commercial" (a commercial property is never priced from the rate table: the answer asks for the details and says a person will quote)
//   optional "with_main": true (alias "with_glass") = this service is booked together with another main service (a window cleaning package, roof cleaning ...): its minimum charge is waived and the estimate is simply rate x quantity (the first service keeps its own minimum)
//   { "address": "Makati", "service": "window cleaning", "panels": 40 }     (service optional; "panels" may be "qty"; for roof / wall / floor send square metres as "qty")
// Optional "lang": "en" | "tl" | "taglish" → "reply" holds the ready-to-send text in that language (Taglish customers get Taglish).
// Answer: { ok, kind, place, package_price, included, extra_rate, qty, extra_qty, estimate, rates_en, rates_tl, estimate_en, estimate_tl }
// The estimate always says that the crew does the final count on site and the final amount follows it. If the city is unknown, ok is false and the text says a person will verify the rate.
import { estimate } from '../_shared/estimate.ts';
import { parseLang } from '../chat-availability/logic.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, x-api-key, authorization, apikey', 'Content-Type': 'application/json' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: cors });
const safeEq = (a: string, b: string) => { const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b); let d = x.length ^ y.length; for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0); return d === 0; };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  const key = env('LEAD_INTAKE_KEY'); const given = req.headers.get('x-api-key') ?? new URL(req.url).searchParams.get('key') ?? '';
  if (!key || !safeEq(given, key)) return json({ error: 'Invalid or missing key' }, 401);
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null; if (!b) return json({ error: 'Send a JSON body' }, 400);
  const e = estimate(String(b.address ?? b.city ?? b.location ?? '').slice(0, 300), String(b.service ?? '').slice(0, 200), Number(b.panels ?? b.qty ?? b.quantity), String(b.property_type ?? b.type ?? ''), [b.with_main, b.with_glass].some((v) => v === true || v === 'true')); const lang = parseLang(b.lang ?? b.language);
  const rates = lang === 'tl' ? e.rates_tl : lang === 'taglish' ? e.rates_tglish : e.rates_en, est = lang === 'tl' ? e.estimate_tl : lang === 'taglish' ? e.estimate_tglish : e.estimate_en;
  return json({ ...e, rates, estimate_text: est, reply: est || rates });                                  // reply = the estimate when a quantity was given, else the starting rates, in the customer's language
});
