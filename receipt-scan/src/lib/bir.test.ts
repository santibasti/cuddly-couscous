import { describe, expect, it } from 'vitest';
import { blankReceipt, checkReceipt, formatTin, hasErrors, inputVatClaimable, isValidTin, monthPeriod, quarterOf, quarterPeriod, splitVat, totalsOf, inPeriod } from './bir';
import type { Receipt } from './types';

const good = (over: Partial<Receipt> = {}): Receipt => ({
  ...blankReceipt('c1'), supplierName: 'ABC Hardware', supplierTin: '123-456-789-00000', invoiceNo: 'SI-0001', date: '2026-03-10',
  vatable: 1000, vatAmount: 120, total: 1120, ...over,
});
const vatCo = { vatRegistered: true };

describe('TIN', () => {
  it('formats and validates', () => {
    expect(formatTin('123456789000')).toBe('123-456-789-000');
    expect(formatTin('12345678900000')).toBe('123-456-789-00000');
    expect(isValidTin('123-456-789')).toBe(true);
    expect(isValidTin('123-456-789-00000')).toBe(true);
    expect(isValidTin('123-456-78')).toBe(false);
    expect(isValidTin('1234567890')).toBe(false);
  });
});

describe('splitVat', () => {
  it('splits a VAT-inclusive total', () => {
    expect(splitVat(1120)).toEqual({ vatable: 1000, vat: 120 });
    const s = splitVat(559.5);
    expect(s.vatable + s.vat).toBeCloseTo(559.5, 2);
  });
});

describe('checkReceipt', () => {
  it('passes a clean receipt', () => {
    expect(checkReceipt(good(), [], vatCo)).toEqual([]);
  });
  it('flags missing TIN as an error for VAT companies, a warning otherwise', () => {
    const r = good({ supplierTin: '' });
    expect(hasErrors(checkReceipt(r, [], vatCo))).toBe(true);
    expect(hasErrors(checkReceipt(r, [], { vatRegistered: false }))).toBe(false);
  });
  it('flags a breakdown that does not add up', () => {
    const issues = checkReceipt(good({ total: 1500 }), [], vatCo);
    expect(issues.some((i) => i.field === 'total' && i.severity === 'error')).toBe(true);
  });
  it('flags VAT charged by a NON-VAT supplier', () => {
    expect(hasErrors(checkReceipt(good({ supplierVatRegistered: false }), [], vatCo))).toBe(true);
  });
  it('flags wrong VAT rate', () => {
    const issues = checkReceipt(good({ vatAmount: 100, total: 1100 }), [], vatCo);
    expect(issues.some((i) => i.field === 'vatAmount')).toBe(true);
  });
  it('flags duplicates and future dates', () => {
    const a = good({ id: 'a' });
    expect(checkReceipt(good({ id: 'b' }), [a], vatCo).some((i) => i.message.includes('duplicate'))).toBe(true);
    expect(checkReceipt(good({ date: '2999-01-01' }), [], vatCo).some((i) => i.field === 'date')).toBe(true);
  });
  it('flags the same photo uploaded twice', () => {
    const a = good({ id: 'a', imageHash: 'h' });
    expect(checkReceipt(good({ id: 'b', invoiceNo: 'SI-2', imageHash: 'h' }), [a], vatCo).some((i) => i.field === 'imageHash')).toBe(true);
  });
});

describe('inputVatClaimable', () => {
  it('requires a VAT-registered buyer and a valid VAT invoice', () => {
    expect(inputVatClaimable(good(), vatCo)).toBe(true);
    expect(inputVatClaimable(good(), { vatRegistered: false })).toBe(false);
    expect(inputVatClaimable(good({ docType: 'other' }), vatCo)).toBe(false);
    expect(inputVatClaimable(good({ supplierTin: '' }), vatCo)).toBe(false);
    expect(inputVatClaimable(good({ deductible: false }), vatCo)).toBe(false);
  });
});

describe('periods and totals', () => {
  it('builds quarter and month ranges', () => {
    expect(quarterOf('2026-05-04')).toBe('2026-Q2');
    expect(quarterPeriod(2026, 4)).toMatchObject({ from: '2026-10-01', to: '2026-12-31' });
    expect(monthPeriod('2026-02').to).toBe('2026-02-28');
    expect(inPeriod(good({ date: '2026-03-31' }), quarterPeriod(2026, 1))).toBe(true);
  });
  it('sums totals', () => {
    const t = totalsOf([good(), good({ total: 560, vatable: 500, vatAmount: 60 })]);
    expect(t).toMatchObject({ count: 2, gross: 1680, vat: 180, vatable: 1500 });
  });
});
