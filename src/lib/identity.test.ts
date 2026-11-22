import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { JOB_STATUS_CLASS, OPEN_JOB_STATUSES, activeJobs, asksCrewStatus, claimsCrewStatus, crewStatusBacked, clientsByReference, jobOrderTokensIn, openJobs, clientsByMobile, contradictsBooking, datesIn, decideIdentity, existingBookingReply, isPreviousReference, jobNumbersIn, normMobile, phonesIn, type Candidate, type IdentityInput, type JobLine } from '../../supabase/functions/_shared/identity';

const AI_START = '2026-11-17T00:00:00Z';
const base: IdentityInput = { stored: {}, phoneMatches: [], typedMatches: [], aiStartedOn: AI_START };
const cruz: Candidate = { client_id: 'c-cruz', name: 'Maria Cruz', basis: 'contact_mobile' };
const cruz2: Candidate = { client_id: 'c-cruz2', name: 'Maria Cruz', basis: 'contact_mobile' };   // a different client with the SAME name
const nov30: JobLine = { number: 'JOB-2026-8818', date: '2026-11-30', time: '09:00', status: 'Confirmed', services: ['exterior glass'] };
const dec5: JobLine = { number: 'JOB-2026-8820', date: '2026-12-05', time: '13:30', status: 'Pending', services: ['roof'] };

/** A stand-in for the database client: every query step returns itself and ends with the rows given for that table. */
const fakeSb = (tables: Record<string, unknown[]>, rpcRows?: unknown[]) => ({
  from: (t: string) => { const q: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'is', 'in', 'not', 'gte', 'order', 'limit']) q[m] = () => q; q.then = (ok: (v: unknown) => unknown) => ok({ data: tables[t] ?? [] }); return q; },
  rpc: () => (rpcRows ? { data: rpcRows, error: null } : { data: null, error: { message: 'function does not exist' } }),
});

/** A fake that really applies eq / is / in / gte / order / limit, like the database does (the plain fakeSb above ignores them). */
const filteringSb = (tables: Record<string, Record<string, unknown>[]>) => ({
  from: (t: string) => {
    let rows = [...(tables[t] ?? [])]; let lim = Infinity; const q: Record<string, unknown> = {};
    q.select = () => q; q.eq = (k: string, v: unknown) => { rows = rows.filter((r) => r[k] === v); return q; }; q.is = (k: string, v: unknown) => { rows = rows.filter((r) => (v === null ? r[k] == null : r[k] === v)); return q; };
    q.in = (k: string, a: unknown[]) => { rows = rows.filter((r) => a.includes(r[k])); return q; }; q.gte = (k: string, v: string) => { rows = rows.filter((r) => String(r[k]) >= v); return q; };
    q.order = (k: string, o: { ascending?: boolean } = {}) => { rows.sort((a, b) => String(a[k]).localeCompare(String(b[k])) * (o.ascending === false ? -1 : 1)); return q; }; q.limit = (n: number) => { lim = n; return q; };
    q.then = (ok: (v: unknown) => unknown) => ok({ data: rows.slice(0, lim) }); return q;
  },
  rpc: () => ({ data: [], error: null }),
});

describe('mobile numbers and references', () => {
  it('reduces Philippine mobile numbers to the same 10 digits whatever the format', () => {
    for (const f of ['0917 123 4567', '+63 917 123 4567', '63917-123-4567', '09171234567', '917 123 4567']) expect(normMobile(f)).toBe('9171234567');
    expect(normMobile('12345')).toBeUndefined(); expect(normMobile('02-8123-4567')).toBeUndefined(); expect(normMobile('')).toBeUndefined();
  });
  it('finds numbers and job numbers a customer writes', () => {
    expect(phonesIn('my number is 0917 555 1212, thanks')).toEqual(['9175551212']); expect(phonesIn('call +63 918-555-0000 or 0917 555 1212').sort()).toEqual(['9175551212', '9185550000']);
    expect(jobNumbersIn('My job order is job-2026-8818 and JO-2026-83589')).toEqual(['JOB-2026-8818', 'JO-2026-83589']);
  });
  it('reads dates written in a message', () => {
    expect(datesIn('We are scheduled November 30', '2026-11-22')).toEqual(['2026-11-30']); expect(datesIn('nov. 30 po', '2026-11-22')).toEqual(['2026-11-30']);
    expect(datesIn('30 Nov', '2026-11-22')).toEqual(['2026-11-30']); expect(datesIn('11/30', '2026-11-22')).toEqual(['2026-11-30']); expect(datesIn('January 5', '2026-11-22')).toEqual(['2027-01-05']);
  });
  it('spots references to an earlier chat, a booking or a job order (English and Tagalog)', () => {
    for (const t of ['We talked yesterday.', 'I already booked.', 'May job order na po ako.', 'As discussed with your staff.', 'Follow-up lang po.', 'Reminder lang po.', 'We are scheduled November 30.', 'my job order JOB-2026-8818', 'nag-book na po ako']) expect(isPreviousReference(t), t).toBe(true);
    for (const t of ['How much is window cleaning in Makati?', 'Do you clean roofs?', 'We use deionized water', 'Can I schedule tomorrow?']) expect(isPreviousReference(t), t).toBe(false);
  });
});

