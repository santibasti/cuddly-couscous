import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chatQuotation, isOther } from '../../supabase/functions/_shared/chatquote';
import * as core from '../../supabase/functions/_shared/appcore.mjs';
import { priceService, buildContent, contentKey } from './servercore';
import { planQuote } from './quickbooking';
import { seedDB } from './seed';
import { addDays } from './util';

const db = seedDB(); const today = '2026-11-16';
const cq = (address: string, service = '') => chatQuotation({ services: db.services, settings: db.settings, address, service, today, addDays });

describe('the internal pre-approved quotation of a chat booking', () => {
  it('is the city starting package, exactly as Quick booking prices it', () => {
    const q = cq('Alabang, Makati City')!; expect(q.code).toBe('GLASS_EXT'); expect(q.payload.items).toEqual(planQuote(db, { address: 'Alabang, Makati City', service: '' }).items);
    expect((q.payload.items as { unit: string; rate: number; package_qty: number }[])[0]).toMatchObject({ unit: 'package', rate: 4799, package_qty: 31 });
  });
  it('roof, wall and solar are billed at the minimum until the crew measures; "solar panel" is not a glass package', () => {
    expect(cq('Imus', 'roof cleaning')!.payload.items).toMatchObject([{ qty: 100, rate: 145 }]); expect(cq('Imus', 'Solar Panel Cleaning')!.code).toBe('SOLAR'); expect(cq('Imus', 'Solar Panel Cleaning')!.payload.items).toMatchObject([{ qty: 20, rate: 245 }]);
    expect(isOther('window cleaning')).toBeUndefined(); expect(planQuote(db, { address: 'Imus', service: 'Solar Panel Cleaning' }).other?.code).toBe('SOLAR');
  });
  it('holds nothing about a total for the client: the scope says the crew counts on site; an unknown city gives no quotation', () => {
    expect(cq('Makati')!.scope).toMatch(/crew counts the real quantity on site/); expect(cq('Hong Kong')).toBeNull();
  });
});

describe('the server bundle is the app code', () => {
  it('is up to date (rebuild it with: npm run build:core)', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'core-')), 'appcore.mjs'); execSync(`npx rolldown src/lib/servercore.ts --format esm --platform neutral -o ${out}`, { cwd: process.cwd(), stdio: 'pipe' });
    expect(readFileSync('supabase/functions/_shared/appcore.mjs', 'utf8').trim()).toBe(readFileSync(out, 'utf8').trim());
  });
  it('prices and writes the Job Order content exactly like the app', () => {
    const svc = db.services.find((s) => s.code === 'GLASS_EXT')!; expect(core.priceService(svc, 31, { price: 4799, qty: 31, excess_rate: 140 })).toEqual(priceService(svc, 31, { price: 4799, qty: 31, excess_rate: 140 }));
    const job = db.jobs.find((j) => j.quotation_id && db.quotations.find((q) => q.id === j.quotation_id && q.status === 'Approved'))!; const a = buildContent(db, job), b = core.buildContent(db, job); expect(b).toEqual(a); expect(core.contentKey(b)).toBe(contentKey(a));
  });
  it('a Job Order built for a chat booking shows the rates, no total, and no blocker', () => {
    const client = db.clients[0], site = db.sites.find((s) => s.client_id === client.id) ?? db.sites[0]; const q = cq('Makati')!;
    const quote = { ...db.quotations[0], id: 'q1', status: 'Approved', client_id: client.id, items: q.payload.items, scope: q.scope, vat_mode: 'none', vat_rate: 0, discount: 0, deleted_at: undefined, ocular_done: false, ocular_visit_id: undefined } as never;
    const job = { ...db.jobs[0], id: 'j1', quotation_id: 'q1', client_id: client.id, site_id: site.id, start_at: '2026-11-21T08:00', end_at: '2026-11-21T17:00', leader_id: undefined, crew_ids: [], vehicle_id: undefined, jo_prices: undefined, service_codes: ['GLASS_EXT'] } as never;
    const facts = { settings: db.settings, clients: [client], sites: [site], quotations: [quote], variations: [], employees: [], services: db.services, invoices: [], assets: [], discount_requests: [], job_orders: [] } as Record<string, unknown>;
    const c = core.buildContent(new Proxy(facts, { get: (t, k) => (k in t ? t[k as string] : []) }), job);
    expect(c.blocker).toBeUndefined(); expect(c.price_mode).toBe('rates'); expect(c.items[0]).toMatchObject({ unit: 'package', rate: 4799 });   // the document shows only the rates in this mode (the quantity is counted on site)
     expect(c.service_date).toBe('2026-11-21');
  });
});
