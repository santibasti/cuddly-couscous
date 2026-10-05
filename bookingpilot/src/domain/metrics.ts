import type { BlockedDate, Booking, BookingPayment, BookingStatus, Guest, PaymentStatus, Resource, Source } from '@/types';
import { addDays, diffDays, eachDay, nightsBetween, rangesOverlap, tsToDay } from './dates';
import { SOURCE_GROUPS, SOURCE_META, type SourceGroup } from './meta';

export const REVENUE_STATUSES: BookingStatus[] = ['confirmed', 'checked_in', 'checked_out'];
export const isRevenue = (b: Booking) => REVENUE_STATUSES.includes(b.status);

export interface Filters {
  resourceIds?: string[]; // empty/undefined = all
  sources?: Source[];
}

export const applyFilters = (bookings: Booking[], f: Filters = {}) =>
  bookings.filter((b) => (!f.resourceIds?.length || f.resourceIds.includes(b.resourceId)) && (!f.sources?.length || f.sources.includes(b.source)));

export const paidAmount = (payments: BookingPayment[], bookingId: string) =>
  payments.filter((p) => p.bookingId === bookingId).reduce((s, p) => s + (p.kind === 'refund' ? -p.amount : p.amount), 0);

export function paymentStatus(b: Booking, payments: BookingPayment[]): PaymentStatus {
  const mine = payments.filter((p) => p.bookingId === b.id);
  const paid = paidAmount(payments, b.id);
  if (mine.some((p) => p.kind === 'refund') && paid <= 0) return 'refunded';
  if (paid >= b.totalAmount && b.totalAmount > 0) return 'paid';
  if (paid > 0) return 'partial';
  return 'unpaid';
}

/** Revenue is recognised per night stayed: total / nights. */
export const revenuePerNight = (b: Booking) => b.totalAmount / Math.max(1, nightsBetween(b.checkIn, b.checkOut));

export function revenueInRange(bookings: Booking[], start: string, endExclusive: string) {
  let sum = 0;
  for (const b of bookings) {
    if (!isRevenue(b)) continue;
    const s = b.checkIn > start ? b.checkIn : start;
    const e = b.checkOut < endExclusive ? b.checkOut : endExclusive;
    if (e > s) sum += revenuePerNight(b) * diffDays(s, e);
  }
  return sum;
}

export function occupiedNightsInRange(bookings: Booking[], start: string, endExclusive: string) {
  let n = 0;
  for (const b of bookings) {
    if (!isRevenue(b)) continue;
    const s = b.checkIn > start ? b.checkIn : start;
    const e = b.checkOut < endExclusive ? b.checkOut : endExclusive;
    if (e > s) n += diffDays(s, e);
  }
  return n;
}

/** Sellable resource-nights in range: all nights minus blocked nights; inactive/maintenance resources excluded. */
export function availableNightsInRange(resources: Resource[], blocks: BlockedDate[], start: string, endExclusive: string) {
  let total = 0;
  const days = diffDays(start, endExclusive);
  for (const r of resources) {
    if (r.status !== 'available') continue;
    let blocked = 0;
    for (const bl of blocks.filter((x) => x.resourceId === r.id)) {
      const s = bl.startDate > start ? bl.startDate : start;
      const e = bl.endDate < endExclusive ? bl.endDate : endExclusive;
      if (e > s) blocked += diffDays(s, e);
    }
    total += Math.max(0, days - blocked);
  }
  return total;
}

export function occupancyRate(bookings: Booking[], resources: Resource[], blocks: BlockedDate[], start: string, endExclusive: string) {
  const avail = availableNightsInRange(resources, blocks, start, endExclusive);
  if (!avail) return 0;
  return Math.min(1, occupiedNightsInRange(bookings, start, endExclusive) / avail);
}

export function revenueByDay(bookings: Booking[], start: string, endExclusive: string) {
  return eachDay(start, endExclusive).map((date) => ({ date, revenue: Math.round(revenueInRange(bookings, date, addDays(date, 1))) }));
}

export function occupancyByResource(bookings: Booking[], resources: Resource[], blocks: BlockedDate[], start: string, endExclusive: string) {
  return resources.map((r) => ({
    id: r.id, name: r.name, color: r.color,
    rate: occupancyRate(bookings.filter((b) => b.resourceId === r.id), [r], blocks, start, endExclusive),
    revenue: revenueInRange(bookings.filter((b) => b.resourceId === r.id), start, endExclusive),
  }));
}

export function channelMix(bookings: Booking[]) {
  const live = bookings.filter((b) => b.status !== 'cancelled' && b.status !== 'inquiry');
  const total = live.length || 1;
  return SOURCE_GROUPS.map((g) => {
    const list = live.filter((b) => SOURCE_META[b.source].group === (g.key as SourceGroup));
    return { ...g, count: list.length, share: list.length / total, revenue: list.reduce((s, b) => s + (isRevenue(b) ? b.totalAmount : 0), 0) };
  }).filter((g) => g.count > 0);
}

export function bookingsCreatedIn(bookings: Booking[], start: string, endExclusive: string) {
  return bookings.filter((b) => { const d = tsToDay(b.createdAt); return d >= start && d < endExclusive; });
}

export interface GuestStats { stays: number; lifetimeSpend: number; lastStay?: string; nextStay?: string; bookings: Booking[] }
export function guestStats(guestId: string, bookings: Booking[], today: string): GuestStats {
  const mine = bookings.filter((b) => b.guestId === guestId).sort((a, b) => b.checkIn.localeCompare(a.checkIn));
  const stayed = mine.filter((b) => b.status === 'checked_out' || b.status === 'checked_in');
  const upcoming = mine.filter((b) => ['pending', 'confirmed'].includes(b.status) && b.checkIn >= today).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  return {
    stays: stayed.length,
    lifetimeSpend: mine.filter(isRevenue).reduce((s, b) => s + b.totalAmount, 0),
    lastStay: stayed.map((b) => b.checkOut).sort().pop(),
    nextStay: upcoming[0]?.checkIn,
    bookings: mine,
  };
}

export const guestIsRepeat = (g: Guest, bookings: Booking[], today: string) => guestStats(g.id, bookings, today).stays >= 2 || g.tags.includes('Repeat Guest');

/** Information the front desk still has to collect. */
export function missingGuestInfo(g: Guest | undefined) {
  if (!g) return ['guest'];
  const m: string[] = [];
  if (!g.mobile.trim()) m.push('mobile number');
  if (!g.email.trim()) m.push('email');
  return m;
}
