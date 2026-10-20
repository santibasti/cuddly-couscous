import { describe, expect, it } from 'vitest';
import { blankReceipt, quarterPeriod } from './bir';
import { csvOf, reportPack, summaryListOfPurchases } from './exports';
import type { Company, Receipt } from './types';

const co: Company = { id: 'c1', name: 'Test Co', tin: '123-456-789-00000', vatRegistered: true, address: '', plan: 'free' };
const r = (o: Partial<Receipt>): Receipt => ({
  ...blankReceipt('c1'), supplierName: 'Shop', supplierTin: '111-222-333-00000', invoiceNo: 'A1', date: '2026-02-10', vatable: 1000, vatAmount: 120, total: 1120, status: 'verified', ...o,
});

describe('exports', () => {
  it('SLP lists only claimable receipts and totals input VAT', () => {
    const t = summaryListOfPurchases([r({}), r({ id: 'x', invoiceNo: 'A2', supplierTin: '' }), r({ id: 'y', invoiceNo: 'A3', docType: 'other' })], co);
    expect(t.rows).toHaveLength(1);
    expect(t.totals![11]).toBe(120);
  });
  it('SLP is empty for a non-VAT company', () => {
    expect(summaryListOfPurchases([r({})], { ...co, vatRegistered: false }).rows).toHaveLength(0);
  });
  it('report pack filters by period and verified status', () => {
    const all = [r({}), r({ id: 'b', date: '2026-06-01' }), r({ id: 'c', status: 'needs_review' })];
    expect(reportPack(all, co, quarterPeriod(2026, 1), false).list).toHaveLength(2);
    expect(reportPack(all, co, quarterPeriod(2026, 1), true).list).toHaveLength(1);
  });
  it('CSV neutralises formula injection and escapes quotes', () => {
    const csv = csvOf({ name: 'x', headers: ['a'], rows: [['=HYPERLINK("http://evil")'], ['say "hi"']] });
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(csv).toContain('"say ""hi"""');
  });
});
