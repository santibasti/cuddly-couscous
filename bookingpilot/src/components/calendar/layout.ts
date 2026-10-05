import type { BlockedDate, Booking } from '@/types';
import { diffDays } from '@/domain/dates';

export interface Placed<T> { item: T; kind: 'booking' | 'block'; s: number; e: number; lane: number; clippedL: boolean; clippedR: boolean }

/** Greedy lane assignment so overlapping reservations stack instead of hiding each other. Bars run from mid check-in day to mid check-out day. */
export function layoutRow(bookings: Booking[], blocks: BlockedDate[], start: string, days: number) {
  const items: Omit<Placed<Booking | BlockedDate>, 'lane'>[] = [];
  for (const b of bookings) {
    const s = diffDays(start, b.checkIn) + 0.5;
    const e = diffDays(start, b.checkOut) + 0.5;
    if (e <= 0 || s >= days) continue;
    items.push({ item: b, kind: 'booking', s: Math.max(0, s), e: Math.min(days, e), clippedL: s < 0, clippedR: e > days });
  }
  for (const bl of blocks) {
    const s = diffDays(start, bl.startDate);
    const e = diffDays(start, bl.endDate);
    if (e <= 0 || s >= days) continue;
    items.push({ item: bl, kind: 'block', s: Math.max(0, s), e: Math.min(days, e), clippedL: s < 0, clippedR: e > days });
  }
  items.sort((a, b) => a.s - b.s || a.e - b.e);
  const laneEnds: number[] = [];
  const placed: Placed<Booking | BlockedDate>[] = items.map((it) => {
    let lane = laneEnds.findIndex((end) => end <= it.s + 1e-6);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.e); } else laneEnds[lane] = it.e;
    return { ...it, lane };
  });
  return { placed, lanes: Math.max(1, laneEnds.length) };
}