describe('V2.3 identity: the ten required cases', () => {
  it('1 · messaged before the AI was installed → PREVIOUS contact, not an existing client, no records shown', () => {
    const r = decideIdentity({ ...base, convCreatedAt: '2026-10-02T00:00:00Z' });
    expect(r.status).toBe('previous'); expect(r.client_id).toBeUndefined(); expect(r.reasons.join(' ')).toMatch(/before the AI chat was switched on/);
  });
  it('2 · old Messenger chats but no service history → previous, never existing', () => {
    const r = decideIdentity({ ...base, subscribedAt: '2026-06-10T00:00:00Z', lastInteraction: '2026-09-01T00:00:00Z' });
    expect(r.status).toBe('previous'); expect(r.client_id).toBeUndefined(); expect(r.state).toBeUndefined();
  });
  it('3 · a manually created job order: the contact\'s mobile only SUGGESTS the client (staff confirm); once staff link it, the job is found from the client record', async () => {
    const r = decideIdentity({ ...base, phoneMatches: [cruz] });
    expect(r.status).toBe('previous'); expect(r.client_id).toBeUndefined(); expect(r.state).toBe('suggested'); expect(r.candidates).toEqual([cruz]); expect(r.reasons.join(' ')).toMatch(/staff must confirm before booking details are shared/);
    const linked = decideIdentity({ ...base, stored: { client_id: 'c-cruz', link_state: 'staff' }, phoneMatches: [cruz] });
    expect(linked).toMatchObject({ status: 'existing', client_id: 'c-cruz', state: 'staff' });
    const jobs = await activeJobs(fakeSb({ jobs: [{ number: 'JOB-2026-8818', start_at: '2026-11-30T09:00:00', end_at: '2026-11-30T12:00:00', status: 'Confirmed', service_codes: ['GLASS_EXT'], site_id: 's1' }], sites: [{ id: 's1', name: 'Cruz residence' }] }), 'c-cruz', '2026-11-22');
    expect(jobs).toMatchObject([{ number: 'JOB-2026-8818', date: '2026-11-30', time: '09:00', status: 'Confirmed', services: ['exterior glass'], site: 'Cruz residence' }]);
  });
  it('4 · the customer\'s phone number is missing → no link; a name alone never links anyone', () => {
    const r = decideIdentity({ ...base, convCreatedAt: '2026-11-20T00:00:00Z' });          // nothing but a name (names are not even an input)
    expect(r.status).toBe('new'); expect(r.client_id).toBeUndefined(); expect(r.candidates).toEqual([]);
  });
  it('5 · the client record is NEWER than the contact: dates play no part; the phone suggests, the staff link makes it existing', () => {
    const sug = decideIdentity({ ...base, convCreatedAt: '2026-11-18T00:00:00Z', subscribedAt: '2026-05-01T00:00:00Z', phoneMatches: [cruz] });   // the matcher takes no client dates at all
    expect(sug.status).toBe('previous'); expect(sug.candidates[0].client_id).toBe('c-cruz');
    expect(decideIdentity({ ...base, convCreatedAt: '2026-11-18T00:00:00Z', stored: { client_id: 'c-cruz', link_state: 'staff' } }).status).toBe('existing');
  });
  it('6 · a returning customer asks about their November 30 booking → answered from THEIR job; "fully booked" is a contradiction; no booking form', () => {
    const text = 'Hi, are we still scheduled for November 30?';
    expect(isPreviousReference(text)).toBe(true);
    expect(existingBookingReply([nov30, dec5], datesIn(text, '2026-11-22'))).toMatch(/Yes po, your booking JOB-2026-8818 is set for Monday, Nov 30 at 9:00 AM \(confirmed\)/);
    expect(contradictsBooking('Sorry po, November 30 is fully booked. Nearest dates are Dec 1.', text, [nov30], '2026-11-22')).toMatch(/own booking JOB-2026-8818/);
    expect(contradictsBooking('Please copy this and fill in your details po: Name:', text, [nov30], '2026-11-22')).toMatch(/booking form/);
    expect(contradictsBooking('Yes po, your booking JOB-2026-8818 is set for Monday, Nov 30 at 9:00 AM.', text, [nov30], '2026-11-22')).toBeUndefined();
  });
  it('7 · a customer reminding us about a high ceiling is a previous-conversation message, not a new inquiry', () => {
    const text = 'Reminder lang po, mataas po ang ceiling namin. We are scheduled November 30.';
    expect(isPreviousReference(text)).toBe(true);
    expect(contradictsBooking('Please copy this and fill in your details po:\nName:', text, [nov30], '2026-11-22')).toBeTruthy();
  });
  it('8 · identical names: the right client is SUGGESTED by mobile; the same mobile on two clients is ambiguous; a name never decides', () => {
    const one = decideIdentity({ ...base, phoneMatches: [cruz] });                                // two Maria Cruz clients exist, only one has this mobile
    expect(one.client_id).toBeUndefined(); expect(one.candidates.map((c) => c.client_id)).toEqual(['c-cruz']);
    const amb = decideIdentity({ ...base, phoneMatches: [cruz, cruz2] });
    expect(amb.status).toBe('previous'); expect(amb.state).toBe('ambiguous'); expect(amb.client_id).toBeUndefined(); expect(amb.candidates.map((c) => c.client_id)).toEqual(['c-cruz', 'c-cruz2']);
    expect(decideIdentity({ ...base }).client_id).toBeUndefined();                               // same name, no number: nothing to match on
  });
  it('9 · a customer with several bookings: all active jobs are listed and the asked date picks the right one', () => {
    const r = existingBookingReply([nov30, dec5]);
    expect(r).toMatch(/2 bookings/); expect(r).toMatch(/JOB-2026-8818/); expect(r).toMatch(/JOB-2026-8820/); expect(r).toMatch(/Which one/);
    expect(existingBookingReply([nov30, dec5], ['2026-12-05'])).toMatch(/JOB-2026-8820 is set for Saturday, Dec 5 at 1:30 PM/);
  });
  it('10 · a brand-new customer with no prior record → NEW', () => {
    expect(decideIdentity({ ...base, convCreatedAt: '2026-11-22T01:00:00Z', subscribedAt: '2026-11-22T01:00:00Z' })).toMatchObject({ status: 'new', candidates: [], reasons: [] });
  });
});

