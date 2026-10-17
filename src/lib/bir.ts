// BIR compliance helpers: the Summary List of Sales (SLS) and Summary List of Purchases (SLP) for one tax month, built from the
// approved invoices and expenses, with a list of things to fix before anything is encoded in RELIEF. Nothing here invents a TIN,
// name or address: a missing value stays empty and is flagged.
import type { DB, Expense, Invoice } from './types';
import { invoiceTotals } from './business';
import { round2 } from './util';

export type SalesClass = 'vatable' | 'zero' | 'exempt' | 'none';
export type Flag = { level: 'error' | 'warn' | 'info'; text: string };

export const tinDigits = (t?: string) => (t ?? '').replace(/\D/g, '');
/** Format check only (9 digits, or 9 + a 3 to 5 digit branch code). It cannot tell whether a TIN is real: verify it on the supplier's / buyer's own document. */
export const tinOk = (t?: string) => { const n = tinDigits(t).length; return n === 9 || (n >= 12 && n <= 14); };
export const fmtTin = (t?: string) => { const d = tinDigits(t); if (!d) return ''; return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9)].filter(Boolean).join('-'); };
/** MM/DD/YYYY, the way RELIEF asks for dates. */
export const reliefDate = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const live = <T extends { deleted_at?: string | null }>(a: T[] | undefined) => (a ?? []).filter((x) => !x.deleted_at);

export interface SlsRow {
  id: string; invoice: string; date: string; client_id: string; tin: string; name: string; address: string;
  buyer: 'business' | 'consumer';
  cls: SalesClass; auto_cls: SalesClass; skipped: boolean;
  gross_taxable: number; taxable: number; zero: number; exempt: number; output_tax: number; invoice_total: number;
  flags: Flag[];
}

