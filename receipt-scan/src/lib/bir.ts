import type { Company, Issue, Plan, PlanId, Receipt } from './types';

export const VAT_RATE = 0.12;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[₱,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Placeholder pricing — set your real prices before launch. */
export const PLANS: Plan[] = [
  { id: 'free', name: 'Free', pricePhp: 0, scansPerMonth: 20, blurb: 'Try it with one small business' },
  { id: 'starter', name: 'Starter', pricePhp: 499, scansPerMonth: 150, blurb: 'Sari-sari, café, freelancer-with-staff' },
  { id: 'business', name: 'Business', pricePhp: 1499, scansPerMonth: 600, blurb: 'Multiple branches and a bookkeeper' },
];
export const planOf = (id: PlanId) => PLANS.find((p) => p.id === id) ?? PLANS[0];

export const CATEGORIES = [
  'Inventory / Cost of goods', 'Supplies', 'Rent', 'Utilities', 'Communication', 'Fuel & transport',
  'Repairs & maintenance', 'Professional fees', 'Advertising', 'Meals & representation', 'Salaries & benefits',
  'Taxes & licenses', 'Insurance', 'Equipment', 'Bank charges', 'Miscellaneous',
];
export const DOC_TYPES: { id: Receipt['docType']; label: string }[] = [
  { id: 'sales_invoice', label: 'Sales Invoice' },
  { id: 'cash_invoice', label: 'Cash / Charge Invoice' },
  { id: 'official_receipt', label: 'Official Receipt' },
  { id: 'other', label: 'Other (not BIR-valid)' },
];
export const PAYMENT_METHODS = ['Cash', 'GCash / Maya', 'Credit card', 'Debit card', 'Bank transfer', 'Check', 'Other'];

/** Digits only, grouped 3-3-3 with an optional 3–5 digit branch code: 123-456-789-00000 */
export function formatTin(input: string): string {
  const d = String(input ?? '').replace(/\D/g, '').slice(0, 14);
  const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9)].filter(Boolean);
  return parts.join('-');
}
export function isValidTin(input: string): boolean {
  const n = String(input ?? '').replace(/\D/g, '').length;
  return n === 9 || (n >= 12 && n <= 14);
}

/** Split a VAT-inclusive gross amount into vatable sales and 12% VAT. */
export function splitVat(gross: number): { vatable: number; vat: number } {
  const vatable = round2(gross / (1 + VAT_RATE));
  return { vatable, vat: round2(gross - vatable) };
}

const todayIso = () => new Date().toISOString().slice(0, 10);

export function blankReceipt(companyId: string): Receipt {
  return {
    id: crypto.randomUUID(), companyId, docType: 'sales_invoice', supplierName: '', supplierTin: '', supplierAddress: '',
    supplierVatRegistered: true, invoiceNo: '', date: todayIso(), vatable: 0, vatAmount: 0, vatExempt: 0, zeroRated: 0,
    total: 0, withholdingTax: 0, atc: '', purchaseType: 'goods', paymentMethod: 'Cash', category: 'Supplies',
    deductible: true, notes: '', status: 'needs_review', imagePath: null, imageHash: null, confidence: {},
    createdAt: new Date().toISOString(),
  };
}

/**
 * Can this receipt support an input-VAT claim?
 * Needs a VAT-registered buyer, a VAT-registered supplier, a valid invoice type, a supplier TIN and VAT shown.
 */
export function inputVatClaimable(r: Receipt, company: Pick<Company, 'vatRegistered'>): boolean {
  return (
    company.vatRegistered && r.supplierVatRegistered && r.docType !== 'other' && r.deductible &&
    isValidTin(r.supplierTin) && r.vatAmount > 0 && !!r.invoiceNo.trim()
  );
}

