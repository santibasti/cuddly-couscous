import { describe, expect, it } from 'vitest';
import { buildSeed, ORG1 } from '@/data/seed';
import { checkBooking, conflictedBookingIds, findAvailableResources, suggestWindows } from './conflicts';
import { addDays } from './dates';

const TODAY = '2026-10-05';
const db = buildSeed(TODAY);
const ctx = () => ({ resources: db.resources.filter((r) => r.orgId === ORG1), bookings: db.bookings.filter((b) => b.orgId === ORG1), blocks: db.blocks.filter((b) => b.orgId === ORG1) });
const base = { adults: 2, children: 0, guestId: 'g-new' };

describe('seed data', () => {
  it('has the requested shape', () => {
    const bs = db.bookings.filter((b) => b.orgId === ORG1);
    expect(bs.length).toBeGreaterThanOrEqual(20);
    expect(bs.filter((b) => b.status === 'pending')).toHaveLength(3);
    expect(bs.filter((b) => b.status === 'conflict_review')).toHaveLength(2);
    expect(new Set(bs.map((b) => b.source)).size).toBeGreaterThanOrEqual(5);
    expect(db.resources.filter((r) => r.orgId === ORG1).map((r) => r.name)).toEqual(['Ocean View Villa', 'Villa 02', 'Villa 03', 'Beach House', 'Garden Suite']);
  });
  it('contains exactly the two intended conflicts and nothing else', () => {
    const { bookings, blocks } = ctx();
    expect(conflictedBookingIds(bookings, blocks).size).toBe(4); // 2 pairs
  });
  it('every non-conflict booking passes the engine against everything else', () => {
    const c = ctx();
    for (const b of c.bookings.filter((x) => ['pending', 'confirmed', 'checked_in'].includes(x.status))) {
      const r = checkBooking(b, c);
      // Only hard problems matter for integrity of seed data; min stay/capacity must hold too
      expect(r.conflicts.filter((x) => x.kind !== 'duplicate'), b.ref).toEqual([]);
    }
  });
});

describe('checkBooking', () => {
  it('allows same-day turnover (check-out day is free for the next check-in)', () => {
    const c = ctx();
    const ov = c.bookings.find((b) => b.id === 'bk-008')!; // Ocean View checked_in, ends +2
    const r = checkBooking({ ...base, resourceId: ov.resourceId, checkIn: ov.checkOut, checkOut: addDays(ov.checkOut, 1) }, c);
    expect(r.conflicts.find((x) => x.kind === 'overlap')).toBeUndefined();
  });
  it('detects overlaps with confirmed and pending bookings', () => {
    const c = ctx();
    const ov = c.bookings.find((b) => b.id === 'bk-009')!; // confirmed +3..+7
    const r = checkBooking({ ...base, resourceId: ov.resourceId, checkIn: addDays(TODAY, 5), checkOut: addDays(TODAY, 8) }, c);
    expect(r.ok).toBe(false);
    expect(r.hasHard).toBe(true);
    const pend = checkBooking({ ...base, resourceId: ov.resourceId, checkIn: addDays(TODAY, 10), checkOut: addDays(TODAY, 12) }, c);
    expect(pend.conflicts.some((x) => x.kind === 'overlap')).toBe(true);
  });
  it('ignores cancelled bookings and the booking itself', () => {
    const c = ctx();
    const cancelled = c.bookings.find((b) => b.status === 'cancelled')!;
    const r = checkBooking({ ...base, resourceId: cancelled.resourceId, checkIn: cancelled.checkIn, checkOut: addDays(cancelled.checkIn, 1) }, { ...c });
    // v3 +11..+14 confirmed also sits there, so only assert the cancelled one is not named
    expect(r.conflicts.some((x) => x.otherBookingId === cancelled.id)).toBe(false);
    const self = c.bookings.find((b) => b.id === 'bk-009')!;
    expect(checkBooking(self, c).ok).toBe(true);
  });
  it('blocks maintenance / owner-use dates', () => {
    const c = ctx();
    const r = checkBooking({ ...base, resourceId: 'res-gs', checkIn: addDays(TODAY, 12), checkOut: addDays(TODAY, 14) }, c);
    expect(r.conflicts.some((x) => x.kind === 'blocked')).toBe(true);
    expect(r.overridable).toBe(false);
  });
  it('enforces the cleaning buffer (soft)', () => {
    const c = ctx();
    const bh = c.bookings.find((b) => b.id === 'bk-045')!; // BH +6..+10 confirmed
    const r = checkBooking({ ...base, resourceId: 'res-bh', checkIn: bh.checkOut, checkOut: addDays(bh.checkOut, 3) }, c);
    expect(r.conflicts.some((x) => x.kind === 'buffer')).toBe(true);
    const ok = checkBooking({ ...base, resourceId: 'res-bh', checkIn: addDays(bh.checkOut, 1), checkOut: addDays(bh.checkOut, 4) }, c);
    expect(ok.conflicts.some((x) => x.kind === 'buffer')).toBe(false);
  });
  it('enforces minimum stay and capacity (soft, overridable)', () => {
    const c = ctx();
    const r = checkBooking({ ...base, adults: 5, children: 2, resourceId: 'res-gs', checkIn: addDays(TODAY, 40), checkOut: addDays(TODAY, 41) }, c);
    expect(r.conflicts.map((x) => x.kind).sort()).toEqual(['capacity']);
    const m = checkBooking({ ...base, resourceId: 'res-ov', checkIn: addDays(TODAY, 60), checkOut: addDays(TODAY, 61) }, c);
    expect(m.conflicts.map((x) => x.kind)).toEqual(['min_stay']);
    expect(m.overridable).toBe(true);
  });
  it('flags duplicate channel imports by external reference', () => {
    const c = ctx();
    const existing = c.bookings.find((b) => b.externalRef)!;
    const r = checkBooking({ ...base, source: existing.source, externalRef: existing.externalRef, resourceId: 'res-v3', checkIn: addDays(TODAY, 70), checkOut: addDays(TODAY, 73) }, c);
    expect(r.conflicts.some((x) => x.kind === 'duplicate')).toBe(true);
    expect(r.hasHard).toBe(true);
  });
  it('rejects unavailable resources', () => {
    const c = ctx();
    const resources = c.resources.map((r) => (r.id === 'res-v2' ? { ...r, status: 'maintenance' as const } : r));
    expect(checkBooking({ ...base, resourceId: 'res-v2', checkIn: addDays(TODAY, 90), checkOut: addDays(TODAY, 93) }, { ...c, resources }).hasHard).toBe(true);
  });
});

describe('alternatives', () => {
  it('suggests other free properties and next windows', () => {
    const c = ctx();
    const cand = { ...base, resourceId: 'res-ov', checkIn: addDays(TODAY, 16), checkOut: addDays(TODAY, 19) };
    expect(checkBooking(cand, c).ok).toBe(false);
    const alts = findAvailableResources(cand, c);
    expect(alts.length).toBeGreaterThan(0);
    for (const a of alts) expect(checkBooking({ ...cand, resourceId: a.id }, c).ok).toBe(true);
    const wins = suggestWindows(cand, c);
    expect(wins.length).toBe(3);
    for (const w of wins) expect(checkBooking({ ...cand, ...w }, c).ok).toBe(true);
  });
});