describe('V2.3 identity: safety rules', () => {
  it('a number the customer TYPED is only a suggestion for staff: never an existing-client link', () => {
    const r = decideIdentity({ ...base, typedMatches: [{ ...cruz, basis: 'typed_mobile' }] });
    expect(r.status).toBe('previous'); expect(r.state).toBe('suggested'); expect(r.client_id).toBeUndefined(); expect(r.candidates).toHaveLength(1);
  });
  it('a stored link (the system or staff) wins and stays; a staff link is shown as staff', () => {
    expect(decideIdentity({ ...base, stored: { client_id: 'c-1', link_state: 'staff' }, phoneMatches: [cruz] })).toMatchObject({ status: 'existing', client_id: 'c-1', state: 'staff' });
    expect(decideIdentity({ ...base, stored: { client_id: 'c-1', link_state: 'verified', link_basis: 'chat_booking' } })).toMatchObject({ status: 'existing', client_id: 'c-1', basis: 'chat_booking' });   // a client CREATED by this chat's own booking
    expect(decideIdentity({ ...base, stored: { client_id: 'c-1' } }).status).not.toBe('existing');   // a bare client_id may come from a number a stranger typed into a booking
    expect(decideIdentity({ ...base, stored: { client_id: 'c-1', link_state: 'ambiguous' } }).status).not.toBe('existing');                                  // an unresolved link is not a link
  });
  it('staff marks and ManyChat tags make a PREVIOUS contact, never an existing client', () => {
    expect(decideIdentity({ ...base, stored: { staff_returning: true } }).status).toBe('previous');
    expect(decideIdentity({ ...base, tags: [{ name: 'Existing customer' }] }).status).toBe('previous');
    expect(decideIdentity({ ...base, tags: [{ name: 'New lead' }] }).status).toBe('new');
    expect(decideIdentity({ ...base, priorStaffReply: true }).status).toBe('previous');
  });
  it('finds clients by mobile whatever the stored format, with or without the database function', async () => {
    expect(await clientsByMobile(fakeSb({}, [{ id: 'c1', name: 'Ana' }]), '+63 917 123 4567', 'mobile')).toEqual([{ client_id: 'c1', name: 'Ana', basis: 'mobile' }]);
    const sb = fakeSb({ clients: [{ id: 'c1', name: 'Ana', mobile: '0917-123-4567' }, { id: 'c2', name: 'Ben', mobile: '0918 111 2222' }] });   // function missing → scan
    expect((await clientsByMobile(sb, '09171234567', 'mobile')).map((c) => c.client_id)).toEqual(['c1']); expect(await clientsByMobile(sb, 'no number', 'mobile')).toEqual([]);
  });
});

