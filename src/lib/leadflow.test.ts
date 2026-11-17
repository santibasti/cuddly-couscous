import { describe, expect, it } from 'vitest';
import { crewNeeded, flowCards, flowSummary, proposeTeam, serviceWord, suggestDays } from './leadflow';
import type { DB } from './types';

const NOW = Date.parse('2026-11-16T04:00:00Z');                    // 12:00 in Manila
const iso = (hoursAgo: number) => new Date(NOW - hoursAgo * 3_600_000).toISOString();
const base = { created_at: iso(1), updated_at: iso(1), deleted_at: null };
const db = (over: Partial<Record<string, unknown[]>> = {}) => ({
  clients: [{ id: 'c1', name: 'Maria Santos', city: 'Makati', address: 'x' }], sites: [], services: [{ code: 'GLASS_EXT', name: 'Glass Cleaning' }],
  inquiries: [], quotations: [], jobs: [], job_orders: [], employees: [], assets: [], ...over,
}) as unknown as DB;
const inq = (id: string, over = {}) => ({ id, client_id: 'c1', service_codes: ['GLASS_EXT'], stage: 'Inquiry', source: 'Facebook', details: '', ...base, ...over });
const quote = (id: string, status: string, over = {}) => ({ id, number: `QT-${id}`, client_id: 'c1', inquiry_id: 'i1', status, items: [], ...base, ...over });
const job = (id: string, over = {}) => ({ id, number: `JOB-${id}`, quotation_id: 'q1', start_at: '2026-11-18T08:00', end_at: '2026-11-18T17:00', status: 'Confirmed', leader_id: undefined, crew_ids: [], ...base, ...over });

describe('lead flow: where each lead stands', () => {
  it('walks a lead through every step', () => {
    const step = (d: DB) => flowCards(d, NOW)[0]?.step;
    expect(step(db({ inquiries: [inq('i1')] }))).toBe('new');
    expect(step(db({ inquiries: [inq('i1')], quotations: [quote('q1', 'Draft')] }))).toBe('quote');
    expect(step(db({ inquiries: [inq('i1')], quotations: [quote('q1', 'Sent', { sent_at: iso(2) })] }))).toBe('sent');
    expect(step(db({ inquiries: [inq('i1')], quotations: [quote('q1', 'Approved')] }))).toBe('confirm');
    expect(step(db({ inquiries: [inq('i1')], quotations: [quote('q1', 'Approved')], jobs: [job('j1')] }))).toBe('book');
    expect(step(db({ inquiries: [inq('i1')], quotations: [quote('q1', 'Approved')], jobs: [job('j1', { leader_id: 'e1' })] }))).toBe('order');
    expect(step(db({ inquiries: [inq('i1')], quotations: [quote('q1', 'Approved')], jobs: [job('j1', { leader_id: 'e1' })], job_orders: [{ id: 'o1', job_id: 'j1', status: 'Sent to Client', version: 1, ...base }] }))).toBe('ready');
  });
  it('leaves out lost inquiries, rejected quotations, cancelled jobs and finished work', () => {
    expect(flowCards(db({ inquiries: [inq('i1', { stage: 'Lost' })] }), NOW)).toHaveLength(0);
    expect(flowCards(db({ inquiries: [inq('i1')], quotations: [quote('q1', 'Rejected')] }), NOW).map((c) => c.step)).toEqual(['new']);   // back to a new lead: a new quotation can be made
    expect(flowCards(db({ inquiries: [inq('i1')], quotations: [quote('q1', 'Approved')], jobs: [job('j1', { status: 'Cancelled' })] }), NOW)[0].step).toBe('confirm');
    expect(flowCards(db({ inquiries: [inq('i1')], quotations: [quote('q1', 'Approved')], jobs: [job('j1', { status: 'Closed', leader_id: 'e1' })] }), NOW)[0].step).toBe('confirm');
  });
  it('also shows quotations that did not start as an inquiry (quick bookings)', () => {
    const cards = flowCards(db({ quotations: [quote('q9', 'Sent', { inquiry_id: undefined, sent_at: iso(5) })] }), NOW);
    expect(cards).toHaveLength(1); expect(cards[0]).toMatchObject({ step: 'sent', client: 'Maria Santos', place: 'Makati' });
  });
  it('flags what needs attention and puts urgent leads first', () => {
    const cards = flowCards(db({ inquiries: [inq('i1', { created_at: iso(60) }), inq('i2', { id: 'i2' })], quotations: [quote('q3', 'Sent', { inquiry_id: undefined, sent_at: iso(100) })] }), NOW);
    expect(cards[0]).toMatchObject({ inquiryId: 'i1', urgent: true }); expect(cards[0].flags[0]).toContain('No quotation for 2 d');
    expect(cards.find((c) => c.step === 'sent')!.flags[0]).toContain('No reply for 4 d');
    expect(cards.find((c) => c.inquiryId === 'i2')!.urgent).toBe(false);
    const soon = flowCards(db({ inquiries: [inq('i1')], quotations: [quote('q1', 'Approved')], jobs: [job('j1', { start_at: '2026-11-17T08:00' })] }), NOW)[0];
    expect(soon).toMatchObject({ step: 'book', urgent: true }); expect(soon.flags[0]).toContain('no crew');
  });
  it('hides forgotten leads (over 30 days, or jobs that already started) from the counts', () => {
    const d = db({ inquiries: [inq('i1', { created_at: iso(24 * 45) }), inq('i2', { id: 'i2' })] });
    const cards = flowCards(d, NOW); expect(cards.find((c) => c.inquiryId === 'i1')).toMatchObject({ stale: true, urgent: false }); expect(cards.find((c) => c.inquiryId === 'i2')!.stale).toBe(false);
    expect(flowSummary(d, cards, NOW).byStep.new).toBe(1);
    const old = flowCards(db({ inquiries: [inq('i1')], quotations: [quote('q1', 'Approved')], jobs: [job('j1', { start_at: '2026-11-01T08:00', end_at: '2026-11-01T17:00' })] }), NOW)[0];
    expect(old).toMatchObject({ step: 'book', stale: true });
  });
  it('counts what waits for you and the month\'s conversion', () => {
    const d = db({ inquiries: [inq('i1'), inq('i2', { stage: 'Booked' }), inq('i3')], quotations: [quote('q1', 'Draft', { inquiry_id: 'i3' })] });
    const s = flowSummary(d, flowCards(d, NOW), NOW);
    expect(s.byStep.new).toBe(2); expect(s.byStep.quote).toBe(1); expect(s.waitingForYou).toBe(1); expect(s.leadsThisMonth).toBe(3); expect(s.wonThisMonth).toBe(1); expect(s.conversion).toBe(33);
  });
});

