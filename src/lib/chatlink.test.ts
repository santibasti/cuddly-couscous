import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeExec } from '../../supabase/functions/_shared/chatexec';

// A booking or a saved lead through the chat: when is the chat positively linked to a TopMop client?
const inserts: Record<string, unknown>[] = []; const fetched: string[] = []; let outcome: { text: string; conflict?: boolean; booked?: { ok: boolean; reply: string } } = { text: '' };
/** The linked client A (when the chat has a trusted link) has this mobile on file; the customer types `mobile`. */
const run = async (tool: 'book_date' | 'save_lead', reply: Record<string, unknown>, cur: Record<string, unknown> = {}, jobs: { number: string; date: string; time: string; status: string; services: string[] }[] = [], mobile = '0917 555 1212', dbError = false) => {
  const updates: Record<string, unknown>[] = []; inserts.length = 0; fetched.length = 0;
  const row = (t: string) => (t === 'clients' ? { name: 'Maria Cruz', mobile: '0917 555 1212' } : cur);
  const sb = { from: (t: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => (dbError ? { data: null, error: { message: 'boom' } } : { data: row(t) }) }) }), update: (p: Record<string, unknown>) => { updates.push(p); return { eq: async () => ({ error: null }) }; }, insert: async (r: Record<string, unknown>) => { inserts.push(r); return { error: null }; } }) };
  vi.stubGlobal('fetch', async (u: string) => { fetched.push(String(u)); return new Response(JSON.stringify(reply), { status: 200 }); });
  outcome = await makeExec({ sb, base: 'https://x.invalid', key: 'k', conv: { id: 'conv-1', channel: 'messenger', subscriber_id: 's1' }, lang: 'en', jobs })(tool, { name: 'Maria Cruz', mobile, date: '2026-12-05', address: 'Makati', service: 'window cleaning' });
  return updates;
};
afterEach(() => vi.unstubAllGlobals());

describe('V2.3: a chat is verified as a client only when its own booking CREATED that client', () => {
  it('a booking that created a new client links the chat as verified (chat_booking)', async () => {
    const u = await run('book_date', { ok: true, status: 'confirmed', booked: true, client_id: 'c-new', inquiry_id: 'i1', client_existing: false, reply: 'ok' });
    expect(u[0]).toMatchObject({ client_id: 'c-new', contact_status: 'existing', link_state: 'verified', link_basis: 'chat_booking' });
  });
  it('a booking that matched an EXISTING client by the mobile number the customer typed is only a suggestion for staff', async () => {
    const u = await run('book_date', { ok: true, status: 'confirmed', booked: true, client_id: 'c-old', inquiry_id: 'i1', client_existing: true, reply: 'ok' });
    expect(u[0]).toMatchObject({ contact_status: 'previous', link_state: 'suggested', link_basis: 'typed_mobile' }); expect(u[0].link_state).not.toBe('verified');
    expect(u[0].link_candidates).toEqual([{ client_id: 'c-old', name: 'Maria Cruz', basis: 'typed_mobile' }]);
  });
  it('the same holds for a saved lead (an existing client matched by a typed number)', async () => {
    const u = await run('save_lead', { client_id: 'c-old', inquiry_id: 'i2', existing_client: true });
    expect(u[0]).toMatchObject({ link_state: 'suggested' }); expect(u[0].contact_status).toBe('previous');
  });
  it('a link the system or staff already verified for the same client is kept, never downgraded', async () => {
    const u = await run('book_date', { ok: true, status: 'confirmed', booked: true, client_id: 'c-old', inquiry_id: 'i1', client_existing: true, reply: 'ok' }, { client_id: 'c-old', link_state: 'staff' });
    expect(u[0]).not.toHaveProperty('link_state'); expect(u[0]).not.toHaveProperty('client_id'); expect(u[0]).toMatchObject({ inquiry_id: 'i1', status: 'Lead created' });   // the trusted link is not even rewritten
  });
  it('a customer who already holds a booking on the date cannot book it again; the answer is their own booking', async () => {
    const jobs = [{ number: 'JOB-2026-8818', date: '2026-12-05', time: '09:00', status: 'Confirmed', services: ['exterior glass'] }];
    const out = await (async () => { vi.stubGlobal('fetch', async () => { throw new Error('the booking function must not be called'); }); return makeExec({ sb: {}, base: 'https://x.invalid', key: 'k', conv: { id: 'c', channel: 'messenger', subscriber_id: 's' }, lang: 'en', jobs })('book_date', { date: '2026-12-05', name: 'x', mobile: '09175551212', address: 'Makati', service: 'window' }); })();
    expect(out.text).toMatch(/already_booked/); expect(out.text).toContain('JOB-2026-8818');
  });
});

