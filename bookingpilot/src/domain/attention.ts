import type { Booking, Conversation, Message } from '@/types';
import { addDays, fmtShort } from './dates';
import { missingGuestInfo, paidAmount } from './metrics';
import type { OrgCtx } from '@/store/hooks';

export type AttentionKind = 'conflict' | 'approval' | 'pending' | 'unpaid' | 'inbox' | 'guest_info';
export interface AttentionItem {
  id: string; kind: AttentionKind; severity: 'urgent' | 'action' | 'info';
  title: string; detail: string; bookingId?: string; conversationId?: string; guestId?: string;
  actionLabel: string; to: string;
}

export function buildAttention(org: OrgCtx): AttentionItem[] {
  const items: AttentionItem[] = [];
  const resName = (b: Booking) => org.resourceById(b.resourceId)?.name ?? '';
  const gname = (id: string) => org.guestById(id)?.fullName ?? 'Guest';

  const seen = new Set<string>();
  for (const a of org.alerts.filter((x) => x.status === 'open')) {
    if (seen.has(a.bookingId)) continue; seen.add(a.bookingId);
    const b = org.bookings.find((x) => x.id === a.bookingId); if (!b) continue;
    const other = org.bookings.find((x) => x.id === a.otherBookingId);
    items.push({ id: `c-${b.id}`, kind: 'conflict', severity: 'urgent', title: 'Possible double booking', detail: `${gname(b.guestId)} · ${resName(b)}${other ? ` vs ${gname(other.guestId)}` : ''}`, bookingId: b.id, actionLabel: 'Resolve', to: `/bookings/${b.id}` });
  }
  if (org.can('conflicts.override')) {
    for (const b of org.bookings.filter((x) => x.status === 'conflict_review' && x.approval?.status === 'pending')) {
      items.push({ id: `a-${b.id}`, kind: 'approval', severity: 'urgent', title: 'Manager approval requested', detail: `${gname(b.guestId)} · ${resName(b)} — ${b.approval!.reason}`, bookingId: b.id, actionLabel: 'Decide', to: `/bookings/${b.id}` });
    }
  }
  for (const b of org.bookings.filter((x) => x.status === 'pending')) {
    items.push({ id: `p-${b.id}`, kind: 'pending', severity: 'action', title: 'Pending confirmation', detail: `${gname(b.guestId)} · ${resName(b)} · ${fmtShort(b.checkIn)}`, bookingId: b.id, actionLabel: 'Review', to: `/bookings/${b.id}` });
  }
  const horizon = addDays(org.today, 14);
  for (const b of org.bookings.filter((x) => ['pending', 'confirmed'].includes(x.status) && x.checkIn >= org.today && x.checkIn <= horizon && x.source !== 'booking_com' && x.source !== 'agoda')) {
    const need = Math.max(0, b.depositAmount) ; if (need > 0 && paidAmount(org.payments, b.id) < need) {
      items.push({ id: `u-${b.id}`, kind: 'unpaid', severity: 'action', title: 'Unpaid reservation', detail: `${gname(b.guestId)} · deposit not received · arrives ${fmtShort(b.checkIn)}`, bookingId: b.id, actionLabel: 'Request payment', to: `/bookings/${b.id}?action=payment` });
    }
  }
  if (org.can('inbox.view')) {
    const unread = new Map<string, Message[]>();
    for (const m of org.messages.filter((x) => x.direction === 'in' && !x.readAt)) unread.set(m.conversationId, [...(unread.get(m.conversationId) ?? []), m]);
    for (const [cid, ms] of unread) {
      const cv = org.conversations.find((c) => c.id === cid) as Conversation | undefined; if (!cv || !['facebook', 'whatsapp'].includes(cv.channel)) continue;
      items.push({ id: `i-${cid}`, kind: 'inbox', severity: 'action', title: `Unread ${cv.channel === 'facebook' ? 'Facebook' : 'WhatsApp'} inquiry`, detail: `${gname(cv.guestId)} — “${ms.at(-1)!.body.slice(0, 60)}${ms.at(-1)!.body.length > 60 ? '…' : ''}”`, conversationId: cid, actionLabel: 'Reply', to: `/inbox?c=${cid}` });
    }
  }
  for (const b of org.bookings.filter((x) => ['pending', 'confirmed'].includes(x.status) && x.checkIn >= org.today && x.checkIn <= horizon)) {
    const missing = missingGuestInfo(org.guestById(b.guestId));
    if (missing.length) items.push({ id: `g-${b.id}`, kind: 'guest_info', severity: 'info', title: 'Guest information needed', detail: `${gname(b.guestId)} — missing ${missing.join(' & ')}`, bookingId: b.id, guestId: b.guestId, actionLabel: 'Add details', to: `/guests?edit=${b.guestId}` });
  }
  const rank = { urgent: 0, action: 1, info: 2 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
