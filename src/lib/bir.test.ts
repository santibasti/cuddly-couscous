import { describe, expect, it } from 'vitest';
import { buildSlp, buildSls, fmtTin, groupSlsByBuyer, reconcile, reliefDate, slpTotals, slsTotals, tinOk } from './bir';
import type { DB } from './types';

const item = (rate: number) => ({ service_code: 'OTHER', description: 'x', qty: 1, unit: 'lot', rate, discount: 0 });
const inv = (id: string, client: string, vat_mode: 'exclusive' | 'inclusive' | 'none', rate: number, date = '2026-10-05') => ({ id, number: id.toUpperCase(), client_id: client, issue_date: date, due_date: date, items: [item(rate)], vat_mode, vat_rate: 12, discount: 0, withholding_rate: 0, status: 'Approved' });
const exp = (id: string, o: Record<string, unknown>) => ({ id, date: '2026-10-10', payee: 'Supplier ' + id, category: 'Materials', amount: 1120, vat: 120, wht: 0, approval: 'Approved', ...o });
const db = {
  settings: { company: { name: 'TopMop', tin: '123456789000' }, vat_rate: 12 },
  clients: [
    { id: 'c1', name: 'Biz Corp', tin: '111-222-333-00000', address: 'Makati', billing_address: 'Makati City', type: 'Commercial' },
    { id: 'c2', name: 'Biz No TIN', tin: '', address: '', billing_address: '', type: 'Commercial' },
    { id: 'c3', name: 'Walk-in Person', tin: '', address: 'QC', billing_address: '', type: 'Residential' },
  ],
  invoices: [inv('a', 'c1', 'exclusive', 1000), inv('b', 'c1', 'exclusive', 2000, '2026-10-20'), inv('c', 'c2', 'inclusive', 1120), inv('d', 'c3', 'none', 500), inv('e', 'c1', 'exclusive', 999, '2026-09-30'), { ...inv('f', 'c1', 'exclusive', 100), status: 'Reversed' }],
  expenses: [
    exp('x1', { supplier_vat: 'VAT', supplier_tin: '999-888-777-00000', supplier_address: 'Pasig', supplier_invoice_no: 'SI-1', purchase_kind: 'Services' }),
    exp('x2', { supplier_vat: 'VAT', supplier_tin: '', supplier_address: 'Pasig', supplier_invoice_no: 'SI-2' }),
    exp('x3', { supplier_vat: 'Non-VAT', vat: 0, amount: 500, supplier_tin: '555-444-333-00000', supplier_address: 'Taguig', supplier_invoice_no: 'OR-9' }),
    exp('x4', { supplier_vat: 'Non-VAT', vat: 60, amount: 500 }),
    exp('x5', { category: 'Payroll' }), exp('x6', { approval: 'Pending' }), exp('x7', { reversed: true }),
  ],
} as unknown as DB;

describe('BIR compliance lists', () => {
  it('formats TIN and dates, and only checks the format', () => {
    expect(fmtTin('111222333000')).toBe('111-222-333-000'); expect(tinOk('111-222-333')).toBe(true); expect(tinOk('12345')).toBe(false); expect(reliefDate('2026-10-05')).toBe('10/05/2026');
  });
  it('SLS: approved invoices of the month only, classified, totals check', () => {
    const rows = buildSls(db, '2026-10'); expect(rows.map((r) => r.id)).toEqual(['a', 'c', 'b', 'd'].sort((x, y) => (rows.find((r) => r.id === x)!.date.localeCompare(rows.find((r) => r.id === y)!.date))));
    const a = rows.find((r) => r.id === 'a')!; expect(a.taxable).toBe(1000); expect(a.output_tax).toBe(120); expect(a.gross_taxable).toBe(1120);
    const c = rows.find((r) => r.id === 'c')!; expect(c.taxable).toBe(1000); expect(c.output_tax).toBe(120);
    expect(c.flags.some((f) => f.level === 'error' && /TIN/.test(f.text))).toBe(true); expect(c.tin).toBe('');
    const d = rows.find((r) => r.id === 'd')!; expect(d.cls).toBe('none'); expect(d.flags.some((f) => /walk-in/i.test(f.text))).toBe(true);
    const t = slsTotals(rows); expect(t.taxable).toBe(4000); expect(t.output_tax).toBe(480); expect(t.count).toBe(3);
  });
  it('SLS: zero-rated / exempt override, skip, and per-buyer grouping', () => {
    const d2 = { ...db, settings: { ...db.settings, bir: { sls_class: { d: 'exempt' as const }, sls_skip: ['b'] } } } as unknown as DB;
    const t = slsTotals(buildSls(d2, '2026-10')); expect(t.exempt).toBe(500); expect(t.taxable).toBe(2000);
    const g = groupSlsByBuyer(buildSls(db, '2026-10')); const biz = g.find((r) => r.client_id === 'c1')!; expect(biz.taxable).toBe(3000); expect(biz.output_tax).toBe(360);
  });
  it('SLP: classification, creditable input VAT, non-VAT, and exclusions', () => {
    const rows = buildSlp(db, '2026-10'); expect(rows.map((r) => r.id).sort()).toEqual(['x1', 'x2', 'x3', 'x4']);
    const x1 = rows.find((r) => r.id === 'x1')!; expect(x1.taxable).toBe(1000); expect(x1.services).toBe(1000); expect(x1.input_vat).toBe(120);
    const x2 = rows.find((r) => r.id === 'x2')!; expect(x2.input_vat).toBe(0); expect(x2.flags.some((f) => /TIN/.test(f.text))).toBe(true);
    const x3 = rows.find((r) => r.id === 'x3')!; expect(x3.exempt).toBe(500); expect(x3.input_vat).toBe(0); expect(x3.taxable).toBe(0);
    const x4 = rows.find((r) => r.id === 'x4')!; expect(x4.input_vat).toBe(0); expect(x4.flags.some((f) => f.level === 'error' && /not creditable/.test(f.text))).toBe(true);
    const t = slpTotals(rows); expect(t.input_vat).toBe(120); expect(t.count).toBe(4);
  });
  it('reconciles output against input', () => {
    const r = reconcile(db, '2026-10'); expect(r.output_tax).toBe(480); expect(r.input_vat).toBe(120); expect(r.payable).toBe(360);
    expect(r.invoice_vat).toBe(480); expect(r.output_gap).toBe(0); expect(r.expense_vat).toBe(300); expect(r.not_credited).toBe(180);
  });
});