describe('V2.3 review fixes', () => {
  it('a phone number held by ManyChat is NEVER proof of ownership: it can only suggest a client', () => {
    for (const phoneMatches of [[cruz], [cruz, cruz2]]) { const r = decideIdentity({ ...base, phoneMatches, tags: [{ name: 'Existing customer' }], subscribedAt: '2026-01-01T00:00:00Z' }); expect(r.status).toBe('previous'); expect(r.client_id).toBeUndefined(); expect(['suggested', 'ambiguous']).toContain(r.state); }
  });
  it('only a link made by staff, or by the system for a client this chat created, makes an existing client', () => {
    expect(decideIdentity({ ...base, stored: { client_id: 'c-1', link_state: 'verified', link_basis: 'chat_booking' } }).status).toBe('existing');
    expect(decideIdentity({ ...base, stored: { client_id: 'c-1', link_state: 'staff' } }).status).toBe('existing');
    for (const link_state of [null, undefined, 'suggested', 'ambiguous']) expect(decideIdentity({ ...base, stored: { client_id: 'c-1', link_state } }).status).not.toBe('existing');
  });
  it('AUDIT: every job status in the database and in the app is classified (a new status cannot be forgotten)', () => {
    const migration = fs.readFileSync('supabase/migrations/0004_job_workflow_and_incidents.sql', 'utf8');
    const dbList = /jobs_status_check check \(status in \(([^)]*)\)/.exec(migration)![1].match(/'([^']+)'/g)!.map((x) => x.replace(/'/g, ''));
    const types = fs.readFileSync('src/lib/types.ts', 'utf8'); const union = /export type JobStatus =([^;]*);/.exec(types)![1];
    const appList = [...union.replace(/\/\/[^\n]*/g, '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(dbList.length).toBe(13); expect(new Set(dbList)).toEqual(new Set(appList));
    expect(new Set(Object.keys(JOB_STATUS_CLASS))).toEqual(new Set(dbList));
    expect([...OPEN_JOB_STATUSES].sort()).toEqual(['Arrived at HQ', 'Confirmed', 'Dispatch Checklist Pending', 'Dispatched', 'In Progress', 'Leaving Site', 'On Site', 'Pending', 'Work Completed']);
  });
  it('every current booking is recognised, whatever its status; finished, closed, cancelled or stale ones are not', async () => {
    const row = (number: string, status: string, start: string, end = start) => ({ number, start_at: `${start}T09:00:00`, end_at: `${end}T12:00:00`, status, service_codes: ['GLASS_EXT'], site_id: 's1' });
    const rows = [row('J-PENDING', 'Pending', '2026-11-30'), row('J-CONFIRMED', 'Confirmed', '2026-12-01'), row('J-DCP', 'Dispatch Checklist Pending', '2026-11-23'), row('J-DISPATCHED', 'Dispatched', '2026-11-22'), row('J-ONSITE', 'On Site', '2026-11-22'), row('J-INPROG', 'In Progress', '2026-11-20', '2026-11-23'),
      row('J-WORKDONE', 'Work Completed', '2026-11-21'), row('J-LEAVING', 'Leaving Site', '2026-11-21'), row('J-HQ', 'Arrived at HQ', '2026-11-20'),
      row('X-CLOSED', 'Closed', '2026-11-30'), row('X-COMPLETED', 'Completed', '2026-11-30'), row('X-CANCELLED', 'Cancelled', '2026-11-30'), row('X-RESCHEDULED', 'Rescheduled', '2026-11-30'),
      row('X-STALE-PENDING', 'Pending', '2026-09-01'), row('X-STALE-DONE', 'Work Completed', '2026-10-01')];
    const jobs = await activeJobs(fakeSb({ jobs: rows, sites: [{ id: 's1', name: 'Site' }] }), 'c1', '2026-11-22');
    expect(jobs.map((j) => j.number).sort()).toEqual(['J-CONFIRMED', 'J-DCP', 'J-DISPATCHED', 'J-HQ', 'J-INPROG', 'J-LEAVING', 'J-ONSITE', 'J-PENDING', 'J-WORKDONE']);
  });
  it('a booking in a dispatch status is described in plain words, never the internal status name', () => {
    expect(existingBookingReply([{ number: 'JOB-1', date: '2026-11-30', time: '09:00', status: 'Dispatch Checklist Pending', services: [] }])).toMatch(/\(being prepared\)/);
    expect(existingBookingReply([{ number: 'JOB-1', date: '2026-11-22', time: '09:00', status: 'On Site', services: [] }])).toMatch(/the crew is on site/);
  });
});

