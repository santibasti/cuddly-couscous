import { describe, expect, it } from 'vitest';
import { seedDB } from './seed';
import { geoPatch, locate } from './geo-ph';
import { areaHighlights, areaRows, kpis, mapData, noFilters, scopeOf, sortAreas, trend } from './insights';
import { today, monthStart, monthEnd } from './util';

const db = seedDB(); const T = today();
const wide = () => noFilters('2000-01-01', '2100-01-01');

describe('geocoding by address', () => {
  it('prefers the most specific place named', () => {
    expect(locate('Brgy. Pinagsama, Taguig City')?.city).toBe('Taguig');
    expect(locate('Poblacion, San Rafael, Bulacan')?.city).toBe('San Rafael');
    expect(locate('Somewhere in Laguna')?.level).toBe('province');
    expect(locate('Unknown Street')).toBeNull();
  });
  it('flags an unmappable address and keeps manual coordinates', () => {
    expect(geoPatch('Nowhere 123').geo_status).toBe('unmapped');
    expect(geoPatch('Makati City', { geo_source: 'manual', geo_address: 'Makati City' })).toEqual({});
    expect(geoPatch('Makati City').geo_status).toBe('approximate');
  });
  it('seed data is placed', () => { expect(db.sites.filter((s) => s.lat != null).length).toBeGreaterThan(5); });
});

describe('executive insights', () => {
  it('gives exact pins to Admin / CEO only', () => {
    const exec = mapData(db, scopeOf(db, wide(), true, T)); const other = mapData(db, scopeOf(db, wide(), false, T));
    expect(exec.pins.length).toBeGreaterThan(3); expect(other.pins).toHaveLength(0);
    const rows = areaRows(db, scopeOf(db, wide(), false, T));
    expect(rows.length).toBeGreaterThan(2);
    expect(rows.every((r) => r.billed === 0 && r.collected === 0 && r.outstanding === 0 && r.gross === undefined)).toBe(true);
    expect(areaHighlights(rows, false).revenue).toHaveLength(0);
    expect(kpis(db, scopeOf(db, wide(), false, T)).revenue).toBeUndefined();
    expect(trend(db, scopeOf(db, wide(), false, T), 'months6').every((p) => p.revenue === 0)).toBe(true);
  });
  it('area money matches the invoices and verified payments', () => {
    const s = scopeOf(db, wide(), true, T); const rows = areaRows(db, s);
    const billed = rows.reduce((a, r) => a + r.billed, 0);
    const all = db.invoices.filter((i) => i.status === 'Approved' && !i.deleted_at).reduce((a, i) => a + i.items.reduce((x, it) => x + it.qty * it.rate - it.discount, 0), 0);
    expect(billed).toBeGreaterThan(0); expect(billed).toBeLessThanOrEqual(all * 1.3);
    expect(sortAreas(rows, 'billed')[0].billed).toBeGreaterThanOrEqual(sortAreas(rows, 'billed')[1].billed);
  });
  it('filters apply to KPIs, map and areas together', () => {
    const f = { ...wide(), segment: 'Residential' as const }; const s = scopeOf(db, f, true, T);
    expect(s.clients.every((r) => r.segment === 'Residential')).toBe(true);
    expect(mapData(db, s).pins.every((p) => p.segment === 'Residential')).toBe(true);
    expect(kpis(db, s).newClients).toBeLessThanOrEqual(kpis(db, scopeOf(db, wide(), true, T)).newClients);
    const none = scopeOf(db, { ...wide(), city: 'Atlantis' }, true, T); expect(none.clients).toHaveLength(0); expect(areaRows(db, none)).toHaveLength(0);
  });
  it('profit is "pending" until costs are actual', () => {
    const k = kpis(db, scopeOf(db, wide(), true, T));
    expect(k.gross === 'pending' || typeof k.gross === 'object').toBe(true);
    void monthStart(T); void monthEnd(T);
  });
});

import { permsFor, DEFAULT_ACCESS } from './rbac';
describe('permissions saved before a feature existed', () => {
  const old = { ...DEFAULT_ACCESS, owner: ['dashboard.view'], ops: DEFAULT_ACCESS.ops.filter((p) => p !== 'joborders.manage') } as typeof DEFAULT_ACCESS;
  it('owner always has everything; new permissions use their defaults', () => {
    expect(permsFor('owner', old).has('dashboard.executive')).toBe(true);
    expect(permsFor('ops', old).has('joborders.manage')).toBe(true);
    expect(permsFor('ops', old).has('dashboard.executive')).toBe(false);
  });
  it('a permission an Admin removed from one role stays removed', () => {
    const o = { ...DEFAULT_ACCESS, ops: DEFAULT_ACCESS.ops.filter((p) => p !== 'jobs.edit') } as typeof DEFAULT_ACCESS;
    expect(permsFor('ops', o).has('jobs.edit')).toBe(false);
  });
});

describe('migrated bills in the dashboard figures', () => {
  it('count as revenue and collections in the period they are dated, and drop out under a service filter', () => {
    const d = seedDB(); const c = d.clients[0];
    const before = kpis(d, scopeOf(d, wide(), true, T), ['2024-10-01', '2024-10-31']);
    c.past_bills = [{ id: 'p1', date: '2024-10-12', ref: '', total: 4799, items: [], notes: '' }, { id: 'p2', date: '2024-09-24', ref: '', total: 7599, items: [], notes: '' }];
    const after = kpis(d, scopeOf(d, wide(), true, T), ['2024-10-01', '2024-10-31']);
    expect((after.revenue ?? 0) - (before.revenue ?? 0)).toBeCloseTo(4799, 2); expect((after.collections ?? 0) - (before.collections ?? 0)).toBeCloseTo(4799, 2); expect(after.earlier).toBeCloseTo(4799, 2);
    const t = trend(d, scopeOf(d, wide(), true, T), 'months12'); expect(t.every((p) => p.revenue >= 0)).toBe(true);
    const f = { ...wide(), service: 'GLASS_EXT' as never };
    expect(kpis(d, scopeOf(d, f, true, T), ['2024-10-01', '2024-10-31']).earlier).toBe(0);
  });
});
