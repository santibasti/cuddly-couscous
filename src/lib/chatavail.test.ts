import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, bookedReply, parseLang, pick, checkAvailability, dayCheck, normalizeRules, parseWanted, type Facts } from '../../supabase/functions/chat-availability/logic';

const today = '2026-11-16';                                       // a Monday
const people = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `e${i}`, tier: i === 0 ? 'Team Leader' : 'Technician' }));
const facts = (o: Partial<Facts> = {}): Facts => ({ jobs: [], field: people(8), vehicles: [{ id: 'v1' }, { id: 'v2' }], holidays: [], ...o });
const job = (date: string, ids: string[], vehicle = 'v1', end = date) => ({ start_at: `${date}T08:00`, end_at: `${end}T17:00`, status: 'Scheduled', leader_id: ids[0], crew_ids: ids.slice(1), vehicle_id: vehicle });

describe('understanding the date', () => {
  it('reads ISO dates, tomorrow, weekdays, month names and Tagalog', () => {
    expect(parseWanted('2026-11-21', today)).toBe('2026-11-21'); expect(parseWanted('bukas', today)).toBe('2026-11-17'); expect(parseWanted('Saturday', today)).toBe('2026-11-21');
    expect(parseWanted('sa sabado', today)).toBe('2026-11-21'); expect(parseWanted('next Saturday', today)).toBe('2026-11-28'); expect(parseWanted('Nov 21', today)).toBe('2026-11-21');
    expect(parseWanted('21 November', today)).toBe('2026-11-21'); expect(parseWanted('11/21', today)).toBe('2026-11-21'); expect(parseWanted('Jan 5', today)).toBe('2027-01-05');
  });
  it('says so when it cannot understand', () => { expect(parseWanted('whenever', today)).toBeNull(); expect(parseWanted('', today)).toBeNull(); expect(checkAvailability(null, today, DEFAULT_RULES, facts()).status).toBe('unclear'); });
});