describe('V2.3 final review: a date that is not theirs is never confirmed', () => {
  const nov30 = '2026-11-30';
  it('the customer asks about November 30 but their ONLY verified booking is on December 5: the answer says it does not see November 30 and gives December 5; it never says yes', () => {
    const r = existingBookingReply([dec5], [nov30]);
    expect(r).toMatch(/I don't see a booking on Monday, Nov 30 on your record/); expect(r).toMatch(/JOB-2026-8820 is set for Saturday, Dec 5/); expect(r).toMatch(/check if you meant a different date/);
    expect(r).not.toMatch(/\bYes\b/); expect(r).not.toMatch(/Nov 30 at/);
    const two = existingBookingReply([nov30job(), dec5], ['2026-12-20']); expect(two).toMatch(/don't see a booking on/); expect(two).not.toMatch(/^Yes/);
  });
  const nov30job = (): JobLine => ({ number: 'JOB-2026-1111', date: '2026-12-01', time: '09:00', status: 'Confirmed', services: [] });
  it('a model reply that CONFIRMS November 30 for that customer is caught (yes, confirmed, scheduled, set for)', () => {
    const q = 'Hi po, are we still scheduled for November 30?';
    for (const bad of ['Yes po, you are scheduled for November 30.', 'Confirmed po, see you on November 30!', 'Your booking JOB-2026-8820 is set for November 30 at 9:00 AM.', "Yes, that's right po."]) expect(contradictsBooking(bad, q, [dec5], '2026-11-22'), bad).toMatch(/confirms 2026-11-30, which is NOT one of this customer's bookings/);
  });
  it('a model reply that calls November 30 full is also caught when they ask about THEIR booking; the honest answers pass', () => {
    const q = 'We are scheduled November 30, right?';
    expect(contradictsBooking('Sorry po, November 30 is fully booked.', q, [dec5], '2026-11-22')).toMatch(/calls 2026-11-30 full or unavailable/);
    for (const good of ["I don't see a booking on November 30 on your record po. Your booking JOB-2026-8820 is set for Saturday, Dec 5.", 'Our team will check your booking for November 30 po.', existingBookingReply([dec5], ['2026-11-30'])]) expect(contradictsBooking(good, q, [dec5], '2026-11-22'), good).toBeUndefined();
  });
  it('a plain availability question about a new date is not treated as a booking claim, and an unconfirmed possible client is never described', () => {
    expect(contradictsBooking('Yes, that date is open po.', 'Is November 30 open for window cleaning?', [dec5], '2026-11-22')).toBeUndefined();
    expect(contradictsBooking('Yes po, you are scheduled for November 30.', 'We are scheduled November 30', [dec5], '2026-11-22', false)).toBeUndefined();
  });
});

describe('V2.3 reliability: a database failure is never read as "no match" or "no bookings" (fail closed)', () => {
  const broken = (tables: string[], rpcFails = true) => ({
    from: (t: string) => { const q: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'is', 'in', 'not', 'gte', 'order', 'limit']) q[m] = () => q; q.then = (ok: (v: unknown) => unknown) => ok(tables.includes(t) ? { data: null, error: { message: `boom ${t}` } } : { data: [] }); return q; },
    rpc: () => ({ data: null, error: { message: rpcFails ? 'function does not exist' : 'ok' } }),
  });
  it('the client lookup throws when both the database function and the fallback scan fail', async () => { await expect(clientsByMobile(broken(['clients']), '0917 555 1212', 'contact_mobile')).rejects.toThrow(/client lookup failed/); });
  it('the booking lookup throws instead of answering "no bookings"', async () => { await expect(activeJobs(broken(['jobs']), 'c1', '2026-11-22')).rejects.toThrow(/bookings lookup failed/); });
  it('a customer who simply has no match still gets an empty list (no error)', async () => { expect(await clientsByMobile(broken([]), '0917 555 1212', 'contact_mobile')).toEqual([]); expect(await activeJobs(broken([]), 'c1', '2026-11-22')).toEqual([]); });
});

/* ---------------- ISSUE 1: stale operational statuses ---------------- */
describe('V2.3 stale statuses: an old "Dispatched / On Site / In Progress" can never make the AI say a crew is on the way', () => {
  const NOW = '2026-11-22T15:00';
  const job = (number: string, status: string, start: string, end: string) => ({ number, start_at: `${start}:00`, end_at: `${end}:00`, status, service_codes: ['GLASS_EXT'], site_id: 's1' });
  const world = (rows: ReturnType<typeof job>[]) => fakeSb({ jobs: rows, sites: [{ id: 's1', name: 'Site' }] });
  it('Dispatched and On Site jobs 14+ days old are STALE, not live (this is what the production data contains)', async () => {
    const r = await openJobs(world([job('J-OLD-DISP', 'Dispatched', '2026-11-05T09:00', '2026-11-05T12:00'), job('J-OLD-SITE', 'On Site', '2026-11-04T09:00', '2026-11-04T12:00'), job('J-OLD-PROG', 'In Progress', '2026-10-20T09:00', '2026-10-20T12:00')]), 'c1', NOW);
    expect(r.live).toEqual([]); expect(r.stale.map((j) => j.number).sort()).toEqual(['J-OLD-DISP', 'J-OLD-PROG', 'J-OLD-SITE']);
  });
  it('a job that ended yesterday and was never closed is stale as well (a day and a half is beyond the grace)', async () => {
    const r = await openJobs(world([job('J-YEST', 'On Site', '2026-11-21T09:00', '2026-11-21T12:00')]), 'c1', NOW); expect(r.live).toEqual([]); expect(r.stale.map((j) => j.number)).toEqual(['J-YEST']);
  });
  it('legitimate jobs stay live: one that is running now, one that ran late, an OVERNIGHT job and a MULTI-DAY job', async () => {
    const r = await openJobs(world([
      job('J-NOW', 'On Site', '2026-11-22T09:00', '2026-11-22T17:00'),              // running now
      job('J-LATE', 'In Progress', '2026-11-22T06:00', '2026-11-22T14:00'),         // should have ended an hour ago: inside the grace
      job('J-NIGHT', 'In Progress', '2026-11-21T21:00', '2026-11-23T06:00'),        // overnight, ends tomorrow morning
      job('J-MULTI', 'In Progress', '2026-11-19T08:00', '2026-11-24T17:00'),        // a five-day project
      job('J-OTW', 'Dispatched', '2026-11-22T08:00', '2026-11-22T11:00'),           // ended four hours ago: still inside the grace
    ]), 'c1', NOW);
    expect(r.live.map((j) => j.number).sort()).toEqual(['J-LATE', 'J-MULTI', 'J-NIGHT', 'J-NOW', 'J-OTW']); expect(r.stale).toEqual([]);
  });
  it('the grace is exactly 12 hours after the job ends', async () => {
    const mk = (end: string) => world([job('J-X', 'On Site', '2026-11-22T00:00', end)]);
    expect((await openJobs(mk('2026-11-22T03:00'), 'c1', NOW)).live).toHaveLength(1);      // ended exactly 12 hours ago
    expect((await openJobs(mk('2026-11-22T02:59'), 'c1', NOW)).live).toHaveLength(0);      // one minute more
  });
  it('upcoming and finished-but-open statuses follow their own windows; past Pending/Confirmed and week-old Work Completed are stale', async () => {
    const r = await openJobs(world([job('J-FUT', 'Confirmed', '2026-12-01T09:00', '2026-12-01T12:00'), job('J-TODAY', 'Pending', '2026-11-22T16:00', '2026-11-22T18:00'), job('J-PASTCONF', 'Confirmed', '2026-11-10T09:00', '2026-11-10T12:00'), job('J-DONE3', 'Work Completed', '2026-11-19T09:00', '2026-11-19T12:00'), job('J-DONE20', 'Work Completed', '2026-11-02T09:00', '2026-11-02T12:00'), job('X-CLOSED', 'Closed', '2026-11-02T09:00', '2026-11-02T12:00')]), 'c1', NOW);
    expect(r.live.map((j) => j.number).sort()).toEqual(['J-DONE3', 'J-FUT', 'J-TODAY']); expect(r.stale.map((j) => j.number).sort()).toEqual(['J-DONE20', 'J-PASTCONF']);   // a Closed job is neither
  });
  it('activeJobs returns only the live ones; the old date-only call still works', async () => {
    const w = world([job('J-OLD', 'Dispatched', '2026-11-05T09:00', '2026-11-05T12:00'), job('J-NOW', 'On Site', '2026-11-22T09:00', '2026-11-22T17:00')]);
    expect((await activeJobs(w, 'c1', NOW)).map((j) => j.number)).toEqual(['J-NOW']); expect((await activeJobs(w, 'c1', '2026-11-22')).map((j) => j.number)).toEqual(['J-NOW']);
  });
  it('the customer asking where the crew is, and a reply claiming it, are recognised (and ordinary replies are not)', () => {
    for (const q of ['Is the crew on the way?', 'Nandyan na ba ang team?', 'asan na po kayo', 'Are you here already?', 'Is the team on site?']) expect(asksCrewStatus(q), q).toBe(true);
    for (const q of ['How much is window cleaning?', 'What do you use for glass?']) expect(asksCrewStatus(q), q).toBe(false);
    for (const r of ['The crew is on the way po.', 'Our team is currently on site.', 'The crew are working on your windows now.', 'They are on their way po.']) expect(claimsCrewStatus(r), r).toBe(true);
    for (const r of ['We usually deploy 3–5 professional cleaning crew per service po.', 'Our team will confirm the final bill on site.', 'The crew will arrive at 9:00 AM on Monday.', 'We bring our own cleaning equipment po.']) expect(claimsCrewStatus(r), r).toBe(false);
  });
});

/* ---------------- ISSUE 2: TopMop job-order links ---------------- */
describe('V2.3 job-order links: recognised as an existing-booking reference; they locate a possible job for staff and never verify anyone', () => {
  const TOKEN = '0123456789abcdef0123456789abcdef';
  it('finds the token in a pasted TopMop link (with or without the scheme, in a sentence, with punctuation)', () => {
    for (const t of [`https://ops.topmop.ph/#/jo/${TOKEN}`, `see https://ops.topmop.ph/#/jo/${TOKEN}.`, `ops.topmop.ph/#/jo/${TOKEN}`, `HTTPS://OPS.TOPMOP.PH/#/jo/${TOKEN}?x=1`, `Job order: (https://ops.topmop.ph/#/jo/${TOKEN})`]) expect(jobOrderTokensIn(t), t).toEqual([TOKEN]);
  });
  it('ignores every other address, look-alike hosts, short tokens and other TopMop paths', () => {
    for (const t of [`https://evil.example/#/jo/${TOKEN}`, `https://ops.topmop.ph.evil.example/#/jo/${TOKEN}`, `https://notops.topmop.ph/#/jo/${TOKEN}`, 'https://ops.topmop.ph/#/jo/short', `https://ops.topmop.ph/#/jobs/${TOKEN}`, `https://ops.topmop.ph/#/quote/${TOKEN}`, 'no link here']) expect(jobOrderTokensIn(t), t).toEqual([]);
  });
  it('a pasted TopMop job-order link is an existing-booking reference (a look-alike address is not)', () => {
    expect(isPreviousReference(`Hello, this is my job order https://ops.topmop.ph/#/jo/${TOKEN}`)).toBe(true); expect(isPreviousReference(`ops.topmop.ph/#/jo/${TOKEN}`)).toBe(true);
    expect(isPreviousReference(`check https://evil.example/#/jo/${TOKEN}`)).toBe(false); expect(isPreviousReference(`https://ops.topmop.ph.evil.example/#/jo/${TOKEN}`)).toBe(false);
  });
  it('at most three links are read from one message', () => { expect(jobOrderTokensIn(['a', 'b', 'c', 'd'].map((x) => `https://ops.topmop.ph/#/jo/${x.repeat(20)}`).join(' '))).toHaveLength(3); });
  const orderDb = (orders: Record<string, unknown>[], clients: Record<string, unknown>[] = [{ id: 'c-cruz', name: 'Maria Cruz' }], errors: string[] = []) => ({
    from: (t: string) => { const q: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'is', 'in', 'not', 'gte', 'order', 'limit']) q[m] = () => q; q.then = (ok: (v: unknown) => unknown) => ok(errors.includes(t) ? { data: null, error: { message: `boom ${t}` } } : { data: t === 'job_orders' ? orders : t === 'clients' ? clients : [] }); return q; }, rpc: () => ({ data: [], error: null }),
  });
  it('a job-order link (or JO number) locates the client as a SUGGESTION with its basis and the order number for staff', async () => {
    const r = await clientsByReference(orderDb([{ client_id: 'c-cruz', job_id: 'j1', number: 'JO-2026-83589' }]), `my job order https://ops.topmop.ph/#/jo/${TOKEN}`);
    expect(r).toEqual([{ client_id: 'c-cruz', name: 'Maria Cruz', basis: 'job_order_link', detail: 'JO-2026-83589' }]);
    const n = await clientsByReference(orderDb([{ client_id: 'c-cruz', job_id: 'j1', number: 'JO-2026-83589' }]), 'my job order is JO-2026-83589'); expect(n[0]).toMatchObject({ basis: 'job_order_number', client_id: 'c-cruz' });
  });
  it('POSSESSION OF THE LINK IS NOT IDENTITY: the match becomes a suggestion for staff; the contact stays a previous contact with no client', async () => {
    const found = await clientsByReference(orderDb([{ client_id: 'c-cruz', job_id: 'j1', number: 'JO-2026-83589' }]), `https://ops.topmop.ph/#/jo/${TOKEN}`);
    const r = decideIdentity({ ...base, typedMatches: found });
    expect(r.status).toBe('previous'); expect(r.state).toBe('suggested'); expect(r.client_id).toBeUndefined(); expect(r.candidates[0]).toMatchObject({ client_id: 'c-cruz', basis: 'job_order_link' });
  });
  it('an unknown link finds nothing (the customer is answered the same way, so the chat cannot be used to guess links)', async () => { expect(await clientsByReference(orderDb([]), `https://ops.topmop.ph/#/jo/${TOKEN}`)).toEqual([]); });
  it('a database failure is an error, never "no match"', async () => { await expect(clientsByReference(orderDb([], [], ['job_orders']), `https://ops.topmop.ph/#/jo/${TOKEN}`)).rejects.toThrow(/job order lookup failed/); });
});