describe('review finding: a trusted (staff or verified) client link is never overwritten by what a tool returns', () => {
  const staffLinkedToA = { client_id: 'c-A', link_state: 'staff' };
  it('a booking saved for a DIFFERENT client leaves the link untouched, hands the chat to a person and tells staff to reconcile', async () => {
    const u = await run('book_date', { ok: true, status: 'confirmed', booked: true, client_id: 'c-B', inquiry_id: 'i-B', client_existing: true, reply: 'ok' }, staffLinkedToA);
    expect(u.some((x) => 'client_id' in x)).toBe(false);                                       // client_id never written
    expect(u.some((x) => 'link_state' in x || 'link_basis' in x || 'link_candidates' in x || 'contact_status' in x)).toBe(false);   // not downgraded to "suggested"
    expect(u.some((x) => x.inquiry_id === 'i-B')).toBe(false);                                 // the other client's inquiry is NOT attached to this chat
    expect(u.at(-1)).toMatchObject({ status: 'Needs a person' }); expect(String(u.at(-1)!.human_reason)).toMatch(/DIFFERENT client/);
    expect(inserts).toHaveLength(1); expect(inserts[0]).toMatchObject({ title: 'Booking for a different client than the one linked to this chat' }); expect(outcome.conflict).toBe(true);
  });
  it('the same for a saved lead and for a verified (system) link, and a NEW client created for the other mobile does not replace the link either', async () => {
    const lead = await run('save_lead', { client_id: 'c-B', inquiry_id: 'i-B', existing_client: true }, staffLinkedToA); expect(lead.some((x) => 'client_id' in x)).toBe(false);
    const ver = await run('book_date', { ok: true, status: 'confirmed', booked: true, client_id: 'c-C', inquiry_id: 'i-C', client_existing: false, reply: 'ok' }, { client_id: 'c-A', link_state: 'verified' });
    expect(ver.some((x) => 'client_id' in x || 'link_state' in x)).toBe(false); expect(ver.at(-1)).toMatchObject({ status: 'Needs a person' });
  });
  it('the customer is not told anything about the conflict (the tool text for the AI carries no client name)', async () => {
    let text = ''; const sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { client_id: 'c-A', link_state: 'staff', name: 'Secret Name' } }) }) }), update: () => ({ eq: async () => ({ error: null }) }), insert: async () => ({ error: null }) }) };
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ ok: true, status: 'confirmed', booked: true, client_id: 'c-B', inquiry_id: 'i', client_existing: true, reply: 'Your booking is received.' }), { status: 200 }));
    const r = await makeExec({ sb, base: 'https://x.invalid', key: 'k', conv: { id: 'conv-1', channel: 'messenger', subscriber_id: 's1' }, lang: 'en', jobs: [] })('book_date', { name: 'X', mobile: '0917 555 1212', date: '2026-12-05', address: 'Makati', service: 'windows', storeys: '2', property_type: 'Residential', rates_ok: true }); text = r.text;
    expect(text).not.toMatch(/Secret Name|c-A|c-B|DIFFERENT|reconcile/i);
  });
  it('a tool that returns NO client id never clears a trusted link', async () => {
    const u = await run('save_lead', { inquiry_id: 'i-x' }, staffLinkedToA);
    expect(u.some((x) => 'client_id' in x || 'link_state' in x)).toBe(false); expect(u[0]).toMatchObject({ status: 'Lead created' });
  });
  it('an UNTRUSTED chat is unchanged: it still links a client its own booking created, and a typed number only suggests', async () => {
    const created = await run('book_date', { ok: true, status: 'confirmed', booked: true, client_id: 'c-new', inquiry_id: 'i1', client_existing: false, reply: 'ok' }, { client_id: null, link_state: 'suggested' });
    expect(created[0]).toMatchObject({ client_id: 'c-new', link_state: 'verified' });
    const typed = await run('book_date', { ok: true, status: 'confirmed', booked: true, client_id: 'c-old', inquiry_id: 'i1', client_existing: true, reply: 'ok' }, {});
    expect(typed[0]).toMatchObject({ link_state: 'suggested' });
  });
});

