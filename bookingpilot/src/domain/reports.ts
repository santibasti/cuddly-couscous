import type { AuditLog, BlockedDate, Booking, BookingPayment, ConflictAlert, Guest, Resource } from '@/types';
import { addDays, diffDays, eachDay, fmtDate, fmtDateTime, nightsBetween, startOfMonth, startOfWeek, tsToDay } from './dates';
import { applyFilters, availableNightsInRange, guestStats, isRevenue, occupancyRate, occupiedNightsInRange, paidAmount, paymentStatus, revenueInRange, type Filters } from './metrics';
import { PAYMENT_META, SOURCE_GROUPS, SOURCE_META, STATUS_META } from './meta';
import { peso, pct } from './money';

export type Cell = string | number;
export interface Report {
  id: string; title: string; description: string;
  summary: { label: string; value: string }[];
  columns: string[]; rows: Cell[][];
  chart?: { kind: 'bar' | 'area'; data: { label: string; value: number }[]; format: 'peso' | 'pct' | 'count' };
}
export interface ReportInput {
  bookings: Booking[]; resources: Resource[]; blocks: BlockedDate[]; payments: BookingPayment[]; guests: Guest[]; audit: AuditLog[]; alerts: ConflictAlert[];
  today: string; start: string; end: string; // end exclusive
  filters: Filters; memberName: (id?: string) => string; guestName: (id: string) => string; resName: (id: string) => string;
}

export const REPORT_LIST = [
  ['revenue', 'Revenue'], ['occupancy', 'Occupancy'], ['sources', 'Booking sources'], ['cancellations', 'Cancellation rate'], ['abv', 'Average booking value'],
  ['top-properties', 'Top properties'], ['top-guests', 'Top guests'], ['repeat', 'Repeat customers'], ['pending-payments', 'Pending payments'], ['checkins', 'Upcoming check-ins'],
  ['conflicts', 'Conflict history'], ['staff', 'Staff activity'],
] as const;
export type ReportId = (typeof REPORT_LIST)[number][0];

