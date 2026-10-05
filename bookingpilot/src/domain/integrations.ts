/**
 * Channel integration layer.
 *
 * Every channel implements ChannelAdapter and returns normalised ExternalBooking records. The store takes care of
 * mapping listings → resources, duplicate detection and the availability check, so a real Booking.com / Agoda API,
 * an iCal feed, a webhook handler or an email parser only needs to produce ExternalBooking[]; nothing else changes.
 */
import type { Channel, Source } from '@/types';
import { addDays } from './dates';

export interface ExternalBooking {
  externalRef: string;
  listingId: string;
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  nationality?: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  totalAmount: number;
  notes?: string;
}

export interface ChannelAdapter {
  type: Source;
  /** Fetch the next page of bookings. `cursor` lets a real adapter resume from where it stopped. */
  fetchBookings(channel: Channel, ctx: { today: string }): Promise<{ bookings: ExternalBooking[]; nextCursor: number }>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Mock feeds: each sync returns the next batch. Batch 2 re-sends a reference already imported (duplicate) and contains a clash. */
function mockFeed(type: 'booking_com' | 'agoda', today: string): ExternalBooking[][] {
  const d = (n: number) => addDays(today, n);
  const p = type === 'booking_com' ? 'BDC-' : 'AGD-';
  const L = type === 'booking_com'
    ? { ov: 'BDC-88231', v2: 'BDC-88232', v3: 'BDC-88233', bh: 'BDC-88240', gs: 'BDC-88250' }
    : { ov: 'AGD-5510', v2: 'AGD-5511', v3: 'AGD-5512', bh: 'AGD-5520', gs: 'AGD-5521' };
  const o = type === 'booking_com' ? 0 : 1;
  return [
    [
      { externalRef: `${p}9${o}0011`, listingId: L.v3, guestName: 'Natalia Petrova', guestEmail: 'natalia.p@example.com', guestPhone: '+7 916 555 01 22', nationality: 'Russia', checkIn: d(24), checkOut: d(27), adults: 2, children: 0, totalAmount: 31500, notes: 'Late arrival ~10pm' },
      { externalRef: `${p}9${o}0012`, listingId: L.gs, guestName: 'Arjun Mehta', guestEmail: 'arjun.mehta@example.com', nationality: 'India', checkIn: d(30), checkOut: d(33), adults: 2, children: 0, totalAmount: 21000 },
      { externalRef: `${p}9${o}0013`, listingId: L.v2, guestName: 'Chloe Dubois', guestEmail: 'chloe.d@example.com', guestPhone: '+33 6 55 50 11 90', nationality: 'France', checkIn: d(41), checkOut: d(44), adults: 2, children: 1, totalAmount: 33750 },
    ],
    [
      // already imported earlier -> duplicate
      { externalRef: `${p}9${o}0011`, listingId: L.v3, guestName: 'Natalia Petrova', guestEmail: 'natalia.p@example.com', nationality: 'Russia', checkIn: d(24), checkOut: d(27), adults: 2, children: 0, totalAmount: 31500 },
      // clashes with a confirmed Ocean View booking (d(24)..d(28))
      { externalRef: `${p}9${o}0021`, listingId: L.ov, guestName: 'Ethan Brooks', guestEmail: 'ethan.brooks@example.com', nationality: 'United States', checkIn: d(26), checkOut: d(29), adults: 3, children: 0, totalAmount: 49500 },
      { externalRef: `${p}9${o}0022`, listingId: L.bh, guestName: 'Yuki Sato', guestEmail: 'yuki.sato@example.com', nationality: 'Japan', checkIn: d(36), checkOut: d(40), adults: 6, children: 0, totalAmount: 81000 },
    ],
  ];
}

export const mockAdapter = (type: 'booking_com' | 'agoda'): ChannelAdapter => ({
  type,
  async fetchBookings(channel, { today }) {
    await sleep(900 + Math.random() * 600);
    const batches = mockFeed(type, today);
    const batch = batches[channel.syncCursor] ?? [];
    return { bookings: batch, nextCursor: Math.min(channel.syncCursor + 1, batches.length) };
  },
});

/** Minimal iCal (RFC 5545) parser — enough for Google Calendar / Airbnb / VRBO availability feeds. */
export function parseIcs(text: string, listingId = 'ical'): ExternalBooking[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const events = unfolded.split('BEGIN:VEVENT').slice(1);
  const toDay = (v: string) => { const m = v.match(/(\d{4})(\d{2})(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : ''; };
  const out: ExternalBooking[] = [];
  for (const ev of events) {
    const body = ev.split('END:VEVENT')[0];
    const field = (name: string) => body.match(new RegExp(`^${name}[^:\\n]*:(.*)$`, 'm'))?.[1]?.trim() ?? '';
    const checkIn = toDay(field('DTSTART'));
    const checkOut = toDay(field('DTEND')) || addDays(checkIn, 1);
    if (!checkIn) continue;
    out.push({ externalRef: field('UID') || `ics-${checkIn}`, listingId, guestName: field('SUMMARY') || 'iCal reservation', checkIn, checkOut, adults: 1, children: 0, totalAmount: 0, notes: field('DESCRIPTION') });
  }
  return out;
}

export function adapterFor(type: Source): ChannelAdapter | undefined {
  if (type === 'booking_com' || type === 'agoda') return mockAdapter(type);
  return undefined;
}