/** Sales of a tax month ('YYYY-MM'): approved invoices (reversed ones are not sales), classified, with the buyer's details as held on the client record. */
export function buildSls(db: DB, month: string): SlsRow[] {
  const bir = db.settings.bir ?? {};
  const rows: SlsRow[] = [];
  for (const inv of live(db.invoices) as Invoice[]) {
    if (inv.status !== 'Approved' || inv.issue_date.slice(0, 7) !== month) continue;
    const c = db.clients.find((x) => x.id === inv.client_id);
    const t = invoiceTotals(inv);
    const auto: SalesClass = inv.vat_mode === 'none' ? 'none' : 'vatable';
    const cls: SalesClass = bir.sls_class?.[inv.id] ?? auto;
    const net = t.net;
    const flags: Flag[] = [];
    const tin = c?.tin?.trim() ?? '';
    const buyer = c?.type === 'Residential' ? 'consumer' : 'business';
    if (buyer === 'business') {
      if (!tin) flags.push({ level: 'error', text: "No TIN on the client record. Get the buyer's verified TIN from their own documents; never invent one." });
      else if (!tinOk(tin)) flags.push({ level: 'warn', text: "The TIN does not look like 9 digits (+ branch code). Check it against the buyer's documents." });
      if (!c?.billing_address?.trim() && !c?.address?.trim()) flags.push({ level: 'error', text: 'No registered address on the client record.' });
    } else if (!tin) {
      flags.push({ level: 'info', text: 'Walk-in / individual buyer without a TIN. Do not create a made-up customer record. How direct-to-consumer sales are treated must be confirmed against the current BIR instructions (RDO / accountant) before the SLS is final.' });
    }
    if (auto === 'none' && !bir.sls_class?.[inv.id]) flags.push({ level: 'warn', text: 'No VAT was charged on this invoice. It stays off the SLS unless you classify it zero-rated or exempt (only if it qualifies).' });
    if ((cls === 'zero' || cls === 'exempt') && t.vat > 0) flags.push({ level: 'warn', text: 'This invoice shows VAT but is classified zero-rated / exempt. Check which is right.' });
    if (cls === 'vatable' && auto === 'none') flags.push({ level: 'warn', text: 'Classified VATable although the invoice shows no VAT: the output tax will be 0.' });
    const vatable = cls === 'vatable';
    rows.push({
      id: inv.id, invoice: inv.number, date: inv.issue_date, client_id: inv.client_id, tin, name: c?.name ?? '—', address: (c?.billing_address || c?.address || '').trim(), buyer,
      cls, auto_cls: auto, skipped: !!bir.sls_skip?.includes(inv.id),
      taxable: vatable ? net : 0, output_tax: vatable ? t.vat : 0, gross_taxable: vatable ? round2(net + t.vat) : 0,
      zero: cls === 'zero' ? net : 0, exempt: cls === 'exempt' ? net : 0, invoice_total: t.total, flags,
    });
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.invoice.localeCompare(b.invoice));
}
/** Rows that go on the list: not set aside, and VAT-charged or classified zero-rated / exempt. */
export const slsIncluded = (r: SlsRow) => !r.skipped && r.cls !== 'none';
export const slsTotals = (rows: SlsRow[]) => {
  const inc = rows.filter(slsIncluded);
  const s = (f: (r: SlsRow) => number) => round2(inc.reduce((a, r) => a + f(r), 0));
  return { count: inc.length, gross_taxable: s((r) => r.gross_taxable), taxable: s((r) => r.taxable), zero: s((r) => r.zero), exempt: s((r) => r.exempt), output_tax: s((r) => r.output_tax) };
};
/** Per-buyer monthly totals (same client in the month), for when RELIEF is filled in one line per buyer. */
export function groupSlsByBuyer(rows: SlsRow[]): SlsRow[] {
  const m = new Map<string, SlsRow>();
  for (const r of rows.filter(slsIncluded)) {
    const g = m.get(r.client_id);
    if (!g) { m.set(r.client_id, { ...r, id: r.client_id, flags: [...r.flags] }); continue; }
    g.gross_taxable = round2(g.gross_taxable + r.gross_taxable); g.taxable = round2(g.taxable + r.taxable); g.zero = round2(g.zero + r.zero); g.exempt = round2(g.exempt + r.exempt); g.output_tax = round2(g.output_tax + r.output_tax); g.invoice_total = round2(g.invoice_total + r.invoice_total);
    g.invoice = `${g.invoice}, ${r.invoice}`; for (const f of r.flags) if (!g.flags.some((x) => x.text === f.text)) g.flags.push(f);
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export interface SlpRow {
  id: string; date: string; supplier: string; tin: string; address: string; invoice: string;
  vat_status: NonNullable<Expense['supplier_vat']>; kind: NonNullable<Expense['purchase_kind']>; skipped: boolean;
  gross: number; exempt: number; zero: number; taxable: number; services: number; capital: number; goods: number; input_vat: number; vat_recorded: number;
  flags: Flag[];
}

const isPurchase = (e: Expense, month: string) => e.approval === 'Approved' && !e.reversed && e.category !== 'Payroll' && e.source !== 'payroll' && e.date.slice(0, 7) === month;

interface SlpSource { id: string; date: string; supplier: string; tin: string; address: string; invoice: string; vat_status?: SlpRow['vat_status']; kind?: SlpRow['kind']; amount: number; vat: number; skipped: boolean; notes?: Flag[] }
function slpRow(e: SlpSource): SlpRow {
  const flags: Flag[] = [...(e.notes ?? [])];
  const assumed = !e.vat_status;
  const status = e.vat_status ?? (e.vat > 0 ? 'VAT' : 'Non-VAT');
  const kind = e.kind ?? 'Goods'; const tin = e.tin.trim(); const invoice = e.invoice.trim();
  if (!tin) flags.push({ level: 'error', text: "No supplier TIN. Take it from the supplier's invoice / official receipt; never invent one." });
  else if (!tinOk(tin)) flags.push({ level: 'warn', text: 'The TIN does not look like 9 digits (+ branch code).' });
  if (!e.address.trim()) flags.push({ level: 'error', text: 'No supplier address.' });
  if (!invoice) flags.push({ level: 'warn', text: 'No supplier invoice / receipt number. Input VAT cannot be claimed without a proper invoice.' });
  if (assumed) flags.push({ level: 'warn', text: `Supplier VAT status not set: treated as ${status}.` });
  if (!e.kind && status === 'VAT') flags.push({ level: 'info', text: 'Purchase type not set: counted as goods other than capital goods.' });
  let exempt = 0, zero = 0, taxable = 0, creditable = 0;
  if (status === 'VAT') {
    taxable = round2(e.amount - e.vat);
    if (e.vat <= 0) flags.push({ level: 'warn', text: 'VAT supplier but no input VAT recorded. Check the invoice.' });
    if (tin && tinOk(tin) && invoice) creditable = e.vat; else if (e.vat > 0) flags.push({ level: 'warn', text: 'Input VAT is not counted as creditable until the supplier TIN and invoice number are complete.' });
  } else {
    if (e.vat > 0) flags.push({ level: 'error', text: `Input VAT of ${e.vat.toFixed(2)} is recorded for a ${status} supplier. It is not creditable: correct the record.` });
    if (status === 'Zero-rated') zero = e.amount; else exempt = e.amount;
  }
  return {
    id: e.id, date: e.date, supplier: e.supplier.trim(), tin, address: e.address.trim(), invoice, vat_status: status, kind, skipped: e.skipped,
    gross: e.amount, exempt, zero, taxable, services: status === 'VAT' && kind === 'Services' ? taxable : 0, capital: status === 'VAT' && kind === 'Capital goods' ? taxable : 0, goods: status === 'VAT' && kind === 'Goods' ? taxable : 0,
    input_vat: creditable, vat_recorded: e.vat, flags,
  };
}

/** A scanned receipt as the SLP needs it. Receipts decided "BIR only" are not expenses, so they come in here instead of through the expense list. */
export interface BirReceipt { id: string; receipt_date: string | null; supplier_name: string | null; supplier_tin: string | null; supplier_address: string | null; receipt_no: string | null; supplier_vat: SlpRow['vat_status'] | null; total_amount: number | null; vat_amount: number | null; bir_mode: 'yes' | 'no' | 'both' | null; status: string }

/** Purchases of a tax month: approved, un-reversed expenses (payroll is not a purchase), one record per supplier invoice, never merged, plus scanned receipts marked "BIR only". */
export function buildSlp(db: DB, month: string, receipts: BirReceipt[] = []): SlpRow[] {
  const bir = db.settings.bir ?? {};
  const rows: SlpRow[] = [];
  for (const e of live(db.expenses)) {
    if (!isPurchase(e, month)) continue;
    rows.push(slpRow({ id: e.id, date: e.date, supplier: e.supplier_name || e.payee || '', tin: e.supplier_tin ?? '', address: e.supplier_address ?? '', invoice: e.supplier_invoice_no ?? '', vat_status: e.supplier_vat, kind: e.purchase_kind, amount: e.amount, vat: e.vat,
      skipped: !!bir.slp_skip?.includes(e.id) || e.bir_use === false, notes: e.bir_use === false ? [{ level: 'info', text: 'Marked "No" (expense only) when the receipt was posted, so it is left out of this list.' }] : [] }));
  }
  for (const r of receipts) {
    if (r.bir_mode !== 'yes' || r.status !== 'Posted' || !r.receipt_date || r.receipt_date.slice(0, 7) !== month || !r.total_amount) continue;
    rows.push(slpRow({ id: `rc:${r.id}`, date: r.receipt_date, supplier: r.supplier_name ?? '', tin: r.supplier_tin ?? '', address: r.supplier_address ?? '', invoice: r.receipt_no ?? '', vat_status: r.supplier_vat ?? undefined, amount: r.total_amount, vat: r.supplier_vat === 'VAT' ? (r.vat_amount ?? 0) : 0,
      skipped: !!bir.slp_skip?.includes(`rc:${r.id}`), notes: [{ level: 'info', text: 'From a scanned receipt marked "BIR only": it is not counted as an expense.' }] }));
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.supplier.localeCompare(b.supplier));
}
export const slpTotals = (rows: SlpRow[]) => {
  const inc = rows.filter((r) => !r.skipped);
  const s = (f: (r: SlpRow) => number) => round2(inc.reduce((a, r) => a + f(r), 0));
  return { count: inc.length, gross: s((r) => r.gross), exempt: s((r) => r.exempt), zero: s((r) => r.zero), taxable: s((r) => r.taxable), services: s((r) => r.services), capital: s((r) => r.capital), goods: s((r) => r.goods), input_vat: s((r) => r.input_vat), vat_recorded: s((r) => r.vat_recorded) };
};

/** Output VAT against input VAT for the month, and how far each side is from the records it was built from. */
export function reconcile(db: DB, month: string, receipts: BirReceipt[] = []) {
  const st = slsTotals(buildSls(db, month)); const pt = slpTotals(buildSlp(db, month, receipts));
  const invoiceVat = round2((live(db.invoices) as Invoice[]).filter((i) => i.status === 'Approved' && i.issue_date.slice(0, 7) === month).reduce((a, i) => a + invoiceTotals(i).vat, 0));
  const expenseVat = round2(live(db.expenses).filter((e) => isPurchase(e, month)).reduce((a, e) => a + e.vat, 0) + buildSlp({ ...db, expenses: [] }, month, receipts).reduce((a, r) => a + r.vat_recorded, 0));
  return {
    output_tax: st.output_tax, input_vat: pt.input_vat, payable: round2(st.output_tax - pt.input_vat),
    invoice_vat: invoiceVat, output_gap: round2(invoiceVat - st.output_tax),
    expense_vat: expenseVat, not_credited: round2(expenseVat - pt.input_vat),
  };
}

export const slsIssues = (rows: SlsRow[]) => rows.filter((r) => slsIncluded(r) && r.flags.some((f) => f.level !== 'info')).length;
export const slpIssues = (rows: SlpRow[]) => rows.filter((r) => !r.skipped && r.flags.some((f) => f.level === 'error')).length;
