import { describe, expect, it } from 'vitest';

const mem = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } });

describe('invoice payment details', () => {
  it('uses the Bank of Commerce account by default and lets Admin change it', async () => {
    const { bankDetails } = await import('./business');
    expect(bankDetails(undefined)).toEqual({ bank_name: 'Bank of Commerce', account_name: 'Top Mop WCS Corp', account_number: '130-20-003385-1' });
    expect(bankDetails({ bank: { account_number: '999' } }).account_number).toBe('999');
    expect(bankDetails({ bank: { bank_name: '' } }).bank_name).toBe('Bank of Commerce');
  });
});