/** Checks to run before a receipt is marked verified. Not legal advice — a CPA should confirm the rules. */
export function checkReceipt(r: Receipt, all: Receipt[], company: Pick<Company, 'vatRegistered'>): Issue[] {
  const out: Issue[] = [];
  const add = (field: string, severity: Issue['severity'], message: string) => out.push({ field, severity, message });

  if (!r.supplierName.trim()) add('supplierName', 'error', 'Supplier name is missing.');
  if (!r.invoiceNo.trim()) add('invoiceNo', 'error', 'Invoice / OR number is missing.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) add('date', 'error', 'Date is missing or invalid.');
  else if (r.date > todayIso()) add('date', 'error', 'Date is in the future.');
  if (!(r.total > 0)) add('total', 'error', 'Total amount must be more than zero.');

  if (r.supplierTin.trim() && !isValidTin(r.supplierTin)) add('supplierTin', 'error', 'TIN should be 9 digits (or 12–14 with the branch code).');
  if (!r.supplierTin.trim()) {
    add('supplierTin', company.vatRegistered ? 'error' : 'warn', 'Supplier TIN is missing — the expense may be disallowed and input VAT cannot be claimed.');
  }
  if (r.docType === 'other') add('docType', 'warn', 'Not a BIR invoice/OR — likely not deductible and no input VAT.');

  if (!r.supplierVatRegistered && r.vatAmount > 0) add('vatAmount', 'error', 'A NON-VAT supplier cannot charge VAT — recheck the receipt.');
  const parts = round2(r.vatable + r.vatAmount + r.vatExempt + r.zeroRated);
  const hasBreakdown = parts > 0;
  if (hasBreakdown && Math.abs(parts - r.total) > 0.05) {
    add('total', 'error', `Breakdown adds up to ${parts.toFixed(2)} but total is ${r.total.toFixed(2)}.`);
  }
  if (r.vatable > 0 && Math.abs(round2(r.vatable * VAT_RATE) - r.vatAmount) > 0.05) {
    add('vatAmount', 'warn', `VAT should be 12% of vatable sales (${round2(r.vatable * VAT_RATE).toFixed(2)}).`);
  }
  if (!hasBreakdown && r.supplierVatRegistered && r.total > 0) {
    add('vatable', 'warn', 'No VAT breakdown. Use “Compute VAT from total” if the total is VAT-inclusive.');
  }
  if (r.withholdingTax > r.total) add('withholdingTax', 'error', 'Withholding tax is more than the total.');

  const dup = all.find((o) =>
    o.id !== r.id && r.invoiceNo.trim() &&
    o.invoiceNo.trim().toLowerCase() === r.invoiceNo.trim().toLowerCase() &&
    o.supplierTin.replace(/\D/g, '') === r.supplierTin.replace(/\D/g, '') &&
    o.supplierName.trim().toLowerCase() === r.supplierName.trim().toLowerCase());
  if (dup) add('invoiceNo', 'error', `Possible duplicate of a receipt already saved (${dup.date}, ${dup.total.toFixed(2)}).`);
  if (r.imageHash && all.some((o) => o.id !== r.id && o.imageHash === r.imageHash)) {
    add('imageHash', 'warn', 'This exact photo was already uploaded.');
  }
  return out;
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.severity === 'error');

// ---------- periods & summaries ----------
export const quarterOf = (iso: string) => `${iso.slice(0, 4)}-Q${Math.ceil(Number(iso.slice(5, 7)) / 3)}`;
export const monthOf = (iso: string) => iso.slice(0, 7);

export interface Period { label: string; from: string; to: string }
export function monthPeriod(ym: string): Period {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { label: ym, from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
}
export function quarterPeriod(year: number, q: number): Period {
  const m1 = (q - 1) * 3 + 1;
  return { label: `${year}-Q${q}`, from: `${year}-${String(m1).padStart(2, '0')}-01`, to: monthPeriod(`${year}-${String(m1 + 2).padStart(2, '0')}`).to };
}
export const yearPeriod = (year: number): Period => ({ label: String(year), from: `${year}-01-01`, to: `${year}-12-31` });
export const inPeriod = (r: Receipt, p: Period) => r.date >= p.from && r.date <= p.to;

export interface Totals { count: number; gross: number; vatable: number; vat: number; exempt: number; zeroRated: number; withholding: number }
export function totalsOf(list: Receipt[]): Totals {
  const t: Totals = { count: list.length, gross: 0, vatable: 0, vat: 0, exempt: 0, zeroRated: 0, withholding: 0 };
  for (const r of list) {
    t.gross += r.total; t.vatable += r.vatable; t.vat += r.vatAmount; t.exempt += r.vatExempt; t.zeroRated += r.zeroRated; t.withholding += r.withholdingTax;
  }
  (Object.keys(t) as (keyof Totals)[]).forEach((k) => { t[k] = round2(t[k]); });
  return t;
}

export function groupSum(list: Receipt[], key: (r: Receipt) => string, value: (r: Receipt) => number = (r) => r.total) {
  const m = new Map<string, number>();
  for (const r of list) m.set(key(r), round2((m.get(key(r)) ?? 0) + value(r)));
  return [...m.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
}

export const peso = (n: number) => '₱' + round2(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
