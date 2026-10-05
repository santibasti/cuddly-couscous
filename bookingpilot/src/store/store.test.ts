import { beforeEach, describe, expect, it } from 'vitest';
import { useStore, type BookingDraft } from './store';
import { addDays, todayISO } from '@/domain/dates';
import { mockAdapter } from '@/domain/integrations';

const T = todayISO();
const s = () => useStore.getState();
const draft = (over: Partial<BookingDraft> = {}): BookingDraft => ({
  guestId: 'g-1', resourceId: 'res-ov', checkIn: addDays(T, 5), checkOut: addDays(T, 8), adults: 2, children: 0, source: 'phone', status: 'pending',
  items: [{ id: 'i1', description: 'Ocean View Villa · 3 nights', quantity: 3, unitPrice: 14500 }], depositAmount: 20000, notes: '', ...over,
});

beforeEach(() => { s().resetDemo(); s().loginAs('u-ana', 'org-sunrise'); });

describe('conflict-prevention in the store', () => {
  it('refuses to confirm an overlapping booking and returns the conflict', () => {
    const out = s().saveBooking(draft({ status: 'confirmed' })); // overlaps confirmed +3..+7
    expect(out.kind).toBe('conflict');
    if (out.kind === 'conflict') expect(out.report.conflicts.some((c) => c.kind === 'overlap')).toBe(true);
    expect(s().db.bookings.some((b) => b.guestId === 'g-1' && b.checkIn === addDays(T, 5) && b.resourceId === 'res-ov')).toBe(false);
  });
  it('saves a clean booking as confirmed and writes an audit entry', () => {
    const out = s().saveBooking(draft({ status: 'confirmed', checkIn: addDays(T, 45), checkOut: addDays(T, 48) }));
    expect(out.kind).toBe('saved');
    if (out.kind === 'saved') {
      expect(out.booking.status).toBe('confirmed');
      expect(s().db.audit.some((a) => a.bookingId === out.booking.id && a.action === 'confirmed')).toBe(true);
    }
  });
  it('"keep as pending" never confirms and opens alerts', () => {
    const d = draft({ status: 'confirmed' });
    const out = s().saveBooking(d);
    if (out.kind !== 'conflict') throw new Error('expected conflict');
    const res = s().resolveConflict(out.draft, out.report, { type: 'keep_pending' }, out.context);
    expect(res.kind === 'saved' && res.booking.status).toBe('pending');
    expect(s().db.alerts.filter((a) => a.status === 'open').length).toBeGreaterThan(2);
  });
  it('hard conflicts cannot be overridden, even by an owner', () => {
    const out = s().saveBooking(draft({ status: 'confirmed' }));
    if (out.kind !== 'conflict') throw new Error('expected conflict');
    s().loginAs('u-maria', 'org-sunrise');
    const res = s().resolveConflict(out.draft, out.report, { type: 'override', reason: 'VIP' }, out.context);
    expect(res.kind).toBe('error');
  });
  it('soft conflicts (min stay) need manager approval; staff cannot override', () => {
    const d = draft({ checkIn: addDays(T, 60), checkOut: addDays(T, 61), status: 'confirmed' });
    const out = s().saveBooking(d);
    if (out.kind !== 'conflict') throw new Error('expected conflict');
    expect(s().resolveConflict(out.draft, out.report, { type: 'override', reason: 'ok' }, out.context).kind).toBe('error');
    const req = s().resolveConflict(out.draft, out.report, { type: 'request_approval', reason: 'Guest only needs one night' }, out.context);
    if (req.kind !== 'saved') throw new Error('expected saved');
    expect(req.booking.status).toBe('conflict_review');
    s().loginAs('u-carlo', 'org-sunrise');
    const ok = s().approveOverride(req.booking.id, 'Slow week, fine');
    expect(ok.kind === 'saved' && ok.booking.status).toBe('confirmed');
    expect(s().db.audit.some((a) => a.bookingId === req.booking.id && a.action === 'conflict_override')).toBe(true);
  });
  it('moving a booking onto another reservation is refused (drag & drop path)', () => {
    const out = s().moveBooking('bk-009', 'res-ov', addDays(T, 16));
    expect(out.kind).toBe('conflict');
    expect(s().db.bookings.find((b) => b.id === 'bk-009')!.checkIn).toBe(addDays(T, 3));
  });
  it('reconciles alerts when the other booking is cancelled', () => {
    expect(s().db.alerts.filter((a) => a.status === 'open')).toHaveLength(2);
    s().cancelBooking('bk-011', 'Guest cancelled');
    expect(s().db.alerts.filter((a) => a.status === 'open')).toHaveLength(1);
  });
});

describe('permissions', () => {
  it('viewer cannot create; staff cannot touch unassigned properties', () => {
    s().loginAs('u-vince', 'org-sunrise');
    expect(s().saveBooking(draft({ checkIn: addDays(T, 45), checkOut: addDays(T, 48) })).kind).toBe('error');
    s().loginAs('u-ana', 'org-sunrise');
    expect(s().saveBooking(draft({ resourceId: 'res-gs', checkIn: addDays(T, 45), checkOut: addDays(T, 47) })).kind).toBe('error');
  });
});

describe('channel imports', () => {
  it('imports once, skips duplicates, flags clashes, reports unmapped listings', async () => {
    s().loginAs('u-maria', 'org-sunrise');
    const ad = mockAdapter('booking_com');
    const ch = () => s().db.channels.find((c) => c.id === 'ch-booking_com')!;
    const b1 = await ad.fetchBookings(ch(), { today: T });
    const r1 = s().importBatch('ch-booking_com', b1.bookings, b1.nextCursor);
    expect(r1.imported).toBe(3);
    const b2 = await ad.fetchBookings(ch(), { today: T });
    const r2 = s().importBatch('ch-booking_com', b2.bookings, b2.nextCursor);
    expect(r2.duplicates).toBe(1);
    expect(r2.conflicts).toBe(1);
    expect(r2.imported).toBe(2);
    // replaying the first batch imports nothing
    const r3 = s().importBatch('ch-booking_com', b1.bookings);
    expect(r3.imported).toBe(0);
    expect(r3.duplicates).toBe(3);
    // Agoda's Garden Suite listing is unmapped
    const ag = mockAdapter('agoda');
    const a1 = await ag.fetchBookings(s().db.channels.find((c) => c.id === 'ch-agoda')!, { today: T });
    expect(s().importBatch('ch-agoda', a1.bookings, a1.nextCursor).errors).toHaveLength(1);
  }, 15000);
});
