// Scanned receipts: photo → AI reads the BIR details → a person checks them → the scan is kept (private storage in production, inline in the demo).
import { CLOUD, supabase } from './cloud';
import { callFn } from './fnclient';
import { enhanceCanvas } from './photos';
import { tinOk } from './bir';
import { round2 } from './util';

export type ReceiptVat = 'VAT' | 'Non-VAT' | 'Zero-rated' | 'Exempt';
export interface Receipt {
  id: string; created_at: string; created_by?: string | null;
  receipt_date: string | null; doc_type: string | null; receipt_no: string | null;
  supplier_name: string | null; supplier_tin: string | null; supplier_address: string | null; supplier_vat: ReceiptVat | null;
  total_amount: number | null; vatable_sales: number | null; vat_amount: number | null; exempt_amount: number | null; zero_rated_amount: number | null;
  payment_method: string | null; category: string | null; job_id: string | null; description: string | null; notes: string | null;
  image_path: string | null; image_data?: string | null; ocr: { unreadable: string[]; low_confidence: string[]; notes: string; buyer?: { name: string | null; tin: string | null; address: string | null } } | null;
  status: 'Captured' | 'Posted'; expense_id: string | null;
  bir_mode: 'yes' | 'no' | 'both' | null; confirmed_by: string | null; confirmed_at: string | null;
}
export type ReceiptDraft = Omit<Receipt, 'id' | 'created_at' | 'created_by' | 'status' | 'expense_id' | 'image_path' | 'image_data' | 'bir_mode' | 'confirmed_by' | 'confirmed_at'>;
export interface Reading { fields: Partial<Record<string, string | number | null>>; unreadable: string[]; low_confidence: string[]; notes: string; rotate?: number; buyer?: { name: string | null; tin: string | null; address: string | null } }

export const FIELD_LABEL: Record<string, string> = {
  doc_type: 'Document type', receipt_no: 'Receipt / invoice no.', date: 'Date', supplier_name: 'Supplier name', supplier_tin: 'Supplier TIN', supplier_address: 'Supplier address', vat_status: 'VAT status',
  total_amount: 'Total amount', vatable_sales: 'VATable sales', vat_amount: 'VAT', exempt_amount: 'VAT-exempt sales', zero_rated_amount: 'Zero-rated sales', payment_method: 'Payment method', description: 'Description',
};

export const blankDraft = (): ReceiptDraft => ({ receipt_date: null, doc_type: null, receipt_no: null, supplier_name: null, supplier_tin: null, supplier_address: null, supplier_vat: null, total_amount: null, vatable_sales: null, vat_amount: null, exempt_amount: null, zero_rated_amount: null, payment_method: null, category: null, job_id: null, description: null, notes: null, ocr: null });

/** Turns what the AI read into a draft. Values it could not read stay empty. */
export function draftFromReading(r: Reading): ReceiptDraft {
  const f = r.fields; const s = (k: string) => (f[k] === null || f[k] === undefined || f[k] === '' ? null : String(f[k])); const n = (k: string) => (typeof f[k] === 'number' ? (f[k] as number) : null);
  return { ...blankDraft(), receipt_date: s('date'), doc_type: s('doc_type'), receipt_no: s('receipt_no'), supplier_name: s('supplier_name'), supplier_tin: s('supplier_tin'), supplier_address: s('supplier_address'), supplier_vat: (s('vat_status') as ReceiptVat | null),
    total_amount: n('total_amount'), vatable_sales: n('vatable_sales'), vat_amount: n('vat_amount'), exempt_amount: n('exempt_amount'), zero_rated_amount: n('zero_rated_amount'), payment_method: s('payment_method'), description: s('description'), ocr: { unreadable: r.unreadable, low_confidence: r.low_confidence, notes: r.notes, buyer: r.buyer } };
}

