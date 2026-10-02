import { describe, expect, it } from 'vitest';
import { agingBucket, computePayrollLine, countPanels, docTotals, priceService, invoiceTotals } from './business';
import { seedDB } from './seed';
import { addDays, today } from './util';

const db = seedDB();
const svc = (code: string) => db.services.find((s) => s.code === code)!;

describe('TopMop pricing defaults', () => {
  it('glass starter package covers up to 31 panels', () => {
    const r = priceService(svc('GLASS_EXT'), 31);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].rate * r.lines[0].qty).toBe(4799);
  });
  it('glass excess panels are ₱140 each', () => {
    const r = priceService(svc('GLASS_EXT'), 40);
    expect(r.lines.map((l) => l.qty * l.rate)).toEqual([4799, 9 * 140]);
  });
  it('under 31 panels still bills the package', () => {
    expect(priceService(svc('GLASS_EXT'), 12).lines[0].rate).toBe(4799);
  });
  it('roof cleaning is ₱145/sqm with a 100 sqm minimum', () => {
    expect(priceService(svc('ROOF'), 80).lines[0].qty * 145).toBe(14500);
    expect(priceService(svc('ROOF'), 250).lines[0].qty * 145).toBe(36250);
  });
  it('wall/floor is ₱125/sqm with a 50 sqm minimum', () => {
    expect(priceService(svc('WALL'), 30).lines[0].qty * 125).toBe(6250);
  });
  it('solar is ₱245/panel with a 20 panel minimum', () => {
    expect(priceService(svc('SOLAR'), 10).lines[0].qty * 245).toBe(4900);
    expect(priceService(svc('SOLAR'), 60).lines[0].qty * 245).toBe(14700);
  });
});

describe('glass panel counting', () => {
  it('counts ≤ 2×1 m as one panel and larger as two', () => {
    expect(countPanels([{ w: 2, h: 1, qty: 3 }], 4).panels).toBe(3);
    expect(countPanels([{ w: 2.5, h: 1.2, qty: 3 }], 4).panels).toBe(6);
  });
  it('groups small panels', () => {
    expect(countPanels([{ w: 0.5, h: 0.5, qty: 10, grouped: true }], 4).panels).toBe(3);
  });
});

describe('totals & VAT', () => {
  const items = [{ service_code: 'ROOF' as const, description: 'x', qty: 100, unit: 'sqm', rate: 145, discount: 500 }];
  it('adds VAT when exclusive', () => {
    const t = docTotals(items, 0, 'exclusive', 12);
    expect(t.net).toBe(14000); expect(t.vat).toBe(1680); expect(t.total).toBe(15680);
  });
  it('extracts VAT when inclusive', () => {
    const t = docTotals(items, 0, 'inclusive', 12);
    expect(t.total).toBe(14000); expect(t.vat).toBeCloseTo(1500, 0);
  });
  it('withholding is computed on net of VAT', () => {
    const i = invoiceTotals({ items, discount: 0, vat_mode: 'exclusive', vat_rate: 12, withholding_rate: 2 });
    expect(i.wht).toBe(280); expect(i.collectible).toBe(15400);
  });
});

describe('aging buckets', () => {
  it('assigns overdue days to buckets', () => {
    const t = today();
    expect(agingBucket(addDays(t, 3), t)).toBe('Current');
    expect(agingBucket(addDays(t, -10), t)).toBe('1–30');
    expect(agingBucket(addDays(t, -45), t)).toBe('31–60');
    expect(agingBucket(addDays(t, -75), t)).toBe('61–90');
    expect(agingBucket(addDays(t, -120), t)).toBe('90+');
  });
});

describe('payroll calculation', () => {
  const emp = db.employees.find((e) => e.pay_basis === 'daily' && e.status === 'regular')!;
  const period = { id: 'p', label: 't', start: '2026-03-02', end: '2026-03-06', type: 'weekly', status: 'Draft', locked: false } as never;
  const att = (date: string, extra = {}) => ({ id: date, employee_id: emp.id, date, kind: 'Present', clock_in: `${date}T08:00`, clock_out: `${date}T17:00`, worked_hours: 8, late_min: 0, undertime_min: 0, ot_min: 0, field_work: false, approval: 'Approved', created_at: '', updated_at: '', created_by: '', ...extra });
  const run = (atts: unknown[], adjustments: unknown[] = []) => computePayrollLine({ emp: { ...emp, rest_day: 0 }, period, attendance: atts as never, holidays: [], adjustments: adjustments as never, settings: db.settings, asOf: '2026-03-06' }).line;

  it('pays approved days at the daily rate', () => {
    const l = run(['2026-03-02', '2026-03-03', '2026-03-04'].map((d) => att(d)));
    expect(l.days_worked).toBe(3);
    expect(l.regular_pay).toBe(emp.daily_rate * 3);
  });
  it('ignores pending attendance', () => {
    const l = run([att('2026-03-02'), att('2026-03-03', { approval: 'Pending' })]);
    expect(l.days_worked).toBe(1);
  });
  it('pays overtime at the configured multiplier', () => {
    const l = run([att('2026-03-02', { ot_min: 120 })]);
    expect(l.overtime_pay).toBeCloseTo((emp.daily_rate / 8) * 2 * 1.25, 1);
  });
  it('deducts cash advances and gross − deductions = net', () => {
    const l = run([att('2026-03-02'), att('2026-03-03')], [{ id: 'a', employee_id: emp.id, kind: 'Cash Advance', amount: 300, balance: 1000, period_id: null, active: true, note: '' }]);
    expect(l.cash_advance).toBe(300);
    expect(l.net).toBeCloseTo(l.gross - l.total_deductions, 2);
  });
  it('uses configurable statutory rates rather than hard-coded values', () => {
    const custom = structuredClone(db.settings); custom.statutory.find((r) => r.key === 'sss')!.value = 10; custom.statutory.find((r) => r.key === 'sss')!.max = 0;
    const l = computePayrollLine({ emp: { ...emp, rest_day: 0 }, period, attendance: [att('2026-03-02'), att('2026-03-03')] as never, holidays: [], adjustments: [], settings: custom, asOf: '2026-03-06' }).line;
    expect(l.sss).toBeCloseTo(l.regular_pay * 0.1, 1);
  });
});

describe('sha256 without Web Crypto (http:// on a phone)', () => {
  it('matches the standard digest', async () => {
    const { sha256 } = await import('./util');
    const real = await sha256('topmop:topmop123');
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
    try { expect(await sha256('topmop:topmop123')).toBe(real); expect(await sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'); }
    finally { if (saved) Object.defineProperty(globalThis, 'crypto', saved); }
  });
});
