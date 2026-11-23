// The tools of the AI brain run through the chat functions that already exist (estimate, availability, booking, lead): one set of rules for the price, the date and the booking, whoever asks.
import type { ToolOutcome } from './brain.ts';
import { manilaDay, parseWanted } from '../chat-availability/logic.ts';
import { bundleWaives } from './estimate.ts';
import { normMobile, type JobLine } from './identity.ts';

// deno-lint-ignore no-explicit-any
type Sb = any;
export interface ExecCtx { sb: Sb; base: string; key: string; conv: { id: string; channel: string; subscriber_id: string; name?: string | null }; lang: string; context?: string; services?: string[]; noHumanAlert?: boolean; jobs?: JobLine[]; hold?: string[]; booking?: { number: string; date: string; status: string } | null }
const post = async (c: ExecCtx, fn: string, body: Record<string, unknown>) => {
  const r = await fetch(`${c.base}/functions/v1/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': c.key }, body: JSON.stringify({ ...body, lang: 'en' }) });   // the tools always answer in short English; the AI phrases the reply for the customer
  const j = await r.json().catch(() => ({})) as Record<string, unknown>; if (!r.ok) throw new Error(String(j.error ?? `${fn} answered ${r.status}`)); return j;
};
const nums = (...v: unknown[]) => v.map(Number).filter((n) => Number.isFinite(n) && n > 0);
const CONFLICT_TEXT = 'status: team_check. Nothing can be finalised in this chat. Tell the customer ONLY that our team will check the details and get back to them. Mention no booking number, link, name or date.';
/** Hands the chat to a person and tells staff why. Never throws: whatever fails, the caller still suppresses the confirmation (fail closed). */
async function flagConflict(c: ExecCtx, why: string) {
  try { await c.sb.from('chat_conversations').update({ status: 'Needs a person', human_reason: why.slice(0, 300) }).eq('id', c.conv.id); } catch { /* the caller suppresses the confirmation anyway */ }
  try { await c.sb.from('alert_outbox').insert({ kind: 'chat', title: 'Booking for a different client than the one linked to this chat', body: `${c.conv.name ?? 'A customer'} (${c.conv.channel ?? 'chat'}): ${why}`.slice(0, 500) }); } catch { /* the conversation note is enough */ }
}
/** BEFORE any write (chat-book / lead-intake): a chat that staff or the system linked to client A may only book or save a lead with A's own mobile (or the contact's own ManyChat number). Anything else is a booking for someone else: nothing is created, staff handle it.
 *  If the check itself cannot be done (database error, no mobile on file to compare) it fails closed: nothing is created, staff handle it. Returns the tool outcome to give back, or null when the call may go ahead. */
async function trustedLinkGuard(c: ExecCtx, typedMobile: unknown): Promise<ToolOutcome | null> {
  let blockedWhy = '';
  try {
    const { data: cur, error } = await c.sb.from('chat_conversations').select('client_id, link_state, mc_phone').eq('id', c.conv.id).maybeSingle();
    if (error) throw new Error(String(error.message ?? error));
    if (!((cur?.link_state === 'verified' || cur?.link_state === 'staff') && cur?.client_id)) return null;   // not linked to a client: the normal rules apply
    const { data: cl, error: ce } = await c.sb.from('clients').select('name, mobile').eq('id', cur.client_id).maybeSingle();
    if (ce) throw new Error(String(ce.message ?? ce));
    const typed = normMobile(typedMobile), own = normMobile(cl?.mobile), contact = normMobile(cur.mc_phone);
    if (typed && (typed === own || typed === contact)) return null;                                          // the linked client's own number: this is their own booking
    blockedWhy = `The AI was about to make a booking or save a lead with a mobile number that is NOT the number of the client linked to this chat (${cl?.name ?? cur.client_id}). Nothing was created. If this is a booking for another person, create it yourself in Clients.`;
  } catch (e) { blockedWhy = `The AI could not check who a booking in this chat is for (${String((e as Error).message).slice(0, 80)}). Nothing was created: please handle it.`; }
  await flagConflict(c, blockedWhy);
  return { text: CONFLICT_TEXT, conflict: true, reason: blockedWhy };
}
/** After a booking or a saved lead: the client created by THIS chat is positively linked; a client that already existed and was matched by the mobile number the customer typed is only a suggestion for staff (a stranger can type anyone's number).
 *  A TRUSTED link (verified, or set by staff) is never overwritten, downgraded or cleared by what a tool returns. Returns the reason (a text for staff) when the tool saved the work for a DIFFERENT client than the trusted link (a race or an unexpected match): the link and the other client's inquiry are left alone, staff are told, and the caller must NOT confirm anything to the customer. */
async function linkAfterLead(c: ExecCtx, clientId: unknown, inquiryId: unknown, existed: boolean): Promise<string | null> {
  const { data: cur } = await c.sb.from('chat_conversations').select('client_id, link_state').eq('id', c.conv.id).maybeSingle();
  const trusted = cur?.link_state === 'verified' || cur?.link_state === 'staff';
  if (trusted) {
    if (!clientId || cur?.client_id === clientId) { try { await c.sb.from('chat_conversations').update({ ...(clientId ? { inquiry_id: inquiryId ?? null } : {}), status: 'Lead created' }).eq('id', c.conv.id); } catch { /* the link is untouched either way */ } return null; }   // the same client (or none returned): the link and the inquiry stay as they are
    let linked = String(cur?.client_id ?? ''), other = String(clientId);
    try { const [x, y] = await Promise.all([c.sb.from('clients').select('name').eq('id', cur?.client_id).maybeSingle(), c.sb.from('clients').select('name').eq('id', clientId).maybeSingle()]); linked = x?.data?.name ?? linked; other = y?.data?.name ?? other; } catch { /* the ids are enough */ }
    const why = `A booking or lead made in this chat was saved for a DIFFERENT client record (${other}) than the one linked to this chat (${linked}). The link was NOT changed. Check both records in Clients and fix the one that is wrong.`;
    await flagConflict(c, why);
    return why;
  }
  const base = { client_id: clientId ?? null, inquiry_id: inquiryId ?? null, status: 'Lead created' };
  if (!clientId) { await c.sb.from('chat_conversations').update(base).eq('id', c.conv.id); return null; }
  const keep = false;
  let extra: Record<string, unknown> = {};
  if (!keep && !existed) extra = { contact_status: 'existing', link_state: 'verified', link_basis: 'chat_booking', link_candidates: [], linked_by: 'system', linked_at: new Date().toISOString(), returning_customer: true, returning_note: 'Client created from this chat' };
  if (!keep && existed) { const { data: cl } = await c.sb.from('clients').select('name').eq('id', clientId).maybeSingle(); extra = { contact_status: 'previous', link_state: 'suggested', link_basis: 'typed_mobile', link_candidates: [{ client_id: clientId, name: cl?.name ?? 'Client', basis: 'typed_mobile' }] }; }
  const r = await c.sb.from('chat_conversations').update({ ...base, ...extra }).eq('id', c.conv.id);
  if (r.error && Object.keys(extra).length) await c.sb.from('chat_conversations').update(base).eq('id', c.conv.id);   // the identity migration (0135) is not applied yet: the booking itself must never fail because of it
  return null;
}
export function makeExec(c: ExecCtx) {
  return async (name: string, input: Record<string, unknown>): Promise<ToolOutcome> => {
    try {
      if (name === 'estimate') {
        // Two services booked together: the code works out the combined total (first service keeps its minimum, the second has it waived). The AI never adds the amounts itself.
        const list = Array.isArray(input.items) ? (input.items as { service?: unknown; qty?: unknown }[]).slice(0, 6).map((x) => ({ service: String(x?.service ?? ''), qty: Number(x?.qty) })) : null;
        // ONE service sent in the list form (the model alternates between service: and items:[{service}]) is a single service, priced exactly like service: (a bundle answer here left customers without a price in about a third of the tries)
        const only = list && list.length === 1 && list[0].service ? list[0] : null;
        const items = only ? null : list;
        if (only) { input = { ...input, service: only.service, qty: Number.isFinite(only.qty) ? only.qty : input.qty }; }
        // A single service: the minimum is waived ONLY when the model says it is a bundle AND the conversation really has another eligible first service (never for a standalone service).
        const withMain = !items && input.with_main === true && bundleWaives(String(input.service ?? ''), c.services ?? []);
        const body = (address: unknown) => (items ? { address, items, property_type: input.property_type } : { address, service: input.service, qty: input.qty, property_type: input.property_type, with_main: withMain });
        let j = await post(c, 'chat-estimate', body(input.address));
        if (j.ok === false && j.kind === 'unknown' && c.context) j = await post(c, 'chat-estimate', body(`${String(input.address ?? '')} ${c.context}`.slice(0, 300)));   // the street alone has no city: look for it in what the customer wrote
        const lineAmounts = Array.isArray(j.lines) ? (j.lines as { amount?: unknown; rate?: unknown }[]).flatMap((l) => [l.amount, l.rate]) : [];
        return { text: String(j.reply ?? ''), amounts: nums(j.estimate, j.package_price, j.extra_rate, ...lineAmounts) };
      }
      if (name === 'check_date') {
        const own = (c.jobs ?? []).find((j) => j.date === parseWanted(input.date, manilaDay(Date.now())));   // a VERIFIED client's own booking is answered before any calendar check
        const wantedDay = parseWanted(input.date, manilaDay(Date.now()));
        if (!own && wantedDay && (c.hold ?? []).includes(wantedDay)) return { text: 'status: team_confirm. Do NOT say whether this date is free, full or unavailable and do not offer other dates: tell the customer our team will confirm the date.' };   // the contact may already hold a booking on this date (not confirmed who they are): the calendar must never contradict it
        if (own) return { text: `This is the customer's own booking ${own.number} on ${own.date} at ${own.time} (${own.status}). Do NOT say the date is full or unavailable and do not offer other dates: confirm their booking.` };
        if (c.booking && parseWanted(input.date, manilaDay(Date.now())) === c.booking.date) return { text: `This is the customer's own confirmed booking ${c.booking.number} for ${c.booking.date}. Do NOT say the date is full or that it is not confirmed: thank them and confirm it.` };
        const j = await post(c, 'chat-availability', { when: input.date });
        return { text: `status: ${j.status}. ${j.reply}` };
      }
      if (name === 'book_date') {
        const wantedBook = parseWanted(input.date, manilaDay(Date.now()));
        if (wantedBook && (c.hold ?? []).includes(wantedBook)) return { text: 'status: team_confirm. Do not create a booking: the customer may already hold a booking on this date; tell them our team will confirm.' };
        const dup = (c.jobs ?? []).find((j) => j.date === parseWanted(input.date, manilaDay(Date.now())));
        if (dup) return { text: `status: already_booked. This customer already has booking ${dup.number} on ${dup.date} at ${dup.time} (${dup.status}). Do not create a second booking: confirm the existing one.` };
        { const g = await trustedLinkGuard(c, input.mobile); if (g) return g; }                                  // BEFORE any write: a booking for someone else than the linked client is never created from this chat
        const j = await post(c, 'chat-book', { name: input.name, mobile: input.mobile, email: input.email, storeys: input.storeys, address: input.address, service: input.service, date: input.date, panels: input.panels, property_type: input.property_type, rates_ok: input.rates_ok, details: input.details, source: c.conv.channel, subscriber_id: c.conv.subscriber_id, channel: c.conv.channel });
        { const why = await linkAfterLead(c, j.client_id, j.inquiry_id, j.client_existing === true); if (why) return { text: CONFLICT_TEXT, conflict: true, reason: why }; }   // saved for another client after all (a race): no confirmation, no booking number, no link reaches the customer
        return { text: `status: ${j.status}. ${j.reply}`, amounts: nums(j.estimate), booked: { ok: j.booked === true, reply: String(j.reply ?? '') } };
      }
      if (name === 'save_lead') {
        { const g = await trustedLinkGuard(c, input.mobile); if (g) return g; }
        const j = await post(c, 'lead-intake', { name: input.name, mobile: input.mobile, address: input.address, service: input.service, property_type: input.property_type, details: input.details, source: c.conv.channel === 'messenger' ? 'Facebook' : c.conv.channel });
        { const why = await linkAfterLead(c, j.client_id, j.inquiry_id, j.existing_client === true); if (why) return { text: CONFLICT_TEXT, conflict: true, reason: why }; }
        return { text: 'Lead saved. Tell the customer our team will contact them.' };
      }
      if (name === 'needs_human') {
        await c.sb.from('chat_conversations').update({ status: 'Needs a person', human_reason: String(input.reason ?? 'Needs a person').slice(0, 300) }).eq('id', c.conv.id);
        if (!c.noHumanAlert) await c.sb.from('alert_outbox').insert({ kind: 'chat', title: 'Chat needs a person', body: `${c.conv.name ?? 'A customer'} (${c.conv.channel}): ${String(input.reason ?? '').slice(0, 160)}`, link: '/ai-chat' });
        return { text: 'A staff member has been notified.' };
      }
      return { text: 'Unknown tool.' };
    } catch (e) { return { text: `Error: ${(e as Error).message}. Do not guess: tell the customer the team will verify.` }; }
  };
}
