import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { JOB_STATUS_CLASS, OPEN_JOB_STATUSES, activeJobs, clientsByMobile, contradictsBooking, datesIn, decideIdentity, existingBookingReply, isPreviousReference, jobNumbersIn, normMobile, phonesIn, type Candidate, type IdentityInput, type JobLine } from '../../supabase/functions/_shared/identity';

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
    expect(jobs).toEqual([{ number: 'JOB-2026-8818', date: '2026-11-30', time: '09:00', status: 'Confirmed', services: ['exterior glass'], site: 'Cruz residence' }]);
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