describe('review finding 2: a booking for someone else is stopped BEFORE any write, and a conflict after a write never confirms anything', () => {
  const A = { client_id: 'c-A', link_state: 'staff' };
  const BOOKED_B = { ok: true, status: 'confirmed', booked: true, client_id: 'c-B', inquiry_id: 'i-B', client_existing: false, reply: 'Booked! Your job JOB-2026-9999 is confirmed. Job order: https://ops.topmop.ph/#/jo/AbCdEfGhIjKlMnOpQrStUvWxYz012345' };
  it('PRE-CHECK: a staff-linked chat that books with ANOTHER mobile creates nothing: chat-book is never called, staff are told, the tool says only "our team will check"', async () => {
    const u = await run('book_date', BOOKED_B, A, [], '0918 777 3434');
    expect(fetched).toEqual([]);                                                                                      // no call to chat-book: no booking, no client, no inquiry, no job order
    expect(outcome.conflict).toBe(true); expect(outcome.booked).toBeUndefined(); expect(outcome.text).not.toMatch(/JOB-2026-9999|ops\.topmop|booked!|Maria Cruz/i);
    expect(u.at(-1)).toMatchObject({ status: 'Needs a person' }); expect(inserts[0]).toMatchObject({ title: 'Booking for a different client than the one linked to this chat' });
  });
  it('the same for a lead: lead-intake is never called for another person\'s number', async () => {
    await run('save_lead', { client_id: 'c-B', inquiry_id: 'i-B', existing_client: true }, A, [], '0918 777 3434'); expect(fetched).toEqual([]); expect(outcome.conflict).toBe(true);
  });
  it('the linked client\'s OWN number goes ahead, in any format, and so does the contact\'s own ManyChat number', async () => {
    await run('book_date', { ...BOOKED_B, client_id: 'c-A' }, A, [], '+63 917 555 1212'); expect(fetched.length).toBe(1); expect(outcome.conflict).toBeUndefined(); expect(outcome.booked?.ok).toBe(true);
    await run('book_date', { ...BOOKED_B, client_id: 'c-A' }, { ...A, mc_phone: '9185551234' }, [], '0918 555 1234'); expect(fetched.length).toBe(1); expect(outcome.conflict).toBeUndefined();
  });
  it('FAIL CLOSED: if the check cannot be done (database error) nothing is created', async () => {
    await run('book_date', BOOKED_B, A, [], '0917 555 1212', true); expect(fetched).toEqual([]); expect(outcome.conflict).toBe(true);
  });
  it('a chat with NO trusted link is unaffected (suggested / new): the normal booking rules apply', async () => {
    await run('book_date', { ...BOOKED_B, client_id: 'c-new' }, { link_state: 'suggested' }, [], '0918 777 3434'); expect(fetched.length).toBe(1); expect(outcome.conflict).toBeUndefined();
  });
  it('RACE: the number matches the linked client but chat-book saves the work for ANOTHER client: no confirmation, no job number and no job-order link in the outcome (auto-confirm true, booked:true)', async () => {
    const u = await run('book_date', BOOKED_B, A, [], '0917 555 1212'); expect(fetched.length).toBe(1);
    expect(outcome.conflict).toBe(true); expect(outcome.booked).toBeUndefined(); expect(outcome.text).not.toMatch(/JOB-2026-9999|ops\.topmop|booked|confirmed/i);
    expect(u.some((x) => 'client_id' in x)).toBe(false); expect(u.at(-1)).toMatchObject({ status: 'Needs a person' });
  });
  it('the same race with auto-confirm OFF (booked:false, a pending reply) and with a saved lead', async () => {
    await run('book_date', { ...BOOKED_B, booked: false, status: 'pending_human', reply: 'Thank you! JOB-2026-9999 is pending.' }, A, [], '0917 555 1212'); expect(outcome.conflict).toBe(true); expect(outcome.text).not.toMatch(/JOB-2026-9999/);
    await run('save_lead', { client_id: 'c-B', inquiry_id: 'i-B', existing_client: false }, A, [], '0917 555 1212'); expect(outcome.conflict).toBe(true); expect(outcome.text).not.toMatch(/saved|received/i);
  });
  it('fail closed even if the staff alert cannot be written: the confirmation is still suppressed', async () => {
    const sb = { from: (t: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: t === 'clients' ? { name: 'Maria Cruz', mobile: '0917 555 1212' } : A }) }) }), update: () => ({ eq: async () => { throw new Error('db down'); } }), insert: async () => { throw new Error('db down'); } }) };
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(BOOKED_B), { status: 200 }));
    const r = await makeExec({ sb, base: 'https://x.invalid', key: 'k', conv: { id: 'conv-1', channel: 'messenger', subscriber_id: 's1' }, lang: 'en', jobs: [] })('book_date', { name: 'X', mobile: '0917 555 1212', date: '2026-12-05', address: 'Makati', service: 'windows' });
    expect(r.conflict).toBe(true); expect(r.text).not.toMatch(/JOB-2026-9999|booked|confirmed/i);
  });
});

describe('review finding 2: the decision layer never sends a booking confirmation after a conflict', () => {
  it('decide(auto) with a conflict sends ONLY the safe handover sentence, even if the model and the tool wrote a confirmation with a job number and link', async () => {
    const { decide } = await import('../../supabase/functions/_shared/brain');
    const b = { reply: 'Great, your booking JOB-2026-9999 is confirmed: https://ops.topmop.ph/#/jo/AbCdEfGhIjKlMnOpQrStUvWxYz012345', actions: [], amounts: [], booked: false, conflict: true, humanReason: 'conflict', log: [] };
    const d = decide('auto', b as never, 'en'); expect(d.kind).toBe('handover'); expect(d.text).not.toMatch(/JOB-2026-9999|ops\.topmop|confirmed/i);
    const d2 = decide('auto', { ...b, bookReply: 'Booked! JOB-2026-9999', booked: true } as never, 'en'); expect(d2.kind).toBe('handover'); expect(d2.text).not.toMatch(/JOB-2026-9999/);
  });
});