/* ---------------- ISSUE #26: future-dated operational jobs, crew status per job, old open jobs crowding the result ---------------- */
describe('V2.3 issue 26.1: an operational status on a job scheduled for a FUTURE day never backs "the crew is on the way"', () => {
  const NOW = '2026-11-22T15:00';
  const job = (number: string, status: string, start: string, end: string) => ({ number, start_at: `${start}:00`, end_at: `${end}:00`, status, service_codes: ['GLASS_EXT'], site_id: 's1' });
  const world = (rows: ReturnType<typeof job>[]) => fakeSb({ jobs: rows, sites: [{ id: 's1', name: 'Site' }] });
  it('Dispatched / On Site / In Progress next week stay bookings but are downgraded to Confirmed and flagged unverified', async () => {
    const r = await openJobs(world([job('J-FUT-D', 'Dispatched', '2026-11-28T09:00', '2026-11-28T12:00'), job('J-FUT-S', 'On Site', '2026-11-23T09:00', '2026-11-23T12:00'), job('J-FUT-P', 'In Progress', '2026-12-05T09:00', '2026-12-05T12:00')]), 'c1', NOW);
    expect(r.live.map((j) => [j.number, j.status, j.statusUnverified])).toEqual([['J-FUT-S', 'Confirmed', true], ['J-FUT-D', 'Confirmed', true], ['J-FUT-P', 'Confirmed', true]]); expect(r.stale).toEqual([]);
    for (const j of r.live) expect(crewStatusBacked([j], 'Is the crew on the way?', '2026-11-22')).toBe(false);
  });
  it('a job starting within three hours may already be "Dispatched"; one starting later than that may not', async () => {
    const r = await openJobs(world([job('J-SOON', 'Dispatched', '2026-11-22T17:30', '2026-11-22T20:00'), job('J-LATER', 'Dispatched', '2026-11-22T18:30', '2026-11-22T21:00')]), 'c1', NOW);
    expect(r.live.find((j) => j.number === 'J-SOON')).toMatchObject({ status: 'Dispatched' }); expect(r.live.find((j) => j.number === 'J-LATER')).toMatchObject({ status: 'Confirmed', statusUnverified: true });
  });
  it('overnight and multi-day jobs are unaffected (they started in the past)', async () => {
    const r = await openJobs(world([job('J-NIGHT', 'In Progress', '2026-11-21T21:00', '2026-11-23T06:00'), job('J-MULTI', 'On Site', '2026-11-19T08:00', '2026-11-24T17:00')]), 'c1', NOW);
    expect(r.live.map((j) => j.status).sort()).toEqual(['In Progress', 'On Site']); expect(r.live.every((j) => !j.statusUnverified)).toBe(true);
  });
});

