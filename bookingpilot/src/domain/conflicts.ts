import type { BlockedDate, Booking, BookingStatus, ConflictKind, Resource } from '@/types';
import { addDays, diffDays, fmtDate, fmtRange, nightsBetween, rangesOverlap } from './dates';

/** Statuses that hold dates on the calendar. Inquiries and conflict-review items do not. */
export const HOLDING_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'checked_in', 'checked_out'];
export const holdsDates = (s: BookingStatus) => HOLDING_STATUSES.includes(s);

export interface Candidate {
  id?: string;
  guestId?: string;
  resourceId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  source?: string;
  externalRef?: string;
}

export interface ConflictContext {
  resources: Resource[];
  bookings: Booking[];
  blocks: BlockedDate[];
}

export interface Conflict {
  kind: ConflictKind;
  /** hard = never overridable (double booking, blocked, duplicate). soft = a manager can approve an exception. */
  severity: 'hard' | 'soft';
  message: string;
  otherBookingId?: string;
  blockId?: string;
}

export interface ConflictReport {
  ok: boolean;
  conflicts: Conflict[];
  hasHard: boolean;
  /** True when every conflict is one a manager is allowed to override. */
  overridable: boolean;
}

export const CONFLICT_LABEL: Record<ConflictKind, string> = {
  overlap: 'Overlapping reservation',
  blocked: 'Blocked dates',
  buffer: 'Cleaning / setup buffer',
  min_stay: 'Minimum stay',
  capacity: 'Capacity exceeded',
  duplicate: 'Possible duplicate',
  unavailable: 'Resource unavailable',
};

export const SEVERITY: Record<ConflictKind, 'hard' | 'soft'> = {
  overlap: 'hard', blocked: 'hard', duplicate: 'hard', unavailable: 'hard',
  buffer: 'soft', min_stay: 'soft', capacity: 'soft',
};

export const BLOCK_LABEL: Record<string, string> = {
  maintenance: 'Maintenance', owner_use: 'Owner use', renovation: 'Renovation', private_event: 'Private event', other: 'Blocked',
};

/**
 * The single source of truth for "can this booking hold these dates?".
 * Pure function: no store, no clock. Used by the UI preview, the confirm flow, drag & drop and channel imports.
 */
export function checkBooking(c: Candidate, ctx: ConflictContext): ConflictReport {
  const conflicts: Conflict[] = [];
  const resource = ctx.resources.find((r) => r.id === c.resourceId);
  const push = (kind: ConflictKind, message: string, extra: Partial<Conflict> = {}) =>
    conflicts.push({ kind, severity: SEVERITY[kind], message, ...extra });

  if (!resource) {
    push('unavailable', 'The selected property / resource does not exist.');
    return summarize(conflicts);
  }
  const nights = nightsBetween(c.checkIn, c.checkOut);

  if (resource.status !== 'available') {
    push('unavailable', `${resource.name} is currently marked "${resource.status}" and cannot take bookings.`);
  }

  const others = ctx.bookings.filter((b) => b.resourceId === c.resourceId && b.id !== c.id && holdsDates(b.status));
  const duplicateIds = new Set<string>();

  // Duplicate detection (channel imports, double-entered requests)
  for (const b of ctx.bookings) {
    if (b.id === c.id || b.status === 'cancelled') continue;
    const sameRef = !!c.externalRef && !!b.externalRef && b.externalRef === c.externalRef && b.source === c.source;
    const sameStay = !!c.guestId && b.guestId === c.guestId && b.resourceId === c.resourceId && b.checkIn === c.checkIn && b.checkOut === c.checkOut;
    if (sameRef || sameStay) {
      duplicateIds.add(b.id);
      push('duplicate', sameRef
        ? `Already imported: ${b.ref} carries the same ${c.source} reference (${c.externalRef}).`
        : `${b.ref} is the same guest, property and dates — this looks like a duplicate entry.`, { otherBookingId: b.id });
    }
  }

  for (const b of others) {
    if (duplicateIds.has(b.id)) continue;
    if (rangesOverlap(c.checkIn, c.checkOut, b.checkIn, b.checkOut)) {
      push('overlap', `Overlaps ${b.ref} (${fmtRange(b.checkIn, b.checkOut)}, ${b.status.replace('_', ' ')}).`, { otherBookingId: b.id });
    }
  }

  for (const bl of ctx.blocks) {
    if (bl.resourceId !== c.resourceId) continue;
    if (rangesOverlap(c.checkIn, c.checkOut, bl.startDate, bl.endDate)) {
      push('blocked', `Dates are blocked for ${BLOCK_LABEL[bl.reason].toLowerCase()} (${fmtRange(bl.startDate, bl.endDate)}).`, { blockId: bl.id });
    }
  }

  if (resource.bufferDays > 0) {
    for (const b of others) {
      if (duplicateIds.has(b.id) || rangesOverlap(c.checkIn, c.checkOut, b.checkIn, b.checkOut)) continue;
      const gap = b.checkOut <= c.checkIn ? diffDays(b.checkOut, c.checkIn) : b.checkIn >= c.checkOut ? diffDays(c.checkOut, b.checkIn) : null;
      if (gap !== null && gap < resource.bufferDays) {
        push('buffer', `Only ${gap} empty night${gap === 1 ? '' : 's'} next to ${b.ref}; ${resource.name} needs ${resource.bufferDays} for cleaning/setup.`, { otherBookingId: b.id });
      }
    }
  }

  if (nights < resource.minStay) {
    push('min_stay', `${resource.name} requires at least ${resource.minStay} night${resource.minStay === 1 ? '' : 's'}; this booking is ${nights}.`);
  }
  const party = c.adults + c.children;
  if (party > resource.capacity) {
    push('capacity', `${party} guests exceeds the capacity of ${resource.name} (${resource.capacity}).`);
  }
  return summarize(conflicts);
}

