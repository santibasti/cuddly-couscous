import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeExec } from '../../supabase/functions/_shared/chatexec';

// A booking or a saved lead through the chat: when is the chat positively linked to a TopMop client?
const run = async (tool: 'book_date' | 'save_lead', reply: Record<string, unknown>, cur: Record<string, unknown> = {}, jobs: { number: string; date: string; time: string; status: string; services: string[] }[] = []) => {
  const updates: Record<string, unknown>[] = [];
  const row = (t: string) => (t === 'clients' ? { name: 'Maria Cruz' } : cur);
  const sb = { from: (t: string) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row(t) }) }) }), update: (p: Record<string, unknown>) => { updates.push(p); return { eq: async () => ({ error: null }) }; } }) };
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify(reply), { status: 200 }));
  await makeExec({ sb, base: 'https://x.invalid', key: 'k', conv: { id: 'conv-1', channel: 'messenger', subscriber_id: 's1' }, lang: 'en', jobs })(tool, { name: 'Maria Cruz', mobile: '0917 555 1212', date: '2026-12-05', address: 'Makati', service: 'window cleaning' });
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
    expect(u[0]).not.toHaveProperty('link_state'); expect(u[0]).toMatchObject({ client_id: 'c-old', status: 'Lead created' });
  });
  it('a customer who already holds a booking on the date cannot book it again; the answer is their own booking', async () => {
    const jobs = [{ number: 'JOB-2026-8818', date: '2026-12-05', time: '09:00', status: 'Confirmed', services: ['exterior glass'] }];
    const out = await (async () => { vi.stubGlobal('fetch', async () => { throw new Error('the booking function must not be called'); }); return makeExec({ sb: {}, base: 'https://x.invalid', key: 'k', conv: { id: 'c', channel: 'messenger', subscriber_id: 's' }, lang: 'en', jobs })('book_date', { date: '2026-12-05', name: 'x', mobile: '09175551212', address: 'Makati', service: 'window' }); })();
    expect(out.text).toMatch(/already_booked/); expect(out.text).toContain('JOB-2026-8818');
  });
});