export interface Check { level: 'error' | 'warn' | 'info'; text: string; field?: string }
/** What still needs a person's eyes before the receipt is good for BIR: missing details, amounts that do not add up, a possible double entry. */
export function checkReceipt(d: ReceiptDraft, others: Pick<Receipt, 'id' | 'supplier_tin' | 'receipt_no' | 'total_amount'>[] = [], selfId?: string, today = new Date().toISOString().slice(0, 10)): Check[] {
  const out: Check[] = [];
  const need = (v: unknown, field: string, text: string) => { if (v === null || v === undefined || String(v).trim() === '') out.push({ level: 'error', text, field }); };
  need(d.supplier_name, 'supplier_name', 'Supplier name is missing.'); need(d.supplier_tin, 'supplier_tin', 'Supplier TIN is missing. Type it only if you can see it; do not guess.'); need(d.supplier_address, 'supplier_address', 'Supplier address is missing.');
  need(d.receipt_no, 'receipt_no', 'Receipt / invoice number is missing.'); need(d.receipt_date, 'receipt_date', 'Date is missing.'); need(d.total_amount, 'total_amount', 'Total amount is missing.'); need(d.supplier_vat, 'supplier_vat', 'Choose whether the supplier is VAT or Non-VAT.');
  if (d.supplier_tin && !tinOk(d.supplier_tin)) out.push({ level: 'warn', text: 'The TIN does not look like 9 digits (+ branch code).', field: 'supplier_tin' });
  if (d.receipt_date && d.receipt_date > today) out.push({ level: 'warn', text: 'The date is in the future.', field: 'receipt_date' });
  const parts = round2((d.vatable_sales ?? 0) + (d.vat_amount ?? 0) + (d.exempt_amount ?? 0) + (d.zero_rated_amount ?? 0));
  if (d.total_amount && parts > 0 && Math.abs(parts - d.total_amount) > 1) out.push({ level: 'warn', text: `VATable + VAT + exempt + zero-rated is ${parts.toFixed(2)}, but the total is ${d.total_amount.toFixed(2)}. Check the printed figures.`, field: 'total_amount' });
  if (d.supplier_vat === 'VAT') {
    if (d.vatable_sales && d.vat_amount !== null && Math.abs(d.vatable_sales * 0.12 - d.vat_amount) > 1) out.push({ level: 'warn', text: 'VAT is not 12% of the VATable sales. Check both figures.', field: 'vat_amount' });
    if (!d.vat_amount) out.push({ level: 'warn', text: 'VAT supplier but no VAT amount. Input VAT cannot be claimed without it.', field: 'vat_amount' });
  } else if (d.supplier_vat && (d.vat_amount ?? 0) > 0) out.push({ level: 'error', text: `A ${d.supplier_vat} supplier should not show VAT. Check the receipt.`, field: 'vat_amount' });
  if (d.ocr?.unreadable.length) out.push({ level: 'warn', text: `Hard to read on the scan: ${d.ocr.unreadable.map((x) => FIELD_LABEL[x] ?? x).join(', ')}. Check against the paper, or retake the photo in better light.` });
  if (d.ocr?.low_confidence.length) out.push({ level: 'info', text: `The AI was unsure about: ${d.ocr.low_confidence.map((x) => FIELD_LABEL[x] ?? x).join(', ')}.` });
  const dup = others.find((o) => o.id !== selfId && d.receipt_no && o.receipt_no === d.receipt_no && (o.supplier_tin ?? '') === (d.supplier_tin ?? '') && (o.total_amount ?? 0) === (d.total_amount ?? 0));
  if (dup) out.push({ level: 'warn', text: 'A receipt with the same supplier, number and amount is already scanned. Possible double entry.' });
  return out;
}
export const readyForBir = (c: Check[]) => !c.some((x) => x.level === 'error');

const blobToDataUrl = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(b); });

