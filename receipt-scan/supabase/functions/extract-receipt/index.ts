// Supabase Edge Function (Deno). Reads one Philippine receipt photo with Claude and returns structured fields.
// Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...   (optional: ANTHROPIC_MODEL)
// Deploy:  supabase functions deploy extract-receipt     (JWT verification stays ON)
import { createClient } from 'jsr:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const CATEGORIES = [
  'Inventory / Cost of goods', 'Supplies', 'Rent', 'Utilities', 'Communication', 'Fuel & transport',
  'Repairs & maintenance', 'Professional fees', 'Advertising', 'Meals & representation', 'Salaries & benefits',
  'Taxes & licenses', 'Insurance', 'Equipment', 'Bank charges', 'Miscellaneous',
];

const PROMPT = `You read photos of Philippine sales invoices, official receipts and cash/charge invoices for a bookkeeping tool.
Call the record_receipt tool exactly once. Rules:
- Copy values exactly as printed. NEVER guess or invent a value; if a field is not legible or not present, omit it and give it confidence 0.
- Dates as YYYY-MM-DD. Amounts as plain numbers in PHP (no symbols or commas).
- supplierTin: the seller's TIN as printed (digits and dashes). supplierVatRegistered is true when it says "VAT Reg" and false when it says "NON-VAT".
- vatable = VATable sales, vatAmount = 12% VAT, vatExempt, zeroRated, total = total amount due. Do not compute missing values.
- invoiceNo: the invoice / OR number (not the BIR permit or ATP number).
- confidence is 0..1 per field you returned. Use below 0.6 whenever the print is blurry, cut off or ambiguous.
- If the image is not a receipt or invoice, return an empty fields object.`;

const TOOL = {
  name: 'record_receipt',
  description: 'Record the fields read from the receipt photo.',
  input_schema: {
    type: 'object',
    properties: {
      fields: {
        type: 'object',
        properties: {
          docType: { type: 'string', enum: ['sales_invoice', 'official_receipt', 'cash_invoice', 'other'] },
          supplierName: { type: 'string' },
          supplierTin: { type: 'string' },
          supplierAddress: { type: 'string' },
          supplierVatRegistered: { type: 'boolean' },
          invoiceNo: { type: 'string' },
          date: { type: 'string' },
          vatable: { type: 'number' },
          vatAmount: { type: 'number' },
          vatExempt: { type: 'number' },
          zeroRated: { type: 'number' },
          total: { type: 'number' },
          withholdingTax: { type: 'number' },
          paymentMethod: { type: 'string' },
          category: { type: 'string', enum: CATEGORIES },
        },
      },
      confidence: { type: 'object', additionalProperties: { type: 'number' } },
    },
    required: ['fields', 'confidence'],
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { companyId, image, mediaType } = await req.json();
    if (!companyId || !image) return json({ error: 'companyId and image are required' }, 400);
    if (image.length > 7_000_000) return json({ error: 'Photo is too large' }, 413);

    // run as the caller so RLS / can_write() apply
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: ok, error: quotaErr } = await sb.rpc('consume_scan', { p_company: companyId });
    if (quotaErr) return json({ error: quotaErr.message }, 403);
    if (!ok) return json({ error: 'Monthly scan limit reached — contact support to raise it' }, 402);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5',
        max_tokens: 1500,
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'record_receipt' },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType ?? 'image/jpeg', data: image } },
            { type: 'text', text: PROMPT },
          ],
        }],
      }),
    });
    if (!res.ok) {
      console.error('anthropic', res.status, await res.text());
      return json({ error: 'The receipt reader is unavailable right now — type the fields in.' }, 502);
    }
    const out = await res.json();
    const use = out.content?.find((c: { type: string }) => c.type === 'tool_use');
    return json({ fields: use?.input?.fields ?? {}, confidence: use?.input?.confidence ?? {}, read: true });
  } catch (e) {
    console.error(e);
    return json({ error: 'Could not read this photo' }, 500);
  }
});