describe('is the day open', () => {
  it('open with a leader, crew and a vehicle free', () => expect(dayCheck('2026-11-21', today, DEFAULT_RULES, facts()).status).toBe('available'));
  it('closed on a closed weekday (Sunday by default) and on a regular holiday', () => {
    expect(dayCheck('2026-11-22', today, DEFAULT_RULES, facts()).status).toBe('closed'); expect(dayCheck('2026-11-24', today, DEFAULT_RULES, facts({ holidays: ['2026-11-24'] })).status).toBe('closed');
  });
  it('too soon inside the lead time', () => { expect(dayCheck('2026-11-17', today, DEFAULT_RULES, facts()).status).toBe('too_soon'); expect(dayCheck('2026-11-18', today, DEFAULT_RULES, facts()).status).toBe('available'); });
  it('full when the daily limit is reached: two jobs by default, also for a multi-day job', () => {
    const two = [job('2026-11-21', ['e0']), job('2026-11-20', ['e1'], 'v2', '2026-11-22')]; expect(dayCheck('2026-11-21', today, DEFAULT_RULES, facts({ jobs: two })).status).toBe('full'); expect(dayCheck('2026-11-21', today, DEFAULT_RULES, facts({ jobs: [two[0]] })).status).toBe('available');
    expect(dayCheck('2026-11-21', today, DEFAULT_RULES, facts({ vehicles: [], field: [] })).status).toBe('available');   // people and vehicles are not checked unless switched on
  });
  it('with the crew check switched on: also full when people or vehicles run out', () => {
    const R = { ...DEFAULT_RULES, check_resources: true, max_jobs_per_day: 3 };
    const three = [job('2026-11-21', ['e0', 'e1']), job('2026-11-21', ['e2', 'e3'], 'v2'), job('2026-11-21', ['e4', 'e5'], 'v1')]; expect(dayCheck('2026-11-21', today, R, facts({ jobs: three })).status).toBe('full');
    expect(dayCheck('2026-11-21', today, R, facts({ field: people(8), jobs: [job('2026-11-21', ['e0', 'e1', 'e2', 'e3', 'e4', 'e5'], 'v1')] })).status).toBe('full');   // only 2 people left
    expect(dayCheck('2026-11-21', today, R, facts({ jobs: [job('2026-11-20', ['e0', 'e1'], 'v1', '2026-11-23')], field: people(3) })).status).toBe('full');   // the leader is busy on the 3-day job
    expect(dayCheck('2026-11-21', today, R, facts({ jobs: [job('2026-11-21', ['e1'], 'v1'), job('2026-11-21', ['e2'], 'v2')] })).status).toBe('full');   // no vehicle left
  });
  it('a cancelled or finished job does not block the day', () => expect(dayCheck('2026-11-21', today, { ...DEFAULT_RULES, check_resources: true }, facts({ jobs: [{ ...job('2026-11-21', ['e0', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6']), status: 'Cancelled' }] })).status).toBe('available'));
});

describe('the reply', () => {
  const full = facts({ jobs: [job('2026-11-21', ['e0', 'e1']), job('2026-11-21', ['e2', 'e3'], 'v2'), job('2026-11-21', ['e4', 'e5'])] });
  it('says what was booked, and nothing about the price', () => { const b = bookedReply('Sat, 21 Nov', 'JOB-2026-0007'); expect(b.reply_en).toContain('JOB-2026-0007'); expect(b.reply_en).toMatch(/final price after verifying/); expect(b.reply_en).not.toMatch(/₱|\d,\d{3}/); });
  it('confirms nothing, only says the day looks open', () => { const r = checkAvailability('2026-11-21', today, DEFAULT_RULES, facts()); expect(r.ok).toBe(true); expect(r.reply_en).toMatch(/review your details and confirm/); expect(r.alternatives).toHaveLength(0); });
  it('offers the nearest open days, in date order, when the day is full', () => {
    const r = checkAvailability('2026-11-21', today, DEFAULT_RULES, full); expect(r.status).toBe('full'); expect(r.alternatives.map((a) => a.date)).toEqual(['2026-11-19', '2026-11-20', '2026-11-23']);
    expect(r.reply_en).toContain('fully booked'); expect(r.reply_tl).toContain('puno'); expect(r.reply_en).toContain('Which one suits you');
  });
  it('never offers a closed, too-soon or full day as an alternative', () => {
    const r = checkAvailability('2026-11-21', today, { ...DEFAULT_RULES, alternatives: 5 }, full); for (const a of r.alternatives) { expect(dayCheck(a.date, today, DEFAULT_RULES, full).status).toBe('available'); expect(a.date).not.toBe('2026-11-22'); }
  });
  it('asks for another date when nothing is free', () => { const r = checkAvailability('2026-11-21', today, { ...DEFAULT_RULES, check_resources: true }, facts({ vehicles: [] })); expect(r.alternatives).toHaveLength(0); expect(r.reply_en).toContain('another date'); });
});

describe('rules from the settings', () => {
  it('uses the defaults and keeps odd values inside a safe range', () => {
    expect(normalizeRules(undefined)).toEqual(DEFAULT_RULES); expect(normalizeRules({ lead_days: -5, max_jobs_per_day: 999, closed_weekdays: [0, 6, 9, 'x'], alternatives: 'abc', auto_confirm: 'yes' })).toEqual({ ...DEFAULT_RULES, lead_days: 0, max_jobs_per_day: 20, closed_weekdays: [0, 6] });   // only a real true switches automatic confirmation on
    expect(normalizeRules({ auto_confirm: true, check_resources: true })).toMatchObject({ auto_confirm: true, check_resources: true });
  });
});

describe('Taglish', () => {
  const full = facts({ jobs: [job('2026-11-21', ['e0']), job('2026-11-21', ['e1'], 'v2')] });
  it('picks the language of the customer', () => { expect([parseLang('Taglish'), parseLang('tagalog'), parseLang('FIL'), parseLang('english'), parseLang(undefined), parseLang('tglish')]).toEqual(['taglish', 'tl', 'tl', 'en', 'en', 'taglish']); });
  it('answers a full date and an open date in Taglish with the same dates', () => {
    const r = checkAvailability('2026-11-21', today, DEFAULT_RULES, full); expect(pick(r, 'taglish')).toContain(`Sorry po, puno na po kami sa ${r.requested_label}.`); expect(pick(r, 'taglish')).toContain('Alin po ang okay sa inyo?'); for (const a of r.alternatives) expect(pick(r, 'taglish')).toContain(a.label);
    expect(pick(checkAvailability('2026-11-21', today, DEFAULT_RULES, facts()), 'taglish')).toMatch(/Mukhang open po/); expect(pick(checkAvailability(null, today, DEFAULT_RULES, facts()), 'taglish')).toMatch(/Anong date po/);
  });
  it('the booked message is Taglish, carries the Job Order link only when given, and no price', () => {
    const b = bookedReply('Sat, 21 Nov', 'JOB-2026-0007'); expect(b.reply_tglish).toContain('Noted po! Naka-book na po kayo sa Sat, 21 Nov (ref JOB-2026-0007)'); expect(b.reply_tglish).not.toContain('http');
    const c = bookedReply('Sat, 21 Nov', 'JOB-2026-0007', 'https://x/#/jo/abc'); expect(c.reply_tglish).toContain('Ito po ang Job Order ninyo, kasama ang rates namin: https://x/#/jo/abc'); expect(c.reply_en).toContain('Job Order with our rates'); expect(c.reply_tglish).not.toMatch(/₱/);
  });
});