describe('lead flow: booking helpers', () => {
  it('maps service codes to the words the price list understands', () => { expect(serviceWord(['ROOF'])).toBe('roof'); expect(serviceWord(['GLASS_EXT', 'SOLAR'])).toBe('solar'); expect(serviceWord([])).toBe('glass'); });
  it('reads the crew size of a quotation', () => { expect(crewNeeded('3 crew + 1 leader')).toBe(3); expect(crewNeeded(undefined)).toBe(3); expect(crewNeeded('', 4)).toBe(4); expect(crewNeeded('40')).toBe(3); });
  it('suggests days that have enough free people and a vehicle, and skips days that are taken', () => {
    const emp = (id: string, tier: string) => ({ id, full_name: id, department: 'Field Operations', status: 'active', tier, ...base });
    const d = db({ employees: [emp('L1', 'Team Leader'), emp('T1', 'Technician'), emp('T2', 'Technician')], assets: [{ id: 'v1', name: 'Van', category: 'Vehicle', status: 'Available', ...base }],
      jobs: [job('jb', { start_at: '2026-11-17T08:00', end_at: '2026-11-17T17:00', leader_id: 'L1', crew_ids: ['T1'], vehicle_id: 'v1', status: 'Confirmed' })] });
    const days = suggestDays(d, { from: '2026-11-16', days: 3, need: 3 });
    expect(days.map((x) => x.ok)).toEqual([true, false, true]);                                              // the 17th has the leader, a technician and the van already booked
    const team = proposeTeam(days[0], 3); expect(team.leader?.id).toBe('L1'); expect(team.crew.map((e) => e.id).sort()).toEqual(['T1', 'T2']); expect(team.vehicle?.id).toBe('v1');
  });
});

describe('lead flow: bookings made by the chat', () => {
  it('shows a chat booking first in its column with a "Booked by the chat" tag', () => {
    const old = job('j0', { id: 'j0', quotation_id: 'q0', created_at: iso(24 * 9), start_at: '2026-11-17T08:00', end_at: '2026-11-17T17:00' });
    const chat = job('j1', { created_by: 'chat', created_at: iso(1), start_at: '2026-11-19T08:00', end_at: '2026-11-19T17:00' });
    const cards = flowCards(db({ inquiries: [inq('i0', { id: 'i0' }), inq('i1')], quotations: [quote('q0', 'Approved', { inquiry_id: 'i0' }), quote('q1', 'Approved')], jobs: [old, chat] }), NOW);
    expect(cards[0]).toMatchObject({ jobId: 'j1', step: 'book', fresh: true }); expect(cards[0].flags).toContain('Booked by the chat');
    expect(cards.find((c) => c.jobId === 'j0')!.fresh).toBe(false);
  });
});
