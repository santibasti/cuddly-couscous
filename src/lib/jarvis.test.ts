import { describe, expect, it } from 'vitest';
import { addDays, alertIsInstant, alertLine, chunks, invoiceBalance, invoiceTotal, manilaDay, ownerIds, personaPrompt, speakable } from '../../supabase/functions/jarvis/logic';

describe('jarvis helpers', () => {
  it('works in Manila time', () => {
    expect(manilaDay(Date.parse('2026-11-14T17:00:00Z'))).toBe('2026-11-15');       // 1 AM Manila the next day
    expect(manilaDay(Date.parse('2026-11-14T15:59:00Z'))).toBe('2026-11-14');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01'); expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('reads the owner ids', () => {
    expect(ownerIds('123456, 789')).toEqual([123456, 789]); expect(ownerIds('')).toEqual([]); expect(ownerIds(undefined)).toEqual([]); expect(ownerIds('abc,-5,0,12')).toEqual([12]);
  });
  it('speaks instantly only for discounts and accepted quotations', () => {
    expect(alertIsInstant('discount')).toBe(true); expect(alertIsInstant('quotation')).toBe(true);
    expect(alertIsInstant('lead')).toBe(false); expect(alertIsInstant('variation')).toBe(false);
  });
  it('cleans text for the voice: pesos spelled out, no links, no phone numbers, no markdown', () => {
    const s = speakable('**Discount** requested: ₱1,200.50 off. Call 0917 123 4567 or see https://ops.topmop.ph/x now');
    expect(s).toContain('1,200.50 pesos'); expect(s).not.toMatch(/https?:|0917|\*/);
    expect(speakable('a'.repeat(3000), 100).length).toBeLessThanOrEqual(100);
  });
  it('turns an alert into one short line', () => {
    expect(alertLine({ kind: 'discount', title: 'Discount requested', body: 'DR-1 · JOB-9 · Ana: ₱500 off ₱5,000' })).toBe('Discount requested. DR-1 · JOB-9 · Ana: 500 pesos off 5,000 pesos');
  });
  it('splits long messages for Telegram', () => {
    const parts = chunks(('word '.repeat(2000)).trim(), 3800); expect(parts.length).toBeGreaterThan(1); expect(parts.every((p) => p.length <= 3800)).toBe(true);
    expect(chunks('short')).toEqual(['short']);
  });
  it('computes invoice totals and balances like the app', () => {
    const inv = { items: [{ qty: 1, rate: 5000, discount: 0 }, { qty: 2, rate: 1000, discount: 100 }], discount: 400, vat_mode: 'exclusive', vat_rate: 12 };
    expect(invoiceTotal(inv)).toBe(7280);                                              // (5000 + 2000 - 100 - 400) = 6500 × 1.12
    const pays = [{ amount: 3000, wht_amount: 130, status: 'Verified', reversed: false, method: 'Cash', cheque_status: null }, { amount: 999, wht_amount: 0, status: 'Pending Verification', reversed: false, method: 'Cash', cheque_status: null },
      { amount: 500, wht_amount: 0, status: 'Verified', reversed: true, method: 'Cash', cheque_status: null }, { amount: 700, wht_amount: 0, status: 'Verified', reversed: false, method: 'Cheque', cheque_status: 'Pending' }];
    expect(invoiceBalance(inv, pays)).toBe(4150);                                      // only the first payment counts
    expect(invoiceTotal({ items: [{ qty: 1, rate: 100, measure: true }, { qty: 1, rate: 50 }], discount: null, vat_mode: 'none', vat_rate: null })).toBe(50);
  });
  it('tells the assistant to stay read-only and keep names out when asked', () => {
    expect(personaPrompt('Boss', true)).toContain('"Boss"'); expect(personaPrompt('', false)).toContain('Do not say client names');
    expect(personaPrompt('', true)).toContain('You can only read information');
  });
});
