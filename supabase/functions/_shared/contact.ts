// AI V2.3: works out who a ManyChat contact is (new / previous contact / existing client), keeps the result on the conversation row (the persistent mapping) and loads the verified client's active bookings.
// Used by chat-brain on every message and by chat-send when staff re-check or link a contact.
import { contactSince, type ReturningInfo } from './brain.ts';
import { clientsByMobile, clientsByReference, decideIdentity, jobNumbersIn, jobOrderTokensIn, manilaNow, normMobile, openJobs, phonesIn, type Candidate, type Identity, type JobLine } from './identity.ts';

// deno-lint-ignore no-explicit-any
type Db = any;
/** candidateJobs: the active bookings of the clients a contact MIGHT be (not confirmed). They are never shown to the AI or the customer: they only stop the AI from offering the booking form or calling a date full, and tell staff what to check. */
export interface CandidateJobs { client_id: string; name: string; jobs: JobLine[] }
/** staleJobs: a confirmed client's open jobs whose status cannot be trusted any more (for example "On Site" for weeks): never described to the customer, staff verify. referenced: the clients behind job numbers / job-order links the customer wrote (suggestions only). */
export interface ContactResult { identity: Identity; jobs: JobLine[]; staleJobs: JobLine[]; referenced: Candidate[]; candidateJobs: CandidateJobs[]; returning: ReturningInfo | null; mc: { fetched: boolean; fields?: string[]; subscribed?: string } }
const iso = (v: unknown): string | undefined => { const t = typeof v === 'number' ? (v > 1e12 ? v : v * 1000) : Date.parse(String(v ?? '')); return Number.isFinite(t) && t > 0 ? new Date(t).toISOString() : undefined; };
const PHONE_KEYS = ['phone', 'optin_phone', 'mobile', 'mobile_number', 'whatsapp_phone'];
const phoneFrom = (...objs: unknown[]): string | undefined => { for (const o of objs) { if (!o || typeof o !== 'object') continue; for (const k of PHONE_KEYS) { const n = normMobile((o as Record<string, unknown>)[k]); if (n) return n; } } return undefined; };
const tagNames = (tags: unknown): string[] => (Array.isArray(tags) ? tags : []).map((t) => String(typeof t === 'object' && t ? (t as { name?: unknown }).name ?? '' : t ?? '')).filter(Boolean).slice(0, 20);
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export async function resolveContact(a: { sb: Db; env: (k: string) => string; conv: Record<string, unknown>; sub: string; payloads: unknown[]; text: string; aiStartedOn?: string; today: string; force?: boolean }): Promise<ContactResult> {
  const { sb, conv } = a; const token = a.env('MANYCHAT_API_TOKEN');
  // 1. what ManyChat says about this contact: once (or again when staff re-check). The API has NO conversation history: only contact fields.
  let mc: ContactResult['mc'] = { fetched: false }; let fresh: Record<string, unknown> | undefined;
  if (token && (a.force || !conv.mc_synced_at)) {
    const r = await fetch(`https://api.manychat.com/fb/subscriber/getInfo?subscriber_id=${encodeURIComponent(a.sub)}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3500) }).catch(() => null);
    fresh = r && r.ok ? (((await r.json().catch(() => ({}))) as { data?: Record<string, unknown> }).data ?? undefined) : undefined;
    if (fresh) mc = { fetched: true, fields: Object.keys(fresh), subscribed: contactSince({}, fresh) };
  }
  const subscribedAt = contactSince(...a.payloads, fresh ?? {}) ?? (conv.mc_subscribed_at as string | undefined) ?? undefined;   // the date ManyChat first knew this contact (from the request body or ManyChat's own record)
  const lastInteraction = (fresh && (iso(fresh.last_interaction) ?? iso(fresh.last_seen) ?? iso(fresh.ig_last_interaction))) ?? (conv.mc_last_interaction as string | undefined) ?? undefined;
  const tags = fresh ? tagNames(fresh.tags) : ((conv.mc_tags as unknown[]) ?? []);
  const phone = phoneFrom(...a.payloads, fresh) ?? (conv.mc_phone as string | undefined) ?? undefined;   // the CONTACT's own number, never one typed in the chat

  if (phone && a.payloads.length && conv.mc_phone !== phone) { const sv = await sb.from('chat_conversations').update({ mc_phone: phone }).eq('id', conv.id); if (!sv.error) conv.mc_phone = phone; }   // kept BEFORE any lookup that can fail: a retry (the recovery job) still knows the contact's own number
  // 2. candidate clients: by the contact's own mobile (verifies), by what the customer typed (only suggests)
  const phoneMatches = phone ? await clientsByMobile(sb, `0${phone}`, 'contact_mobile') : [];   // only a SUGGESTION: a phone number in ManyChat does not prove who is typing
  const typed: Candidate[] = [];
  const typedPhones = phonesIn(a.text).filter((n) => n !== phone);
  for (const n of typedPhones.slice(0, 3)) typed.push(...await clientsByMobile(sb, `0${n}`, 'typed_mobile'));
  const referenced = jobNumbersIn(a.text).length || jobOrderTokensIn(a.text).length ? await clientsByReference(sb, a.text) : [];   // job numbers, job-order numbers and TopMop job-order links: they only SUGGEST a client
  typed.push(...referenced);
  const kept = (conv.link_state === 'suggested' || conv.link_state === 'ambiguous') && Array.isArray(conv.link_candidates) ? (conv.link_candidates as Candidate[]) : [];
  const seen = new Set<string>(); const typedMatches = [...typed, ...kept].filter((c) => c?.client_id && !seen.has(c.client_id) && seen.add(c.client_id)).slice(0, 5);

  let identity = decideIdentity({
    stored: { client_id: conv.client_id as string | null, link_state: conv.link_state as string | null, link_basis: conv.link_basis as string | null, staff_returning: conv.returning_customer === true && /^Staff marked/.test(String(conv.returning_note ?? '')) },
    phoneMatches, typedMatches, tags, subscribedAt, lastInteraction, convCreatedAt: conv.created_at as string | undefined, aiStartedOn: a.aiStartedOn,
  });
  if (identity.status === 'new' && conv.contact_status === 'previous') identity = { ...identity, status: 'previous', reasons: ['Recognised as a previous contact earlier'] };   // never forgotten once recognised

  // 3. keep the result on the conversation (the persistent mapping): only what changed
  const prevIds = (Array.isArray(conv.link_candidates) ? (conv.link_candidates as Candidate[]) : []).map((c) => c.client_id);   // before the update below
  const upd: Record<string, unknown> = {};
  const note = identity.reasons.join('; ').slice(0, 300);
  if (identity.status !== (conv.contact_status ?? 'new')) upd.contact_status = identity.status;
  if (identity.status === 'existing' && identity.client_id && (conv.client_id !== identity.client_id || conv.link_state !== identity.state)) { upd.client_id = identity.client_id; upd.link_state = identity.state; upd.link_basis = identity.basis; upd.linked_at = new Date().toISOString(); upd.linked_by = identity.state === 'staff' ? conv.linked_by ?? 'staff' : 'system'; upd.link_candidates = []; }
  if (identity.status === 'previous' && (identity.state ?? null) !== ((conv.link_state as string | null) ?? null)) { upd.link_state = identity.state ?? null; upd.link_candidates = identity.candidates; }
  if (identity.status === 'previous' && identity.state && !sameJson(identity.candidates, conv.link_candidates)) upd.link_candidates = identity.candidates;
  if (identity.status !== 'new' && conv.returning_customer !== true) { upd.returning_customer = true; upd.returning_note = note || 'Recognised'; }
  if (fresh) { upd.mc_synced_at = new Date().toISOString(); if (subscribedAt) upd.mc_subscribed_at = subscribedAt; if (lastInteraction) upd.mc_last_interaction = lastInteraction; upd.mc_tags = tags; if (phone) upd.mc_phone = phone; }
  else if (phone && conv.mc_phone !== phone && a.payloads.length) upd.mc_phone = phone;
  if (Object.keys(upd).length) {
    let r = await sb.from('chat_conversations').update(upd).eq('id', conv.id);
    if (r.error && /column|schema cache/i.test(r.error.message)) {   // the identity migration (0135) is not applied yet: keep working with the older fields only
      const legacy: Record<string, unknown> = {}; for (const k of ['client_id', 'returning_customer', 'returning_note']) if (k in upd) legacy[k] = upd[k];
      if (identity.status === 'existing' && identity.client_id) legacy.client_id = identity.client_id; if (Object.keys(legacy).length) r = await sb.from('chat_conversations').update(legacy).eq('id', conv.id);
    }
    if (r.error) console.error('contact link', r.error.message);
  }
  // staff are told only when THEY must decide (more than one client fits, or the customer wrote a number that matches a client)
  const askStaff = identity.status === 'previous' && !!identity.state && identity.candidates.length > 0 && !sameJson(identity.candidates.map((c) => c.client_id), prevIds);
  if (askStaff) await sb.from('alert_outbox').insert({ kind: 'chat', title: 'Please confirm the client match', body: `${conv.name ?? 'A customer'} (${conv.channel ?? 'chat'}): ${identity.state === 'ambiguous' ? 'the phone number is on more than one client record' : identity.candidates.some((c) => c.basis === 'contact_mobile') ? 'the phone number ManyChat holds for this contact matches a client record' : 'they wrote a number that matches a client record'}: ${identity.candidates.map((c) => c.name).join(' / ')}. Open AI Chat and confirm the right client (until then the AI shares no booking details).`, link: '/ai-chat' });

  // 4. what the AI is told
  let jobs: JobLine[] = []; let staleJobs: JobLine[] = []; let returning: ReturningInfo | null = null; const candidateJobs: CandidateJobs[] = [];
  if (identity.status === 'previous' && identity.candidates.length) for (const c of identity.candidates.slice(0, 3)) { const o = await openJobs(sb, c.client_id, manilaNow()); const j = [...o.live, ...o.stale]; if (j.length) candidateJobs.push({ client_id: c.client_id, name: c.name, jobs: j }); }   // stale ones too: a date held by an uncertain record is still never called free
  if (identity.status === 'existing' && identity.client_id) {
    const cid = identity.client_id;
    const [cl, jb, iq, act] = await Promise.all([
      sb.from('clients').select('name, mobile, email, address').eq('id', cid).maybeSingle(),
      sb.from('jobs').select('number, status, start_at').eq('client_id', cid).is('deleted_at', null).order('start_at', { ascending: false }).limit(4),
      sb.from('inquiries').select('stage, details, created_at').eq('client_id', cid).is('deleted_at', null).order('created_at', { ascending: false }).limit(3),
      openJobs(sb, cid, manilaNow())]);
    if (cl.error || jb.error) throw new Error(`client record lookup failed: ${String((cl.error ?? jb.error)?.message ?? 'error').slice(0, 100)}`);
    jobs = act.live; staleJobs = act.stale;
    returning = { note: note || 'Matched to an existing client', status: 'existing', client: cl.data ? { name: cl.data.name, mobile: cl.data.mobile, email: cl.data.email, address: cl.data.address } : undefined,
      jobs: ((jb.data ?? []) as { number: string; status: string; start_at: string }[]).map((j) => `${j.number} (${j.status}, ${String(j.start_at).slice(0, 10)})`),
      inquiries: ((iq.data ?? []) as { stage: string; details: string | null; created_at: string }[]).map((q) => `${String(q.created_at).slice(0, 10)} ${q.stage}: ${String(q.details ?? '').slice(0, 70)}`), active: act.live, stale: act.stale.map((j) => ({ number: j.number, date: j.date, status: j.status })) };
  } else if (identity.status === 'previous') returning = { note: note || 'Has talked to TopMop before', status: 'previous', suggested: !!identity.state };
  return { identity, jobs, staleJobs, referenced, candidateJobs, returning, mc };
}