describe('V2.3 issue 26.2: a crew status is scoped to the job, date and site the customer is talking about', () => {
  const J = (number: string, date: string, status: string, site = 's1', end = date) => ({ number, date, end, time: '09:00', status, services: ['exterior glass'], site });
  const TODAY = '2026-11-22';
  it('one current job running today backs a crew claim', () => { expect(crewStatusBacked([J('JOB-2026-0001', TODAY, 'On Site')], 'Is the crew there?', TODAY)).toBe(true); });
  it('no jobs, or only upcoming jobs, back nothing', () => { expect(crewStatusBacked([], 'Is the crew there?', TODAY)).toBe(false); expect(crewStatusBacked([J('JOB-2026-0002', TODAY, 'Confirmed')], 'Is the crew there?', TODAY)).toBe(false); });
  it('MIXED: Job A is On Site today but Job B (a different day) is only Confirmed; asking about B\'s date is NOT backed by A', () => {
    const jobs = [J('JOB-2026-0001', TODAY, 'On Site'), J('JOB-2026-0002', '2026-11-30', 'Confirmed')];
    expect(crewStatusBacked(jobs, 'Is the crew coming Nov 30?', TODAY)).toBe(false);
    expect(crewStatusBacked(jobs, 'Is the crew there for JOB-2026-0002?', TODAY)).toBe(false);
    expect(crewStatusBacked(jobs, 'Is the crew there for JOB-2026-0001?', TODAY)).toBe(true);
    expect(crewStatusBacked(jobs, 'Is the crew there now?', TODAY)).toBe(true);        // nothing referenced: the job running today
  });
  it('a date or job number that is not one of the live jobs is never backed, even if another job is On Site', () => {
    const jobs = [J('JOB-2026-0001', TODAY, 'On Site')];
    expect(crewStatusBacked(jobs, 'Is the crew there on Dec 3?', TODAY)).toBe(false); expect(crewStatusBacked(jobs, 'status of JOB-2026-9999?', TODAY)).toBe(false);
  });
  it('two current jobs the same day at DIFFERENT sites are ambiguous: nothing is asserted; at the same site it is fine', () => {
    expect(crewStatusBacked([J('JOB-2026-0001', TODAY, 'On Site', 's1'), J('JOB-2026-0003', TODAY, 'Dispatched', 's2')], 'Is the crew there?', TODAY)).toBe(false);
    expect(crewStatusBacked([J('JOB-2026-0001', TODAY, 'On Site', 's1'), J('JOB-2026-0003', TODAY, 'Dispatched', 's1')], 'Is the crew there?', TODAY)).toBe(true);
  });
  it('a current job running today next to a current job of another day: the one running today answers a generic question; its neighbour is never used', () => {
    const jobs = [J('JOB-2026-0001', TODAY, 'On Site'), J('JOB-2026-0005', '2026-11-23', 'In Progress')];
    expect(crewStatusBacked(jobs, 'Is the crew there now?', TODAY)).toBe(true); expect(crewStatusBacked(jobs, 'How about Nov 23, is the crew there?', TODAY)).toBe(true);
    expect(crewStatusBacked([J('JOB-2026-0001', TODAY, 'On Site'), J('JOB-2026-0005', '2026-11-23', 'Confirmed')], 'How about Nov 23, is the crew there?', TODAY)).toBe(false);
  });
  it('a multi-day job answers for any day inside it', () => { expect(crewStatusBacked([J('JOB-2026-0006', '2026-11-20', 'In Progress', 's1', '2026-11-25')], 'Is the crew there?', TODAY)).toBe(true); });
});

