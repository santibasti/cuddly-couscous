import { describe, expect, it } from 'vitest';
import { blankDraft, checkReceipt, draftFromReading, readyForBir } from './receipts';

const full = () => ({ ...blankDraft(), supplier_name: 'ABC Hardware', supplier_tin: '123-456-789-00000', supplier_address: 'Pasig City', receipt_no: 'OR-1001', receipt_date: '2026-10-10', total_amount: 1120, vatable_sales: 1000, vat_amount: 120, supplier_vat: 'VAT' as const });

describe('receipt checks', () => {
  it('a complete VAT receipt is ready', () => { expect(readyForBir(checkReceipt(full(), [], undefined, '2026-10-17'))).toBe(true); });
  it('missing details are errors, nothing is invented', () => {
    const c = checkReceipt({ ...full(), supplier_tin: null, supplier_address: null }, [], undefined, '2026-10-17');
    expect(c.filter((x) => x.level === 'error').map((x) => x.field).sort()).toEqual(['supplier_address', 'supplier_tin']); expect(readyForBir(c)).toBe(false);
  });
  it('amounts that do not add up or VAT that is not 12% are flagged', () => {
    expect(checkReceipt({ ...full(), total_amount: 1500 }, [], undefined, '2026-10-17').some((x) => /is 1120.00, but the total/.test(x.text))).toBe(true);
    expect(checkReceipt({ ...full(), vat_amount: 90, total_amount: 1090 }, [], undefined, '2026-10-17').some((x) => /12%/.test(x.text))).toBe(true);
  });
  it('a non-VAT supplier showing VAT is an error; a future date and a duplicate are warned', () => {
    expect(checkReceipt({ ...full(), supplier_vat: 'Non-VAT' }, [], undefined, '2026-10-17').some((x) => x.level === 'error' && x.field === 'vat_amount')).toBe(true);
    expect(checkReceipt({ ...full(), receipt_date: '2027-01-01' }, [], undefined, '2026-10-17').some((x) => /future/.test(x.text))).toBe(true);
    const dup = [{ id: 'x', supplier_tin: '123-456-789-00000', receipt_no: 'OR-1001', total_amount: 1120 }];
    expect(checkReceipt(full(), dup, undefined, '2026-10-17').some((x) => /double entry/.test(x.text))).toBe(true);
    expect(checkReceipt(full(), dup, 'x', '2026-10-17').some((x) => /double entry/.test(x.text))).toBe(false);
  });
  it('turns an AI reading into a draft and keeps what it could not read empty', () => {
    const d = draftFromReading({ fields: { supplier_name: 'ABC', supplier_tin: null, total_amount: 560, date: '2026-10-10', vat_status: 'VAT' }, unreadable: ['supplier_tin'], low_confidence: [], notes: 'faded' });
    expect(d.supplier_tin).toBeNull(); expect(d.total_amount).toBe(560); expect(d.supplier_vat).toBe('VAT'); expect(d.ocr?.unreadable).toEqual(['supplier_tin']);
    expect(checkReceipt(d, [], undefined, '2026-10-17').some((x) => /Hard to read/.test(x.text))).toBe(true);
  });
});