function summarize(conflicts: Conflict[]): ConflictReport {
  const hasHard = conflicts.some((c) => c.severity === 'hard');
  return { ok: conflicts.length === 0, conflicts, hasHard, overridable: conflicts.length > 0 && !hasHard };
}

/** Resources that can take this candidate with zero conflicts. */
export function findAvailableResources(c: Candidate, ctx: ConflictContext, allowed?: string[]): Resource[] {
  return ctx.resources
    .filter((r) => r.id !== c.resourceId && (!allowed || allowed.includes(r.id)))
    .filter((r) => checkBooking({ ...c, resourceId: r.id }, ctx).ok)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Next windows (same length) on the same resource that are conflict-free. */
export function suggestWindows(c: Candidate, ctx: ConflictContext, count = 3, horizon = 240) {
  const nights = nightsBetween(c.checkIn, c.checkOut);
  const out: { checkIn: string; checkOut: string }[] = [];
  for (let off = 1; off <= horizon && out.length < count; off++) {
    const checkIn = addDays(c.checkIn, off);
    const checkOut = addDays(checkIn, nights);
    if (checkBooking({ ...c, checkIn, checkOut }, ctx).ok) {
      out.push({ checkIn, checkOut });
      off += nights; // skip past this window so suggestions are distinct
    }
  }
  return out;
}

/**
 * Bookings that are visibly in conflict on the calendar: overlapping with another booking on the
 * same resource (one of which may be a conflict-review item) or sitting on blocked dates.
 */
export function conflictedBookingIds(bookings: Booking[], blocks: BlockedDate[]): Set<string> {
  const ids = new Set<string>();
  const relevant = bookings.filter((b) => holdsDates(b.status) || b.status === 'conflict_review');
  const byRes = new Map<string, Booking[]>();
  for (const b of relevant) byRes.set(b.resourceId, [...(byRes.get(b.resourceId) ?? []), b]);
  for (const list of byRes.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (rangesOverlap(list[i].checkIn, list[i].checkOut, list[j].checkIn, list[j].checkOut)) {
          ids.add(list[i].id); ids.add(list[j].id);
        }
      }
    }
  }
  for (const b of relevant) {
    if (blocks.some((bl) => bl.resourceId === b.resourceId && rangesOverlap(b.checkIn, b.checkOut, bl.startDate, bl.endDate) && b.status !== 'checked_out')) ids.add(b.id);
  }
  return ids;
}

export function describeConflict(c: Conflict, bookings: Booking[]) {
  const other = c.otherBookingId ? bookings.find((b) => b.id === c.otherBookingId) : undefined;
  return { ...c, other, label: CONFLICT_LABEL[c.kind], when: other ? `${fmtDate(other.checkIn)} → ${fmtDate(other.checkOut)}` : undefined };
}