describe('V2.3 issue 26.3: old unfinished jobs can never crowd out the valid current or upcoming booking', () => {
  const NOW = '2026-11-22T15:00';
  const mk = (n: string, status: string, start: string, end: string) => ({ number: n, start_at: `${start}:00`, end_at: `${end}:00`, status, service_codes: ['GLASS_EXT'], site_id: 's1', client_id: 'c1', deleted_at: null });
  const old = (n: number) => mk(`J-OLD-${n}`, n % 2 ? 'Dispatched' : 'On Site', `2026-0${1 + (n % 9)}-0${1 + (n % 8)}T09:00`, `2026-0${1 + (n % 9)}-0${1 + (n % 8)}T12:00`);
  it('60 old open jobs plus a valid future job, a running job and a Confirmed job tomorrow: all three valid ones are found', async () => {
    const rows = [...Array.from({ length: 60 }, (_, i) => old(i)), mk('J-FUTURE', 'Confirmed', '2026-12-10T09:00', '2026-12-10T12:00'), mk('J-TOMORROW', 'Pending', '2026-11-23T09:00', '2026-11-23T12:00'), mk('J-RUNNING', 'On Site', '2026-11-22T09:00', '2026-11-22T17:00')];
    const r = await openJobs(filteringSb({ jobs: rows, sites: [{ id: 's1', name: 'Site' }] }), 'c1', NOW);
    expect(r.live.map((j) => j.number).sort()).toEqual(['J-FUTURE', 'J-RUNNING', 'J-TOMORROW']); expect(r.stale.length).toBeGreaterThan(0); expect(r.stale.length).toBeLessThanOrEqual(5);
    expect(r.stale.every((j) => j.number.startsWith('J-OLD-'))).toBe(true);
  });
  it('the live window is applied before the row limit: 45 valid upcoming jobs are all considered (the best ten shown, soonest first)', async () => {
    const rows = Array.from({ length: 45 }, (_, i) => mk(`J-UP-${String(i).padStart(2, '0')}`, 'Confirmed', `2027-01-${String(1 + (i % 28)).padStart(2, '0')}T09:00`, `2027-01-${String(1 + (i % 28)).padStart(2, '0')}T12:00`));
    const r = await openJobs(filteringSb({ jobs: rows, sites: [] }), 'c1', NOW); expect(r.live).toHaveLength(10); expect(r.live[0].date).toBe('2027-01-01');
  });
});
