import { describe, expect, it } from 'vitest';

const mem = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) } });
import { seedDB } from './seed';
import { asOf, balanceSheet, buildEntries, cashFlow, entryProblem, equityStatement, flowOf, incomeStatement, ledger, openingLines, sumCredit, sumDebit, trialBalance, type ManualEntry } from './books';

const FROM = '2000-01-01', TO = '2100-12-31';

describe('books', () => {
  const db = seedDB();
  const entries = buildEntries(db, []);

  it('every journal entry balances, and the trial balance balances', () => {
    expect(entries.length).toBeGreaterThan(20);
    for (const e of entries) expect(Math.abs(sumDebit(e.lines) - sumCredit(e.lines))).toBeLessThan(0.005);
    const tb = trialBalance(entries, TO);
    expect(tb.debit).toBeCloseTo(tb.credit, 2);
  });

  it('the balance sheet balances and the income statement agrees with revenue less expenses', () => {
    const bs = balanceSheet(entries, TO);
    expect(bs.check).toBeCloseTo(0, 2);
    const is = incomeStatement(entries, FROM, TO);
    expect(is.netIncome).toBeCloseTo(is.totalRevenue - is.totalCost - is.totalOpex, 2);
    expect(is.totalRevenue).toBeGreaterThan(0);
  });

  it('the cash flow statement explains the change in cash exactly', () => {
    const cf = cashFlow(entries, '2026-01-01', '2026-12-31');
    expect(cf.difference).toBeCloseTo(0, 2);
    const whole = cashFlow(entries, FROM, TO);
    expect(whole.difference).toBeCloseTo(0, 2);
  });

  it('owner equity rolls forward: beginning + investments + income − drawings = ending, and it matches the balance sheet', () => {
    const manual: ManualEntry[] = [
      { id: 'o', kind: 'opening', entry_date: '2026-01-01', ref: '', memo: '', lines: openingLines({ '1010': 5000, '1020': 100000, '1500': 60000, '1590': 10000, '2010': 8000 }) },
      { id: 'a', kind: 'manual', entry_date: '2026-02-01', ref: 'JV1', memo: 'Owner invests', lines: [{ account: '1020', debit: 20000, credit: 0 }, { account: '3010', debit: 0, credit: 20000 }] },
      { id: 'b', kind: 'manual', entry_date: '2026-03-01', ref: 'JV2', memo: 'Owner draws', lines: [{ account: '3020', debit: 7000, credit: 0 }, { account: '1010', debit: 0, credit: 7000 }] },
    ];
    const en = buildEntries(db, manual);
    const eq = equityStatement(en, '2026-01-01', '2026-12-31');
    expect(eq.beginning).toBeCloseTo(147000, 2);                       // 5,000 + 100,000 + 60,000 − 10,000 − 8,000
    expect(eq.investments).toBe(20000); expect(eq.drawings).toBe(7000);
    expect(eq.ending).toBeCloseTo(eq.beginning + eq.investments + eq.netIncome - eq.drawings, 2);
    const bs = balanceSheet(en, '2026-12-31');
    expect(bs.totalEquity).toBeCloseTo(eq.ending, 2);
    expect(bs.check).toBeCloseTo(0, 2);
    expect(cashFlow(en, '2026-01-01', '2026-12-31').difference).toBeCloseTo(0, 2);
    expect(asOf(en, '2026-12-31')['3020']).toBe(7000);
  });

  it('records dated before the opening balances are left out, and receipts / disbursements are told apart', () => {
    const late = buildEntries(db, [{ id: 'o', kind: 'opening', entry_date: '2099-01-01', ref: '', memo: '', lines: openingLines({ '1020': 1000 }) }]);
    expect(late.filter((e) => e.source !== 'opening')).toHaveLength(0);
    expect(entries.some((e) => flowOf(e) === 'in')).toBe(true);
    expect(entries.some((e) => flowOf(e) === 'out')).toBe(true);
    expect(entries.filter((e) => e.source === 'invoice').every((e) => flowOf(e) === 'general')).toBe(true);
  });

  it('the ledger closing balance matches the balance sheet figure', () => {
    const l = ledger(entries, FROM, TO, '1100')[0];
    expect(l.closing).toBeCloseTo(asOf(entries, TO)['1100'] ?? 0, 2);
  });

  it('checks that a manual entry balances', () => {
    expect(entryProblem([{ account: '1010', debit: 5, credit: 0 }])).toMatch(/two lines/);
    expect(entryProblem([{ account: '1010', debit: 5, credit: 0 }, { account: '3010', debit: 0, credit: 4 }])).toMatch(/must be equal/);
    expect(entryProblem([{ account: '1010', debit: 5, credit: 0 }, { account: '3010', debit: 0, credit: 5 }])).toBeNull();
  });
});
