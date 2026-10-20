import { blankReceipt, round2, splitVat } from './bir';
import type { Receipt } from './types';

export const SAMPLE_TAG = '[sample]';

const SUPPLIERS: { name: string; tin: string; addr: string; category: string; type: Receipt['purchaseType']; vat: boolean; lo: number; hi: number }[] = [
  { name: 'Metro Hardware & Supply (SAMPLE)', tin: '000-111-222-00000', addr: 'Quezon City', category: 'Supplies', type: 'goods', vat: true, lo: 600, hi: 8000 },
  { name: 'Island Power Co. (SAMPLE)', tin: '000-222-333-00000', addr: 'Makati City', category: 'Utilities', type: 'services', vat: true, lo: 4000, hi: 12000 },
  { name: 'PhoneNet Telecom (SAMPLE)', tin: '000-333-444-00000', addr: 'Taguig City', category: 'Communication', type: 'services', vat: true, lo: 1500, hi: 3000 },
  { name: 'Petro Fuel Station (SAMPLE)', tin: '000-444-555-00000', addr: 'Pasig City', category: 'Fuel & transport', type: 'goods', vat: true, lo: 800, hi: 3500 },
  { name: 'Ate Neng Sari-sari Wholesale (SAMPLE)', tin: '000-555-666-00000', addr: 'Cavite', category: 'Inventory / Cost of goods', type: 'goods', vat: false, lo: 1200, hi: 9000 },
  { name: 'Lopez & Co. CPA (SAMPLE)', tin: '000-666-777-00000', addr: 'Ortigas Center', category: 'Professional fees', type: 'services', vat: true, lo: 5000, hi: 5000 },
  { name: 'PrintMasters (SAMPLE)', tin: '000-777-888-00000', addr: 'Manila', category: 'Advertising', type: 'services', vat: true, lo: 900, hi: 6000 },
];

/** Deterministic sample receipts spread over the last ~5 months so every chart and report has something to show. */
export function sampleReceipts(companyId: string): Receipt[] {
  const out: Receipt[] = [];
  const today = new Date();
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let i = 0; i < 36; i++) {
    const s = SUPPLIERS[i % SUPPLIERS.length];
    const d = new Date(today); d.setDate(d.getDate() - Math.floor(rnd() * 150));
    const total = round2(s.lo + rnd() * (s.hi - s.lo));
    const r = blankReceipt(companyId);
    Object.assign(r, {
      supplierName: s.name, supplierTin: s.tin, supplierAddress: s.addr, supplierVatRegistered: s.vat, category: s.category, purchaseType: s.type,
      docType: s.vat ? 'sales_invoice' : 'official_receipt', invoiceNo: `${String(1000 + i * 13)}`, date: d.toISOString().slice(0, 10), total,
      status: i % 6 === 0 ? 'needs_review' : 'verified', notes: SAMPLE_TAG,
    });
    if (s.vat) { const v = splitVat(total); r.vatable = v.vatable; r.vatAmount = v.vat; } else { r.vatExempt = 0; }
    if (s.category === 'Professional fees') { r.withholdingTax = round2(r.vatable * 0.1); r.atc = 'WC158'; }
    out.push(r);
  }
  return out;
}