/** Resize (long side 2000 px) and, when asked, gently clean up a faded print; the result is both what the AI reads and the scan that is kept. */
export async function prepareScan(file: File, enhance: boolean): Promise<{ blob: Blob; dataUrl: string; base64: string }> {
  const bmp = await createImageBitmap(file); const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  if (enhance) { try { enhanceCanvas(c); } catch { /* keep the original look */ } }
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not read the picture'))), 'image/jpeg', 0.9));
  const dataUrl = await blobToDataUrl(blob);
  return { blob, dataUrl, base64: dataUrl.split(',')[1] ?? '' };
}
/** Turns the scan clockwise by 90 / 180 / 270 degrees (a photo taken sideways) and returns the new scan. */
export async function rotateScan(dataUrl: string, deg: number): Promise<{ blob: Blob; dataUrl: string }> {
  const img = new Image(); await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Could not read the picture')); img.src = dataUrl; });
  const quarter = deg % 180 !== 0; const c = document.createElement('canvas'); c.width = quarter ? img.height : img.width; c.height = quarter ? img.width : img.height;
  const x = c.getContext('2d')!; x.translate(c.width / 2, c.height / 2); x.rotate((deg * Math.PI) / 180); x.drawImage(img, -img.width / 2, -img.height / 2);
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not rotate the picture'))), 'image/jpeg', 0.9));
  return { blob, dataUrl: await blobToDataUrl(blob) };
}
/** Is this document TopMop's own invoice (a sale), not a purchase? Compares the seller with the company on file. */
export function isOwnDocument(d: Pick<ReceiptDraft, 'supplier_name' | 'supplier_tin'>, company: { name: string; tin: string }): boolean {
  const norm = (t: string | null | undefined) => (t ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const digits = (t: string | null | undefined) => (t ?? '').replace(/\D/g, '').slice(0, 9);
  const n = norm(d.supplier_name); const mine = norm(company.name);
  return (!!digits(d.supplier_tin) && digits(d.supplier_tin) === digits(company.tin)) || (!!n && (n.includes('topmop') || (!!mine && (n === mine || n.includes(mine.slice(0, 14))))));
}

/** A smaller copy for the AI (long side 1600 px) so the call stays quick. */
export async function forAi(dataUrl: string): Promise<string> {
  const img = new Image(); await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Could not read the picture')); img.src = dataUrl; });
  const k = Math.min(1, 1600 / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85).split(',')[1] ?? '';
}
export const readReceipt = (base64: string) => callFn<Reading>('ai-receipt', { image: base64 }).catch((e: unknown) => {
  const m = e instanceof Error ? e.message : '';
  // the browser could not reach the function at all: it has not been deployed to Supabase yet (or the connection dropped)
  throw new Error(/failed to send a request|failed to fetch|networkerror/i.test(m) ? 'The receipt reader is not set up on the server yet (the ai-receipt function has to be deployed), or the connection dropped.' : m || 'The AI could not read this receipt.');
});

/* ---------- storage: Supabase in production, localStorage in the demo ---------- */
const DEMO = 'topmop-receipts-demo';
const demoLoad = (): Receipt[] => { try { return JSON.parse(localStorage.getItem(DEMO) ?? '[]') as Receipt[]; } catch { return []; } };
const demoSave = (r: Receipt[]) => { try { localStorage.setItem(DEMO, JSON.stringify(r)); } catch { throw new Error('The browser has no room left to keep another scan (demo mode).'); } };

export async function listReceipts(): Promise<Receipt[]> {
  if (!CLOUD) return demoLoad().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const { data, error } = await supabase().from('receipts').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(1000);
  if (error) throw new Error(error.message); return (data ?? []) as Receipt[];
}
const cols = (d: ReceiptDraft) => ({ receipt_date: d.receipt_date, doc_type: d.doc_type, receipt_no: d.receipt_no, supplier_name: d.supplier_name, supplier_tin: d.supplier_tin, supplier_address: d.supplier_address, supplier_vat: d.supplier_vat, total_amount: d.total_amount, vatable_sales: d.vatable_sales, vat_amount: d.vat_amount, exempt_amount: d.exempt_amount, zero_rated_amount: d.zero_rated_amount, payment_method: d.payment_method, category: d.category, job_id: d.job_id, description: d.description, notes: d.notes, ocr: d.ocr });

export async function saveNewReceipt(d: ReceiptDraft, scan: { blob: Blob; dataUrl: string }, confirmedBy: string): Promise<Receipt> {
  const conf = { confirmed_by: confirmedBy, confirmed_at: new Date().toISOString() };
  const id = crypto.randomUUID();
  if (!CLOUD) {
    const small = await shrink(scan.dataUrl, 900);
    const rec: Receipt = { id, created_at: new Date().toISOString(), ...d, image_path: null, image_data: small, status: 'Captured', expense_id: null, bir_mode: null, ...conf };
    demoSave([rec, ...demoLoad()]); return rec;
  }
  const path = `${(d.receipt_date ?? new Date().toISOString().slice(0, 10)).slice(0, 7)}/${id}.jpg`;
  const up = await supabase().storage.from('receipts').upload(path, scan.blob, { contentType: 'image/jpeg' }); if (up.error) throw new Error(up.error.message);
  const { data, error } = await supabase().from('receipts').insert({ id, ...cols(d), ...conf, image_path: path, status: 'Captured' }).select('*').single();
  if (error) throw new Error(error.message); return data as Receipt;
}
export async function updateReceipt(id: string, patch: Partial<Receipt>): Promise<void> {
  if (!CLOUD) { demoSave(demoLoad().map((r) => (r.id === id ? { ...r, ...patch } : r))); return; }
  const { image_data, id: _i, created_at: _c, created_by: _b, image_path: _p, ...rest } = patch; void image_data; void _i; void _c; void _b; void _p;
  const { error } = await supabase().from('receipts').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', id); if (error) throw new Error(error.message);
}
export async function deleteReceipt(id: string): Promise<void> {
  if (!CLOUD) { demoSave(demoLoad().filter((r) => r.id !== id)); return; }
  const { error } = await supabase().from('receipts').update({ deleted_at: new Date().toISOString() }).eq('id', id); if (error) throw new Error(error.message);
}
export async function scanUrl(r: Pick<Receipt, 'image_path' | 'image_data'>): Promise<string> {
  if (r.image_data) return r.image_data; if (!r.image_path || !CLOUD) return '';
  const { data } = await supabase().storage.from('receipts').createSignedUrl(r.image_path, 3600); return data?.signedUrl ?? '';
}
async function shrink(dataUrl: string, max: number): Promise<string> {
  const img = new Image(); await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Could not read the picture')); img.src = dataUrl; });
  const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}
