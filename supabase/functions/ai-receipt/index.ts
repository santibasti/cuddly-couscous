// Reads a photographed Philippine official receipt / sales invoice and returns the details BIR filing needs.
// body: { image: string }  (a JPEG as base64, no prefix)  →  { fields: {...}, unreadable: string[], low_confidence: string[], notes: string }
// It transcribes only what is printed: anything erased, faded or missing comes back null — it never guesses a TIN, name or amount.
// Secrets: ANTHROPIC_API_KEY; optional AI_RECEIPT_MODEL (default claude-sonnet-5-5)
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: cors });
const money = (v: unknown) => { if (v === null || v === undefined || v === '') return null; const n = Number(String(v).replace(/[^\d.\-]/g, '')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; };
const text = (v: unknown, max = 200) => { const s = String(v ?? '').replace(/\s+/g, ' ').trim(); return s ? s.slice(0, max) : null; };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const asUser = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const [{ data: ok }, body] = await Promise.all([asUser.rpc('can_capture_receipts'), req.json().catch(() => ({}))]);   // permission check and body read together
  if (ok !== true) return json({ error: 'Not allowed' }, 403);
  if (!env('ANTHROPIC_API_KEY')) return json({ error: 'The AI key is not set up yet (ANTHROPIC_API_KEY).' }, 503);
  const { image } = body as { image?: unknown };
  if (typeof image !== 'string' || image.length < 100) return json({ error: 'No photo received.' }, 400);
  if (image.length > 5_000_000) return json({ error: 'The photo is too large.' }, 400);
  const system = `You read photographed Philippine official receipts, sales invoices and cash invoices for a bookkeeper preparing BIR filings. Transcribe ONLY what is actually printed or written and legible. If a value is erased, faded, cut off, hidden or not on the document, return null for it. NEVER guess, complete or invent a TIN, name, address, number, date or amount. The photo may be sideways or upside down, taken at an angle, and parts may be handwritten (read neat handwriting too; if a handwritten value is not clearly legible, put the field in "low_confidence" or "unreadable"). Printed headers (business name, TIN, address, "NON-VAT Reg." / "VAT Reg.") belong to the SELLER; "Sold to", "Billed to" or "Delivered to" lines belong to the BUYER. Reply with JSON only:
{"rotate":0|90|180|270 (degrees CLOCKWISE the photo must be turned so the text reads upright and left-to-right; 0 if it is already upright),
"buyer_name":"the 'sold to' name as written or null","buyer_tin":"buyer TIN or null","buyer_address":"buyer address or null",
"doc_type":"Official Receipt|Sales Invoice|Cash Invoice|Billing Invoice|Other|null",
"receipt_no":"the OR / SI / invoice number as printed or null",
"date":"YYYY-MM-DD or null",
"supplier_name":"the registered business name of the seller (not the buyer) or null",
"supplier_tin":"the seller's TIN as printed, e.g. 123-456-789-00000, or null",
"supplier_address":"the seller's registered address as printed or null",
"vat_status":"VAT if the seller is VAT-registered (shows VAT Reg TIN, VATable sales, 12% VAT) | Non-VAT if it says NON-VAT Reg or is a percentage-tax seller | Zero-rated | Exempt | null",
"total_amount":number or null (the total amount due / paid, VAT inclusive),
"vatable_sales":number or null, "vat_amount":number or null, "exempt_amount":number or null, "zero_rated_amount":number or null,
"payment_method":"Cash|Bank Transfer|Check|GCash|Credit Card|Other|null",
"description":"one short line of what was bought, or null",
"unreadable":["names of the fields above that are on the document but erased / faded / cut off"],
"low_confidence":["names of fields you read but are unsure about"],
"notes":"one short sentence about the condition of the receipt (faded, torn, folded, glare) or empty"}`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: { 'x-api-key': env('ANTHROPIC_API_KEY'), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: env('AI_RECEIPT_MODEL') || 'claude-sonnet-5-5', max_tokens: 900, system, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } }, { type: 'text', text: 'Read this receipt.' }] }] }),
  });
  if (!res.ok) {
    const detail = ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? '';
    return json({ error: `The AI could not answer (${res.status}). ${detail}`.trim() }, 502);
  }
  const out = (await res.json()) as { content?: { type: string; text?: string }[] };
  const raw = (out.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
  try {
    const j = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as Record<string, unknown>;
    const date = text(j.date, 10); const vs = text(j.vat_status, 12); const names = (a: unknown) => (Array.isArray(a) ? a.slice(0, 20).map((x) => String(x).slice(0, 30)) : []);
    return json({
      fields: {
        doc_type: text(j.doc_type, 30), receipt_no: text(j.receipt_no, 40), date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
        supplier_name: text(j.supplier_name), supplier_tin: text(j.supplier_tin, 30), supplier_address: text(j.supplier_address, 240),
        vat_status: ['VAT', 'Non-VAT', 'Zero-rated', 'Exempt'].includes(vs ?? '') ? vs : null,
        total_amount: money(j.total_amount), vatable_sales: money(j.vatable_sales), vat_amount: money(j.vat_amount), exempt_amount: money(j.exempt_amount), zero_rated_amount: money(j.zero_rated_amount),
        payment_method: text(j.payment_method, 20), description: text(j.description, 160),
      },
      rotate: [90, 180, 270].includes(Number(j.rotate)) ? Number(j.rotate) : 0,
      buyer: { name: text(j.buyer_name), tin: text(j.buyer_tin, 30), address: text(j.buyer_address, 240) },
      unreadable: names(j.unreadable), low_confidence: names(j.low_confidence), notes: text(j.notes, 160) ?? '',
    });
  } catch { return json({ error: 'The AI answer could not be read. Try again.' }, 502); }
});