export function buildReport(id: ReportId, i: ReportInput, granularity: 'day' | 'week' | 'month' = 'day'): Report {
  const bs = applyFilters(i.bookings, i.filters);
  const res = i.resources.filter((r) => !i.filters.resourceIds?.length || i.filters.resourceIds.includes(r.id));
  const inRange = bs.filter((b) => b.checkOut > i.start && b.checkIn < i.end);
  const created = bs.filter((b) => { const d = tsToDay(b.createdAt); return d >= i.start && d < i.end; });
  const rev = (b: Booking[]) => revenueInRange(b, i.start, i.end);
  const days = diffDays(i.start, i.end);

  switch (id) {
    case 'revenue': {
      const key = (d: string) => (granularity === 'day' ? d : granularity === 'week' ? startOfWeek(d) : startOfMonth(d));
      const map = new Map<string, number>();
      for (const d of eachDay(i.start, i.end)) map.set(key(d), (map.get(key(d)) ?? 0) + revenueInRange(bs, d, addDays(d, 1)));
      const rows = [...map.entries()].map(([k, v]) => [granularity === 'month' ? k.slice(0, 7) : granularity === 'week' ? `Week of ${fmtDate(k)}` : fmtDate(k), Math.round(v)] as Cell[]);
      const total = rev(bs);
      return { id, title: `Revenue by ${granularity}`, description: 'Room revenue recognised per night stayed (confirmed, in-house and completed stays).', summary: [{ label: 'Total revenue', value: peso(total) }, { label: 'Per day', value: peso(total / Math.max(1, days)) }, { label: 'Paying bookings', value: String(inRange.filter(isRevenue).length) }], columns: ['Period', 'Revenue (PHP)'], rows, chart: { kind: 'area', data: rows.map((r) => ({ label: String(r[0]), value: Number(r[1]) })), format: 'peso' } };
    }
    case 'occupancy': {
      const rows = res.map((r) => { const mine = bs.filter((b) => b.resourceId === r.id); const occ = occupiedNightsInRange(mine, i.start, i.end); const av = availableNightsInRange([r], i.blocks, i.start, i.end); return [r.name, occ, av, pct(av ? occ / av : 0, 1)] as Cell[]; });
      const overall = occupancyRate(bs, res, i.blocks, i.start, i.end);
      return { id, title: 'Occupancy rate', description: 'Occupied nights ÷ sellable nights. Blocked dates and unavailable resources are excluded from sellable nights.', summary: [{ label: 'Overall occupancy', value: pct(overall, 1) }, { label: 'Occupied nights', value: String(occupiedNightsInRange(bs, i.start, i.end)) }, { label: 'Sellable nights', value: String(availableNightsInRange(res, i.blocks, i.start, i.end)) }], columns: ['Property', 'Occupied nights', 'Sellable nights', 'Occupancy'], rows, chart: { kind: 'bar', data: res.map((r, k) => ({ label: r.name, value: Number(String(rows[k][3]).replace('%', '')) / 100 })), format: 'pct' } };
    }
    case 'sources': {
      const live = created.filter((b) => !['cancelled', 'inquiry'].includes(b.status));
      const rows = SOURCE_GROUPS.map((g) => { const l = live.filter((b) => SOURCE_META[b.source].group === g.key); const r = l.filter(isRevenue).reduce((s, b) => s + b.totalAmount, 0); return [g.label, l.length, pct(live.length ? l.length / live.length : 0, 1), r, l.length ? Math.round(l.reduce((s, b) => s + b.totalAmount, 0) / l.length) : 0] as Cell[]; }).filter((r) => Number(r[1]) > 0);
      return { id, title: 'Booking source performance', description: 'Reservations created in the period, grouped by channel.', summary: [{ label: 'Bookings created', value: String(live.length) }, { label: 'Top channel', value: String(rows.sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] ?? '—') }], columns: ['Channel', 'Bookings', 'Share', 'Confirmed revenue (PHP)', 'Avg value (PHP)'], rows, chart: { kind: 'bar', data: rows.map((r) => ({ label: String(r[0]), value: Number(r[1]) })), format: 'count' } };
    }
    case 'cancellations': {
      const total = created.filter((b) => b.status !== 'inquiry');
      const cx = total.filter((b) => b.status === 'cancelled'); const ns = total.filter((b) => b.status === 'no_show');
      const rows = SOURCE_GROUPS.map((g) => { const l = total.filter((b) => SOURCE_META[b.source].group === g.key); const c = l.filter((b) => ['cancelled', 'no_show'].includes(b.status)); return [g.label, l.length, c.length, pct(l.length ? c.length / l.length : 0, 1)] as Cell[]; }).filter((r) => Number(r[1]) > 0);
      return { id, title: 'Cancellation rate', description: 'Cancelled and no-show bookings as a share of bookings created in the period.', summary: [{ label: 'Cancellation rate', value: pct(total.length ? (cx.length + ns.length) / total.length : 0, 1) }, { label: 'Cancelled', value: String(cx.length) }, { label: 'No-shows', value: String(ns.length) }], columns: ['Channel', 'Bookings', 'Cancelled / no-show', 'Rate'], rows, chart: { kind: 'bar', data: rows.map((r) => ({ label: String(r[0]), value: Number(String(r[3]).replace('%', '')) / 100 })), format: 'pct' } };
    }
    case 'abv': {
      const l = inRange.filter(isRevenue);
      const avg = l.length ? l.reduce((s, b) => s + b.totalAmount, 0) / l.length : 0;
      const rows = res.map((r) => { const m = l.filter((b) => b.resourceId === r.id); return [r.name, m.length, m.length ? Math.round(m.reduce((s, b) => s + b.totalAmount, 0) / m.length) : 0, m.length ? (m.reduce((s, b) => s + nightsBetween(b.checkIn, b.checkOut), 0) / m.length).toFixed(1) : '0'] as Cell[]; });
      return { id, title: 'Average booking value', description: 'Mean total of confirmed stays overlapping the period.', summary: [{ label: 'Average booking value', value: peso(avg) }, { label: 'Stays counted', value: String(l.length) }], columns: ['Property', 'Stays', 'Avg value (PHP)', 'Avg nights'], rows, chart: { kind: 'bar', data: rows.map((r) => ({ label: String(r[0]), value: Number(r[2]) })), format: 'peso' } };
    }
    case 'top-properties': {
      const rows = res.map((r) => { const m = bs.filter((b) => b.resourceId === r.id); return { r, rev: rev(m), occ: occupancyRate(m, [r], i.blocks, i.start, i.end), n: m.filter((b) => isRevenue(b) && b.checkOut > i.start && b.checkIn < i.end).length }; }).sort((a, b) => b.rev - a.rev);
      return { id, title: 'Top properties / resources', description: 'Ranked by revenue earned in the period.', summary: [{ label: 'Top performer', value: rows[0]?.r.name ?? '—' }, { label: 'Its revenue', value: peso(rows[0]?.rev ?? 0) }], columns: ['Rank', 'Property', 'Revenue (PHP)', 'Occupancy', 'Stays'], rows: rows.map((x, k) => [k + 1, x.r.name, Math.round(x.rev), pct(x.occ, 1), x.n] as Cell[]), chart: { kind: 'bar', data: rows.map((x) => ({ label: x.r.name, value: Math.round(x.rev) })), format: 'peso' } };
    }
    case 'top-guests': {
      const list = i.guests.map((g) => ({ g, s: guestStats(g.id, bs, i.today) })).filter((x) => x.s.lifetimeSpend > 0).sort((a, b) => b.s.lifetimeSpend - a.s.lifetimeSpend).slice(0, 15);
      return { id, title: 'Top guests by lifetime spend', description: 'All-time confirmed spend (not limited to the date range).', summary: [{ label: 'Top guest', value: list[0]?.g.fullName ?? '—' }, { label: 'Their spend', value: peso(list[0]?.s.lifetimeSpend ?? 0) }], columns: ['Guest', 'Nationality', 'Stays', 'Lifetime spend (PHP)', 'Last stay'], rows: list.map((x) => [x.g.fullName, x.g.nationality, x.s.stays, Math.round(x.s.lifetimeSpend), x.s.lastStay ? fmtDate(x.s.lastStay) : '—'] as Cell[]), chart: { kind: 'bar', data: list.slice(0, 8).map((x) => ({ label: x.g.fullName.split(' ')[0], value: Math.round(x.s.lifetimeSpend) })), format: 'peso' } };
    }
    case 'repeat': {
      const stats = i.guests.map((g) => ({ g, s: guestStats(g.id, i.bookings, i.today) })).filter((x) => x.s.stays >= 1);
      const rep = stats.filter((x) => x.s.stays >= 2);
      return { id, title: 'Repeat customer rate', description: 'Share of guests who have stayed at least twice.', summary: [{ label: 'Repeat rate', value: pct(stats.length ? rep.length / stats.length : 0, 1) }, { label: 'Repeat guests', value: String(rep.length) }, { label: 'Guests who stayed', value: String(stats.length) }], columns: ['Guest', 'Stays', 'Lifetime spend (PHP)', 'Last stay'], rows: rep.sort((a, b) => b.s.stays - a.s.stays).map((x) => [x.g.fullName, x.s.stays, Math.round(x.s.lifetimeSpend), x.s.lastStay ? fmtDate(x.s.lastStay) : '—'] as Cell[]) };
    }
    case 'pending-payments': {
      const l = bs.filter((b) => ['pending', 'confirmed', 'checked_in', 'checked_out'].includes(b.status) && b.totalAmount - paidAmount(i.payments, b.id) > 0).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
      const due = l.reduce((s, b) => s + b.totalAmount - paidAmount(i.payments, b.id), 0);
      return { id, title: 'Pending payments', description: 'Open balances on active and completed stays.', summary: [{ label: 'Outstanding', value: peso(due) }, { label: 'Bookings with balance', value: String(l.length) }], columns: ['Booking', 'Guest', 'Property', 'Check-in', 'Status', 'Total (PHP)', 'Paid (PHP)', 'Balance (PHP)', 'Payment'], rows: l.map((b) => [b.ref, i.guestName(b.guestId), i.resName(b.resourceId), fmtDate(b.checkIn), STATUS_META[b.status].label, b.totalAmount, paidAmount(i.payments, b.id), b.totalAmount - paidAmount(i.payments, b.id), PAYMENT_META[paymentStatus(b, i.payments)].label] as Cell[]) };
    }
    case 'checkins': {
      const from = i.start > i.today ? i.start : i.today;
      const l = bs.filter((b) => ['pending', 'confirmed'].includes(b.status) && b.checkIn >= from && b.checkIn < i.end).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
      return { id, title: 'Upcoming check-ins', description: 'Pending and confirmed arrivals from today to the end of the range.', summary: [{ label: 'Arrivals', value: String(l.length) }, { label: 'Guests arriving', value: String(l.reduce((s, b) => s + b.adults + b.children, 0)) }], columns: ['Check-in', 'Guest', 'Property', 'Nights', 'Guests', 'Source', 'Status', 'Balance (PHP)'], rows: l.map((b) => [fmtDate(b.checkIn), i.guestName(b.guestId), i.resName(b.resourceId), nightsBetween(b.checkIn, b.checkOut), b.adults + b.children, SOURCE_META[b.source].label, STATUS_META[b.status].label, Math.max(0, b.totalAmount - paidAmount(i.payments, b.id))] as Cell[]) };
    }
    case 'conflicts': {
      const l = i.alerts.filter((a) => { const d = tsToDay(a.detectedAt); return d >= i.start && d < i.end; }).sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
      const bk = (id: string) => i.bookings.find((b) => b.id === id);
      return { id, title: 'Conflict history', description: 'Every conflict the engine detected, and how it ended.', summary: [{ label: 'Detected', value: String(l.length) }, { label: 'Open', value: String(l.filter((a) => a.status === 'open').length) }, { label: 'Overridden', value: String(l.filter((a) => a.status === 'overridden').length) }], columns: ['Detected', 'Booking', 'Guest', 'Property', 'Type', 'Detail', 'Status', 'Resolution'], rows: l.map((a) => { const b = bk(a.bookingId); return [fmtDateTime(a.detectedAt), b?.ref ?? '—', b ? i.guestName(b.guestId) : '—', b ? i.resName(b.resourceId) : '—', a.kind.replace('_', ' '), a.details, a.status, a.resolution ?? ''] as Cell[]; }) };
    }
    case 'staff': {
      const log = i.audit.filter((a) => { const d = tsToDay(a.at); return d >= i.start && d < i.end; });
      const actors = [...new Set(log.map((a) => a.actorId))];
      const c = (id: string, ...acts: string[]) => log.filter((a) => a.actorId === id && acts.includes(a.action)).length;
      const rows = actors.map((id) => [i.memberName(id), c(id, 'created', 'imported'), c(id, 'edited', 'moved', 'status_changed'), c(id, 'confirmed'), c(id, 'cancelled', 'marked_duplicate'), c(id, 'conflict_override'), c(id, 'message_sent', 'payment_requested'), log.filter((a) => a.actorId === id).length] as Cell[]).sort((a, b) => Number(b[7]) - Number(a[7]));
      return { id, title: 'Staff booking activity', description: 'Audit-trail actions per team member in the period.', summary: [{ label: 'Actions logged', value: String(log.length) }, { label: 'Most active', value: String(rows[0]?.[0] ?? '—') }], columns: ['Staff', 'Created', 'Edited', 'Confirmed', 'Cancelled', 'Overrides', 'Messages', 'Total'], rows, chart: { kind: 'bar', data: rows.map((r) => ({ label: String(r[0]), value: Number(r[7]) })), format: 'count' } };
    }
  }
}
