// The tools of the AI brain run through the chat functions that already exist (estimate, availability, booking, lead): one set of rules for the price, the date and the booking, whoever asks.
import type { ToolOutcome } from './brain.ts';
import { manilaDay, parseWanted } from '../chat-availability/logic.ts';
import { bundleWaives } from './estimate.ts';
import type { JobLine } from './identity.ts';

// deno-lint-ignore no-explicit-any
type Sb = any;
export interface ExecCtx { sb: Sb; base: string; key: string; conv: { id: string; channel: string; subscriber_id: string; name?: string | null }; lang: string; context?: string; services?: string[]; noHumanAlert?: boolean; jobs?: JobLine[]; booking?: { number: string; date: string; status: string } | null }
const post = async (c: ExecCtx, fn: string, body: Record<string, unknown>) => {
  const r = await fetch(`${c.base}/functions/v1/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': c.key }, body: JSON.stringify({ ...body, lang: 'en' }) });   // the tools always answer in short English; the AI phrases the reply for the customer
  const j = await r.json().catch(() => ({})) as Record<string, unknown>; if (!r.ok) throw new Error(String(j.error ?? `${fn} answered ${r.status}`)); return j;
};
const nums = (...v: unknown[]) => v.map(Number).filter((n) => Number.isFinite(n) && n > 0);
export function makeExec(c: ExecCtx) {
  return async (name: string, input: Record<string, unknown>): Promise<ToolOutcome> => {
    try {
      if (name === 'estimate') {
        // Two services booked together: the code works out the combined total (first service keeps its minimum, the second has it waived). The AI never adds the amounts itself.
        const items = Array.isArray(input.items) ? (input.items as { service?: unknown; qty?: unknown }[]).slice(0, 6).map((x) => ({ service: String(x?.service ?? ''), qty: Number(x?.qty) })) : null;
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
        if (own) return { text: `This is the customer's own booking ${own.number} on ${own.date} at ${own.time} (${own.status}). Do NOT say the date is full or unavailable and do not offer other dates: confirm their booking.` };
        if (c.booking && parseWanted(input.date, manilaDay(Date.now())) === c.booking.date) return { text: `This is the customer's own confirmed booking ${c.booking.number} for ${c.booking.date}. Do NOT say the date is full or that it is not confirmed: thank them and confirm it.` };
        const j = await post(c, 'chat-availability', { when: input.date });
        return { text: `status: ${j.status}. ${j.reply}` };
      }
      if (name === 'book_date') {
        const dup = (c.jobs ?? []).find((j) => j.date === parseWanted(input.date, manilaDay(Date.now())));
        if (dup) return { text: `status: already_booked. This customer already has booking ${dup.number} on ${dup.date} at ${dup.time} (${dup.status}). Do not create a second booking: confirm the existing one.` };
        const j = await post(c, 'chat-book', { name: input.name, mobile: input.mobile, email: input.email, storeys: input.storeys, address: input.address, service: input.service, date: input.date, panels: input.panels, property_type: input.property_type, rates_ok: input.rates_ok, details: input.details, source: c.conv.channel, subscriber_id: c.conv.subscriber_id, channel: c.conv.channel });
        await c.sb.from('chat_conversations').update({ client_id: j.client_id ?? null, inquiry_id: j.inquiry_id ?? null, status: 'Lead created' }).eq('id', c.conv.id);
        return { text: `status: ${j.status}. ${j.reply}`, amounts: nums(j.estimate), booked: { ok: j.booked === true, reply: String(j.reply ?? '') } };
      }
      if (name === 'save_lead') {
        const j = await post(c, 'lead-intake', { name: input.name, mobile: input.mobile, address: input.address, service: input.service, property_type: input.property_type, details: input.details, source: c.conv.channel === 'messenger' ? 'Facebook' : c.conv.channel });
        await c.sb.from('chat_conversations').update({ client_id: j.client_id ?? null, inquiry_id: j.inquiry_id ?? null, status: 'Lead created' }).eq('id', c.conv.id);
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
