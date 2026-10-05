import type {
  AuditLog, Booking, BookingPayment, BookingStatus, Channel, ConflictAlert, Conversation, Database, Guest, GuestTag,
  Message, MessageTemplate, Organization, Resource, Source, TeamMember, UserProfile, BookingNote, PaymentMethod,
} from '@/types';
import { addDays, nightsBetween } from '@/domain/dates';
import { SOURCE_META } from '@/domain/meta';

export const DEMO_PASSWORD = 'demo123';
export const ORG1 = 'org-sunrise';
export const ORG2 = 'org-wheels';

const stamp = (day: string, hourUtc = 2, min = 0) => `${day}T${String(hourUtc).padStart(2, '0')}:${String(min).padStart(2, '0')}:00.000Z`;

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const DEFAULT_TEMPLATES = (orgId: string): MessageTemplate[] => [
  { id: `${orgId}-tpl-avail`, orgId, key: 'availability', name: 'Availability reply', body: 'Hi {{guest}}! Thanks for your interest in {{business}}. {{property}} is available from {{checkIn}} to {{checkOut}} ({{nights}} nights) at {{total}} in total. Would you like us to hold the dates for you? A {{deposit}} deposit secures the booking.' },
  { id: `${orgId}-tpl-pay`, orgId, key: 'payment_reminder', name: 'Payment reminder', body: 'Hi {{guest}}, a friendly reminder that the deposit of {{deposit}} for booking {{ref}} ({{property}}, {{checkIn}} – {{checkOut}}) is still pending. Please send your proof of payment so we can confirm your stay. Thank you!' },
  { id: `${orgId}-tpl-conf`, orgId, key: 'booking_confirmation', name: 'Booking confirmation', body: 'Hi {{guest}}, your booking {{ref}} at {{business}} is CONFIRMED! {{property}} · {{checkIn}} → {{checkOut}} ({{nights}} nights) · Total {{total}}. We can’t wait to host you. Questions? Call {{phone}}.' },
  { id: `${orgId}-tpl-checkin`, orgId, key: 'check_in', name: 'Check-in instructions', body: 'Hi {{guest}}, we’re ready for your arrival on {{checkIn}}! Check-in starts at 2:00 PM. Please message us when you’re 30 minutes away and bring a valid ID. Booking ref: {{ref}}.' },
  { id: `${orgId}-tpl-cancel`, orgId, key: 'cancellation_policy', name: 'Cancellation policy', body: 'Hi {{guest}}, our cancellation policy: free cancellation up to 7 days before check-in; within 7 days the deposit is non-refundable; no-shows are charged the full stay. Let us know if you have any questions!' },
];

type Plan = 'full' | 'dep' | 'none';
// [resource, startOffset, nights, guest, source, status, adults, children, payment, assignee(0 ana,1 ben,2 carlo)]
type Row = [string, number, number, number, Source, BookingStatus, number, number, Plan, number];

const ROWS: Row[] = [
  // Ocean View Villa
  ['ov', -41, 4, 0, 'booking_com', 'checked_out', 2, 2, 'full', 0], ['ov', -35, 3, 1, 'agoda', 'checked_out', 2, 0, 'full', 0],
  ['ov', -30, 5, 2, 'website', 'checked_out', 4, 2, 'full', 0], ['ov', -23, 4, 3, 'facebook', 'checked_out', 2, 2, 'full', 0],
  ['ov', -17, 3, 4, 'booking_com', 'checked_out', 3, 0, 'full', 0], ['ov', -12, 4, 0, 'website', 'checked_out', 2, 2, 'full', 1],
  ['ov', -7, 4, 5, 'manual', 'checked_out', 4, 0, 'full', 0], ['ov', -2, 4, 6, 'agoda', 'checked_in', 2, 0, 'dep', 0],
  ['ov', 3, 4, 7, 'booking_com', 'confirmed', 2, 2, 'none', 0], ['ov', 9, 3, 8, 'facebook', 'pending', 2, 0, 'none', 0],
  ['ov', 15, 5, 9, 'agoda', 'confirmed', 4, 0, 'dep', 1], ['ov', 17, 3, 10, 'booking_com', 'conflict_review', 2, 0, 'none', 2],
  ['ov', 24, 4, 11, 'website', 'confirmed', 2, 2, 'dep', 0], ['ov', 33, 3, 1, 'website', 'pending', 2, 0, 'none', 0],
  // Villa 02
  ['v2', -38, 3, 12, 'booking_com', 'checked_out', 2, 0, 'full', 0], ['v2', -32, 4, 13, 'agoda', 'checked_out', 2, 1, 'full', 0],
  ['v2', -26, 2, 14, 'phone', 'checked_out', 2, 0, 'full', 1], ['v2', -20, 5, 2, 'website', 'checked_out', 3, 0, 'full', 0],
  ['v2', -13, 3, 15, 'facebook', 'checked_out', 2, 0, 'full', 0], ['v2', -8, 4, 3, 'booking_com', 'checked_out', 2, 2, 'full', 0],
  ['v2', -1, 3, 16, 'website', 'checked_in', 2, 0, 'dep', 1], ['v2', 4, 3, 4, 'agoda', 'confirmed', 2, 0, 'none', 0],
  ['v2', 8, 4, 17, 'whatsapp', 'confirmed', 3, 0, 'dep', 1], ['v2', 14, 3, 5, 'phone', 'pending', 2, 0, 'none', 1],
  ['v2', 20, 4, 6, 'booking_com', 'confirmed', 2, 0, 'none', 0], ['v2', 27, 3, 0, 'website', 'confirmed', 2, 1, 'dep', 0],
  // Villa 03
  ['v3', -36, 4, 8, 'booking_com', 'checked_out', 3, 0, 'full', 0], ['v3', -29, 3, 9, 'agoda', 'checked_out', 2, 0, 'full', 0],
  ['v3', -22, 5, 10, 'website', 'checked_out', 4, 0, 'full', 1], ['v3', -15, 3, 11, 'manual', 'checked_out', 2, 2, 'full', 0],
  ['v3', -9, 3, 13, 'facebook', 'checked_out', 2, 0, 'full', 0], ['v3', -4, 3, 14, 'booking_com', 'checked_out', 2, 0, 'full', 0],
  ['v3', 0, 4, 15, 'website', 'confirmed', 2, 1, 'dep', 0], ['v3', 6, 3, 16, 'booking_com', 'confirmed', 2, 0, 'none', 0],
  ['v3', 11, 4, 12, 'agoda', 'cancelled', 2, 0, 'none', 0], ['v3', 11, 3, 7, 'facebook', 'confirmed', 2, 0, 'dep', 0],
  ['v3', 18, 5, 2, 'website', 'confirmed', 3, 0, 'dep', 0],
  // Beach House (3-night minimum, 1-night buffer)
  ['bh', -40, 4, 17, 'booking_com', 'checked_out', 6, 2, 'full', 0], ['bh', -34, 5, 3, 'agoda', 'checked_out', 6, 0, 'full', 0],
  ['bh', -27, 3, 4, 'website', 'checked_out', 5, 0, 'full', 0], ['bh', -20, 4, 5, 'facebook', 'checked_out', 6, 2, 'full', 1],
  ['bh', -13, 3, 6, 'booking_com', 'checked_out', 5, 0, 'full', 0], ['bh', -7, 5, 0, 'manual', 'checked_out', 6, 2, 'full', 0],
  ['bh', 0, 4, 9, 'whatsapp', 'checked_in', 6, 0, 'dep', 1], ['bh', 6, 4, 10, 'agoda', 'confirmed', 6, 0, 'dep', 0],
  ['bh', 12, 3, 1, 'booking_com', 'confirmed', 5, 0, 'none', 0], ['bh', 14, 3, 18, 'facebook', 'conflict_review', 4, 0, 'none', 1],
  ['bh', 20, 5, 13, 'website', 'confirmed', 6, 0, 'dep', 0], ['bh', 28, 3, 7, 'booking_com', 'confirmed', 5, 0, 'none', 0],
  // Garden Suite
  ['gs', -39, 2, 14, 'booking_com', 'checked_out', 2, 0, 'full', 0], ['gs', -33, 3, 15, 'agoda', 'checked_out', 2, 0, 'full', 0],
  ['gs', -27, 2, 16, 'website', 'checked_out', 2, 0, 'full', 0], ['gs', -21, 4, 12, 'manual', 'checked_out', 2, 0, 'full', 1],
  ['gs', -17, 2, 19, 'booking_com', 'no_show', 2, 0, 'none', 0], ['gs', -14, 2, 11, 'booking_com', 'checked_out', 2, 0, 'full', 0],
  ['gs', -10, 3, 17, 'facebook', 'checked_out', 2, 0, 'full', 0], ['gs', -5, 3, 3, 'phone', 'checked_out', 2, 0, 'full', 1],
  ['gs', -1, 4, 18, 'walk_in', 'checked_in', 2, 0, 'full', 1], ['gs', 5, 2, 9, 'booking_com', 'confirmed', 2, 0, 'none', 0],
  ['gs', 8, 3, 4, 'agoda', 'confirmed', 2, 0, 'dep', 0], ['gs', 16, 3, 2, 'website', 'confirmed', 2, 0, 'dep', 0],
];

const GUESTS: [string, string, string, string, GuestTag[], string][] = [
  ['Isabella Marquez', '+63 917 555 0101', 'isabella.marquez@example.com', 'Philippines', ['VIP', 'Repeat Guest'], 'Prefers Ocean View Villa. Allergic to shellfish — tell the kitchen.'],
  ['Daniel Whitmore', '+44 7700 900123', 'daniel.whitmore@example.com', 'United Kingdom', [], ''],
  ['Hiroshi Tanaka', '+81 90 5550 2211', 'h.tanaka@example.com', 'Japan', ['Repeat Guest'], 'Visits every surf season. Early check-in requests are common.'],
  ['Katarina Novak', '+420 601 555 018', 'k.novak@example.com', 'Czechia', ['Repeat Guest'], ''],
  ['Rafael Dela Cruz', '+63 918 555 0144', '', 'Philippines', ['Corporate'], 'Books for the Cebu Pacific ops team — invoice to company.'],
  ['Sofia Lindqvist', '+46 70 555 01 33', 'sofia.l@example.com', 'Sweden', [], ''],
  ['Marcus Chen', '+65 9123 5501', 'marcus.chen@example.com', 'Singapore', [], ''],
  ['Angelica Ramos', '+63 920 555 0188', 'angelica.ramos@example.com', 'Philippines', ['VIP'], 'Celebrating anniversary — arrange flowers.'],
  ['Oliver Schmidt', '+49 151 5550 1122', 'oliver.schmidt@example.com', 'Germany', [], ''],
  ['Priya Nair', '+91 98100 55501', 'priya.nair@example.com', 'India', [], 'Vegetarian.'],
  ['Jonathan Bautista', '+63 917 555 0166', 'jbautista@example.com', 'Philippines', ['Needs Follow-up'], 'Asked about a refund after the Booking.com listing was double-sold — call him.'],
  ['Emma Fitzgerald', '+61 412 555 019', 'emma.fitz@example.com', 'Australia', ['Repeat Guest'], ''],
  ['Lucas Moreau', '+33 6 12 55 50 21', 'lucas.moreau@example.com', 'France', [], ''],
  ['Ji-woo Park', '+82 10 5550 3344', 'jiwoo.park@example.com', 'South Korea', [], ''],
  ['Camille Villanueva', '+63 915 555 0102', '', 'Philippines', [], ''],
  ['Thomas Anderson', '+1 415 555 0132', 'thomas.anderson@example.com', 'United States', ['Needs Follow-up'], 'Left a lost-and-found item (sunglasses).'],
  ['Hannah Weiss', '', 'hannah.weiss@example.com', 'Austria', [], 'No phone on file — ask at check-in.'],
  ['Miguel Torres', '+63 927 555 0177', 'miguel.torres@example.com', 'Philippines', [], ''],
  ['Sarah Johnson', '+1 604 555 0188', 'sarah.johnson@example.com', 'Canada', [], ''],
  ['Kevin O’Brien', '+353 85 555 0190', 'kevin.obrien@example.com', 'Ireland', ['Blacklist'], 'No-show on 2 bookings, disputed the charge.'],
  ['Grace Mendoza', '+63 919 555 0120', 'grace.mendoza@example.com', 'Philippines', [], ''],
  ['Tomás Alvarez', '+34 612 555 021', '', 'Spain', [], ''],
];

const ID = {
  org: ORG1,
  res: { ov: 'res-ov', v2: 'res-v2', v3: 'res-v3', bh: 'res-bh', gs: 'res-gs' } as Record<string, string>,
};

export function buildSeed(today: string): Database {
  const d = (n: number) => addDays(today, n);
  const rand = rng(20261005);
  const peso50 = (n: number) => Math.round(n / 50) * 50;

  const organizations: Organization[] = [
    {
      id: ORG1, name: 'Sunrise Villas & Suites', slug: 'sunrise', timezone: 'Asia/Manila', currency: 'PHP', tagline: 'Beachfront stays in Siargao',
      contactPhone: '+63 917 800 1234', contactEmail: 'reservations@sunrisevillas.example', depositPercent: 50,
      paymentInstructions: 'Pay via GCash 0917 800 1234 (Sunrise Villas Inc.) or BDO Savings 0012-3456-7890. Send your proof of payment and booking reference to our reservations team.',
      checkInInstructions: 'Check-in is from 2:00 PM and check-out is by 11:00 AM. Please bring a valid government ID. Our front desk at the beach entrance is open 7 AM – 10 PM; message us if you will arrive later.',
      cancellationPolicy: 'Free cancellation up to 7 days before check-in. Within 7 days the deposit is non-refundable. No-shows are charged the full stay.',
    },
    {
      id: ORG2, name: 'Island Wheels Rentals', slug: 'island-wheels', timezone: 'Asia/Manila', currency: 'PHP', tagline: 'Vans, SUVs and scooters for island trips',
      contactPhone: '+63 928 700 4455', contactEmail: 'rent@islandwheels.example', depositPercent: 30,
      paymentInstructions: 'Pay the deposit via GCash 0928 700 4455 (Island Wheels). Balance is collected in cash on pickup together with a ₱5,000 refundable security deposit.',
      checkInInstructions: 'Pickup is at the Depot from 8:00 AM. Bring your driver’s license and one valid ID. Return the vehicle with the same fuel level.',
      cancellationPolicy: 'Free cancellation up to 48 hours before pickup. After that the deposit is forfeited.',
    },
  ];

  const users: UserProfile[] = [
    { id: 'u-maria', email: 'owner@sunrise.ph', name: 'Maria Santos', password: DEMO_PASSWORD },
    { id: 'u-carlo', email: 'manager@sunrise.ph', name: 'Carlo Reyes', password: DEMO_PASSWORD },
    { id: 'u-ana', email: 'staff@sunrise.ph', name: 'Ana Lim', password: DEMO_PASSWORD },
    { id: 'u-ben', email: 'ben@sunrise.ph', name: 'Ben Cruz', password: DEMO_PASSWORD },
    { id: 'u-vince', email: 'viewer@sunrise.ph', name: 'Vince Tan', password: DEMO_PASSWORD },
  ];

  const members: TeamMember[] = [
    { id: 'tm-maria', orgId: ORG1, userId: 'u-maria', role: 'owner', resourceIds: [], active: true },
    { id: 'tm-carlo', orgId: ORG1, userId: 'u-carlo', role: 'manager', resourceIds: [], active: true },
    { id: 'tm-ana', orgId: ORG1, userId: 'u-ana', role: 'staff', resourceIds: [ID.res.ov, ID.res.v2, ID.res.v3], active: true },
    { id: 'tm-ben', orgId: ORG1, userId: 'u-ben', role: 'staff', resourceIds: [ID.res.bh, ID.res.gs], active: true },
    { id: 'tm-vince', orgId: ORG1, userId: 'u-vince', role: 'viewer', resourceIds: [], active: true },
    { id: 'tm2-maria', orgId: ORG2, userId: 'u-maria', role: 'owner', resourceIds: [], active: true },
    { id: 'tm2-carlo', orgId: ORG2, userId: 'u-carlo', role: 'viewer', resourceIds: [], active: true },
  ];
  const assignees = ['tm-ana', 'tm-ben', 'tm-carlo'];

  const properties = [
    { id: 'prop-compound', orgId: ORG1, name: 'Sunrise Beachfront Compound', address: 'Tourism Road, General Luna, Siargao Island' },
    { id: 'prop-garden', orgId: ORG1, name: 'Sunrise Garden Wing', address: 'Purok 4, General Luna, Siargao Island' },
    { id: 'prop-depot', orgId: ORG2, name: 'Island Wheels Depot', address: 'Dapa Port Road, Siargao Island' },
  ];

  const R = (r: Partial<Resource> & Pick<Resource, 'id' | 'orgId' | 'propertyId' | 'name' | 'type' | 'capacity' | 'baseRate' | 'color' | 'sortOrder'>): Resource => ({
    description: '', photos: [], minStay: 1, bufferDays: 0, status: 'available', amenities: [], notes: '', ...r,
  });
  const resources: Resource[] = [
    R({ id: ID.res.ov, orgId: ORG1, propertyId: 'prop-compound', name: 'Ocean View Villa', type: 'villa', capacity: 6, baseRate: 14500, minStay: 2, color: '#0ea5e9', sortOrder: 1,
      description: 'Three-bedroom beachfront villa with infinity plunge pool and a private deck facing the surf break.', amenities: ['Pool', 'Beachfront', 'Air-con', 'Kitchen', 'WiFi', 'Breakfast'], notes: 'Pool pump serviced every Monday morning.' }),
    R({ id: ID.res.v2, orgId: ORG1, propertyId: 'prop-compound', name: 'Villa 02', type: 'villa', capacity: 4, baseRate: 9800, minStay: 2, color: '#6366f1', sortOrder: 2,
      description: 'Two-bedroom garden villa a short walk from the beach.', amenities: ['Air-con', 'Kitchen', 'WiFi', 'Garden'] }),
    R({ id: ID.res.v3, orgId: ORG1, propertyId: 'prop-compound', name: 'Villa 03', type: 'villa', capacity: 4, baseRate: 9800, minStay: 2, color: '#14b8a6', sortOrder: 3,
      description: 'Two-bedroom villa with an outdoor shower and hammock lounge.', amenities: ['Air-con', 'Kitchen', 'WiFi', 'Outdoor shower'] }),
    R({ id: ID.res.bh, orgId: ORG1, propertyId: 'prop-compound', name: 'Beach House', type: 'rental_unit', capacity: 8, baseRate: 18500, minStay: 3, bufferDays: 1, color: '#f59e0b', sortOrder: 4,
      description: 'Four-bedroom family house on the sand. Needs a full deep clean between guests.', amenities: ['Beachfront', 'BBQ area', 'Air-con', 'Kitchen', 'WiFi', 'Parking'], notes: 'One empty night required between stays for deep clean.' }),
    R({ id: ID.res.gs, orgId: ORG1, propertyId: 'prop-garden', name: 'Garden Suite', type: 'room', capacity: 2, baseRate: 6200, minStay: 1, color: '#ec4899', sortOrder: 5,
      description: 'Romantic suite with a private garden bath.', amenities: ['Air-con', 'Garden bath', 'WiFi', 'Breakfast'] }),
    R({ id: 'res-van', orgId: ORG2, propertyId: 'prop-depot', name: 'Toyota Hiace Van', type: 'vehicle', capacity: 12, baseRate: 4500, color: '#0ea5e9', sortOrder: 1, description: '12-seater van with driver option.', amenities: ['Air-con', 'Driver available'] }),
    R({ id: 'res-montero', orgId: ORG2, propertyId: 'prop-depot', name: 'Montero Sport', type: 'vehicle', capacity: 7, baseRate: 3800, color: '#6366f1', sortOrder: 2, amenities: ['Air-con', '4x4'] }),
    R({ id: 'res-scooter', orgId: ORG2, propertyId: 'prop-depot', name: 'Honda Click 150', type: 'vehicle', capacity: 2, baseRate: 600, color: '#14b8a6', sortOrder: 3, amenities: ['Helmet x2'] }),
    R({ id: 'res-drone', orgId: ORG2, propertyId: 'prop-depot', name: 'Drone & Camera Kit', type: 'equipment', capacity: 1, baseRate: 2500, bufferDays: 1, color: '#f59e0b', sortOrder: 4, notes: 'Battery charge + sensor clean between rentals.' }),
  ];

  // ---------------- guests
  const guests: Guest[] = GUESTS.map(([fullName, mobile, email, nationality, tags, notes], i) => ({
    id: `g-${i}`, orgId: ORG1, fullName, mobile, email, nationality, notes, tags,
    createdAt: stamp(d(-60 + i)),
  }));
  guests[0].preferredResourceId = ID.res.ov; guests[2].preferredResourceId = ID.res.ov; guests[3].preferredResourceId = ID.res.bh;
  guests[11].preferredResourceId = ID.res.v3;

  // ---------------- bookings
  const bookings: Booking[] = [];
  const payments: BookingPayment[] = [];
  const audit: AuditLog[] = [];
  const alerts: ConflictAlert[] = [];
  const notes: BookingNote[] = [];
  const todayCreate = new Set([9, 11, 46]); // index into ROWS that are "created today"
  const rateMult: Partial<Record<Source, number>> = { booking_com: 1.08, agoda: 1.04, airbnb: 1.1, website: 0.97, walk_in: 1.0, phone: 1.0 };
  const resBase = Object.fromEntries(resources.map((r) => [r.id, r]));

  ROWS.forEach((row, i) => {
    const [rk, start, nights, gi, source, status, adults, children, plan, ai] = row;
    const resourceId = ID.res[rk];
    const res = resBase[resourceId];
    const checkIn = d(start);
    const checkOut = addDays(checkIn, nights);
    const rate = peso50(res.baseRate * (rateMult[source] ?? 1));
    const items = [{ id: `bi-${i}-1`, description: `${res.name} · ${nights} night${nights > 1 ? 's' : ''}`, quantity: nights, unitPrice: rate }];
    if (i % 4 === 0 && status !== 'cancelled') items.push({ id: `bi-${i}-2`, description: 'Airport transfer', quantity: 1, unitPrice: 1500 });
    const total = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
    const deposit = Math.round((total * 0.5) / 50) * 50;
    const lead = 3 + Math.floor(rand() * 26);
    const createdDay = todayCreate.has(i) ? today : (start - lead > -75 ? d(Math.min(start - lead, -1)) : d(-75));
    const id = `bk-${String(i + 1).padStart(3, '0')}`;
    const createdBy = source === 'booking_com' || source === 'agoda' ? 'system' : assignees[ai];
    const b: Booking = {
      id, orgId: ORG1, ref: `BP-${today.slice(2, 4)}${today.slice(5, 7)}-${String(i + 1).padStart(4, '0')}`,
      guestId: `g-${gi}`, resourceId, checkIn, checkOut, adults, children, source, status, items,
      totalAmount: total, depositAmount: deposit, assignedTo: assignees[ai],
      externalRef: source === 'booking_com' ? `BDC-${4410000 + i * 37}` : source === 'agoda' ? `AGD-${7720000 + i * 41}` : undefined,
      notes: '', createdAt: stamp(createdDay, 2 + (i % 8), (i * 7) % 60), createdBy,
    };
    if (status === 'cancelled') b.cancelReason = 'Guest cancelled — flight changed';
    if (status === 'no_show') b.cancelReason = 'Did not arrive; no message received';
    bookings.push(b);

    const method = (m: PaymentMethod): PaymentMethod => (source === 'booking_com' || source === 'agoda' ? 'ota_payout' : m);
    const pay = (amount: number, kind: BookingPayment['kind'], at: string, m: PaymentMethod, n: number) =>
      payments.push({ id: `pay-${id}-${n}`, orgId: ORG1, bookingId: id, amount, kind, method: method(m), reference: `${m.toUpperCase().slice(0, 3)}-${100000 + i * 13 + n}`, paidAt: stamp(at) });
    if (plan === 'full') { pay(deposit, 'deposit', createdDay, i % 2 ? 'gcash' : 'bank_transfer', 1); pay(total - deposit, 'balance', checkIn, i % 3 ? 'cash' : 'card', 2); }
    if (plan === 'dep') pay(deposit, 'deposit', createdDay, i % 2 ? 'gcash' : 'bank_transfer', 1);

    audit.push({ id: `al-${id}-c`, orgId: ORG1, bookingId: id, actorId: createdBy, action: source === 'booking_com' || source === 'agoda' ? 'imported' : 'created', summary: `Booking created from ${SOURCE_META[source].label}`, at: b.createdAt });
    if (['confirmed', 'checked_in', 'checked_out'].includes(status)) {
      audit.push({ id: `al-${id}-k`, orgId: ORG1, bookingId: id, actorId: assignees[ai], action: 'confirmed', summary: 'Booking confirmed — availability check passed', at: stamp(createdDay, 4 + (i % 6), 10) });
    }
    if (status === 'cancelled') audit.push({ id: `al-${id}-x`, orgId: ORG1, bookingId: id, actorId: assignees[ai], action: 'cancelled', summary: `Cancelled: ${b.cancelReason}`, at: stamp(d(-6)) });
  });

  // Conflict examples
  const bkRef = (idx: number) => bookings[idx];
  const c1 = bkRef(11); const c1o = bkRef(10); // OV Booking.com vs Agoda confirmed
  const c2 = bkRef(46); const c2o = bkRef(45); // BH Facebook vs Booking.com confirmed
  for (const [c, o, who, text] of [
    [c1, c1o, 'system', 'Imported from Booking.com but Ocean View Villa is already confirmed for these dates (Agoda). One of the two must move or be cancelled.'],
    [c2, c2o, 'tm-ben', 'Facebook inquiry converted to a booking overlaps a confirmed Booking.com reservation.'],
  ] as const) {
        alerts.push({ id: `ca-${c.id}`, orgId: ORG1, bookingId: c.id, otherBookingId: o.id, kind: 'overlap', details: text, status: 'open', detectedAt: c.createdAt });
    audit.push({ id: `al-${c.id}-cd`, orgId: ORG1, bookingId: c.id, actorId: who, action: 'conflict_detected', summary: `Conflict with ${o.ref}: dates overlap. Booking held in Conflict Review — not confirmed.`, at: c.createdAt });
  }
  c2.approval = { requestedBy: 'tm-ben', requestedAt: c2.createdAt, reason: 'Guest is flexible. Please advise whether to offer Villa 03 instead.', status: 'pending' };
  audit.push({ id: `al-${c2.id}-ap`, orgId: ORG1, bookingId: c2.id, actorId: 'tm-ben', action: 'approval_requested', summary: 'Requested manager approval', at: c2.createdAt });

  notes.push(
    { id: 'n-1', orgId: ORG1, bookingId: bookings[7].id, authorId: 'tm-ana', body: 'Guest requested a late check-out on the 3rd day. Pool towels delivered.', createdAt: stamp(d(-1), 6) },
    { id: 'n-2', orgId: ORG1, bookingId: bookings[0].id, authorId: 'tm-carlo', body: 'VIP — upgraded welcome basket.', createdAt: stamp(d(-41), 5) },
    { id: 'n-3', orgId: ORG1, bookingId: c1.id, authorId: 'tm-carlo', body: 'Calling Booking.com extranet to check if the dates can be closed on their side.', createdAt: stamp(today, 5) },
  );
  bookings[1].notes = '';
  bookings[7].notes = 'Honeymoon — arrange flowers on arrival.';

  // Booking.com channel gets some staff-visible approval on pending web booking? keep simple.

  // ---------------- conversations & messages
  const conversations: Conversation[] = [];
  const messages: Message[] = [];
  let mid = 0;
  const conv = (id: string, guestId: string, channel: Conversation['channel'], status: Conversation['status'], subject: string, bookingId: string | undefined, msgs: [Message['direction'], string, number, number, boolean?][]) => {
    conversations.push({ id, orgId: ORG1, guestId, channel, status, subject, bookingId });
    for (const [direction, body, dayOff, hr, read] of msgs) {
      messages.push({ id: `m-${++mid}`, orgId: ORG1, conversationId: id, bookingId, direction, body, sentAt: stamp(d(dayOff), hr, 15), readAt: direction === 'in' && !read ? undefined : stamp(d(dayOff), hr, 40), authorId: direction === 'out' ? 'tm-ana' : undefined });
    }
  };
  conv('cv-1', 'g-20', 'facebook', 'open', 'Availability for Oct 24–27', undefined, [
    ['in', 'Hi! Do you have a villa for 2 adults from Oct 24 to 27? Looking for something near the beach 🌴', 0, 1],
    ['in', 'Also is breakfast included?', 0, 1],
  ]);
  conv('cv-2', 'g-21', 'whatsapp', 'open', 'Beach House for a family reunion', undefined, [
    ['in', 'Hello, we are 10 people looking for a house for the weekend after next. Do you have anything?', 0, 3],
  ]);
  conv('cv-3', 'g-8', 'facebook', 'converted', 'Ocean View Villa — pending hold', bookings[9].id, [
    ['in', 'Hi, is Ocean View Villa free next weekend?', -1, 5, true],
    ['out', 'Hello Oliver! Yes, it is available. ₱14,500/night, 3-night minimum is ok. Shall I hold it with a ₱21,750 deposit?', -1, 6],
    ['in', 'Yes please hold it. I will send the deposit tomorrow.', 0, 1],
  ]);
  conv('cv-4', 'g-17', 'whatsapp', 'converted', 'Villa 02 booking — payment', bookings[22].id, [
    ['out', 'Hi Miguel, your Villa 02 booking is confirmed. We received the deposit via GCash. Thank you!', -5, 3],
    ['in', 'Thanks! Can we arrive earlier than 2pm?', 0, 2],
  ]);
  conv('cv-5', 'g-11', 'website', 'open', 'Website form — airport transfer', bookings[12].id, [
    ['in', 'Hi, we booked Ocean View for the 24th. Can you arrange an airport pick-up for 4 adults?', -2, 4, true],
    ['out', 'Hi Emma, of course — ₱1,500 each way. I’ll confirm the pick-up time a week before.', -2, 5],
  ]);
  conv('cv-6', 'g-18', 'facebook', 'converted', 'Beach House — changing dates?', bookings[46].id, [
    ['in', 'Hi, I booked the Beach House through Messenger but nobody confirmed. Is it set?', 0, 4],
  ]);
  conv('cv-7', 'g-9', 'whatsapp', 'converted', 'Check-in time question', bookings[10].id, [
    ['in', 'What time is check-in? We land at 11am.', -3, 2, true],
    ['out', 'Check-in is from 2 PM but we can store bags and have a welcome breakfast ready for you 😊', -3, 3],
  ]);

  // ---------------- channels
  const chan = (type: Source, name: string, extra: Partial<Channel> = {}): Channel => ({
    id: `ch-${type}`, orgId: ORG1, type, name, enabled: true, status: 'connected', importedCount: bookings.filter((b) => b.source === type).length,
    mappings: [], syncCursor: 0, ...extra,
  });
  const ago = (min: number) => new Date(Date.parse(stamp(today, 4)) - min * 60000).toISOString();
  const channels: Channel[] = [
    chan('booking_com', 'Booking.com', { status: 'mock', lastSyncAt: ago(12), mappings: [
      { id: 'mp-b1', externalId: 'BDC-88231', externalName: 'Ocean View Villa — Beachfront', resourceId: ID.res.ov },
      { id: 'mp-b2', externalId: 'BDC-88232', externalName: 'Villa 02 with Garden Pool', resourceId: ID.res.v2 },
      { id: 'mp-b3', externalId: 'BDC-88233', externalName: 'Villa 03 Tropical Retreat', resourceId: ID.res.v3 },
      { id: 'mp-b4', externalId: 'BDC-88240', externalName: 'Beach House Siargao', resourceId: ID.res.bh },
      { id: 'mp-b5', externalId: 'BDC-88250', externalName: 'Garden Suite', resourceId: ID.res.gs },
    ] }),
    chan('agoda', 'Agoda', { status: 'mock', lastSyncAt: ago(47), mappings: [
      { id: 'mp-a1', externalId: 'AGD-5510', externalName: 'Sunrise Ocean View Villa', resourceId: ID.res.ov },
      { id: 'mp-a2', externalId: 'AGD-5511', externalName: 'Sunrise Villa 02', resourceId: ID.res.v2 },
      { id: 'mp-a3', externalId: 'AGD-5512', externalName: 'Sunrise Villa 03', resourceId: ID.res.v3 },
      { id: 'mp-a4', externalId: 'AGD-5520', externalName: 'Sunrise Beach House', resourceId: ID.res.bh },
      { id: 'mp-a5', externalId: 'AGD-5521', externalName: 'Sunrise Deluxe Garden Suite', resourceId: null },
    ] }),
    chan('airbnb', 'Airbnb', { enabled: false, status: 'disconnected', importedCount: 0 }),
    chan('facebook', 'Facebook Messenger', { lastSyncAt: ago(3) }),
    chan('whatsapp', 'WhatsApp Business', { lastSyncAt: ago(2) }),
    chan('website', 'Website booking form', { lastSyncAt: ago(25) }),
    chan('ical', 'Google Calendar / iCal', { status: 'error', lastSyncAt: ago(60 * 26), lastError: 'Feed returned HTTP 404 — the iCal URL for "Garden Suite" may have been regenerated.', icalUrl: 'https://calendar.google.com/calendar/ical/sunrise-garden/private-xxxx/basic.ics', importedCount: 0 }),
    chan('manual', 'Manual booking', { status: 'connected', lastSyncAt: undefined }),
    chan('phone', 'Phone booking', { status: 'connected', lastSyncAt: undefined }),
  ];

  // ---------------- org 2 (non-hotel demo)
  const wheelsGuests = ['Noel Gatchalian', 'Beatrice Cole', 'Jun Dizon', 'Alessandro Rossi', 'Lea Navarro'];
  wheelsGuests.forEach((n, i) => guests.push({ id: `gw-${i}`, orgId: ORG2, fullName: n, mobile: `+63 9${20 + i} 555 02${i}1`, email: `${n.split(' ')[0].toLowerCase()}@example.com`, nationality: i === 3 ? 'Italy' : i === 1 ? 'United Kingdom' : 'Philippines', notes: '', tags: i === 0 ? ['Repeat Guest'] : [], createdAt: stamp(d(-30)) }));
  const W: [string, number, number, number, Source, BookingStatus, number][] = [
    ['res-van', -6, 2, 0, 'website', 'checked_out', 9], ['res-van', 1, 3, 3, 'whatsapp', 'confirmed', 8], ['res-van', 9, 2, 2, 'phone', 'pending', 10],
    ['res-montero', -2, 4, 1, 'facebook', 'checked_in', 5], ['res-montero', 5, 3, 4, 'website', 'confirmed', 6],
    ['res-scooter', -1, 5, 3, 'walk_in', 'checked_in', 2], ['res-scooter', 6, 3, 0, 'manual', 'confirmed', 2], ['res-drone', 2, 2, 1, 'website', 'confirmed', 1],
  ];
  W.forEach(([rid, start, nights, gi, source, status, adults], i) => {
    const res = resources.find((r) => r.id === rid)!;
    const checkIn = d(start);
    const checkOut = addDays(checkIn, nights);
    const total = res.baseRate * nights;
    const id = `bkw-${i + 1}`;
    bookings.push({
      id, orgId: ORG2, ref: `IW-${today.slice(2, 4)}${today.slice(5, 7)}-${String(i + 1).padStart(4, '0')}`, guestId: `gw-${gi}`, resourceId: rid, checkIn, checkOut,
      adults, children: 0, source, status, items: [{ id: `${id}-i`, description: `${res.name} · ${nights} day${nights > 1 ? 's' : ''}`, quantity: nights, unitPrice: res.baseRate }],
      totalAmount: total, depositAmount: Math.round(total * 0.3), notes: '', createdAt: stamp(d(Math.min(start - 4, -1))), createdBy: 'tm2-maria', assignedTo: 'tm2-maria',
    });
    if (status !== 'pending') payments.push({ id: `payw-${i}`, orgId: ORG2, bookingId: id, amount: Math.round(total * 0.3), kind: 'deposit', method: 'gcash', reference: `GCA-9${i}001`, paidAt: stamp(d(Math.min(start - 4, -1))) });
    audit.push({ id: `alw-${i}`, orgId: ORG2, bookingId: id, actorId: 'tm2-maria', action: 'created', summary: `Booking created from ${SOURCE_META[source].label}`, at: stamp(d(Math.min(start - 4, -1))) });
  });
  const channels2: Channel[] = (['website', 'facebook', 'whatsapp', 'manual', 'phone'] as Source[]).map((t) => ({
    id: `ch2-${t}`, orgId: ORG2, type: t, name: SOURCE_META[t].label, enabled: true, status: 'connected', importedCount: bookings.filter((b) => b.orgId === ORG2 && b.source === t).length, mappings: [], syncCursor: 0,
  }));
  channels2.push({ id: 'ch2-booking_com', orgId: ORG2, type: 'booking_com', name: 'Booking.com', enabled: false, status: 'disconnected', importedCount: 0, mappings: [], syncCursor: 0 });

  const templates = [...DEFAULT_TEMPLATES(ORG1), ...DEFAULT_TEMPLATES(ORG2)];
  const notificationSettings = members.map((m) => ({ orgId: m.orgId, userId: m.userId, newBooking: true, conflictAlert: true, unreadInquiry: m.role !== 'viewer', dailyDigest: m.role === 'owner' || m.role === 'manager' }));

  void nightsBetween;
  return {
    organizations, users, members, properties, resources, blocks: [
      { id: 'blk-1', orgId: ORG1, resourceId: ID.res.gs, startDate: d(12), endDate: d(15), reason: 'maintenance', note: 'Re-grouting the garden bath', createdBy: 'tm-carlo' },
      { id: 'blk-2', orgId: ORG1, resourceId: ID.res.ov, startDate: d(38), endDate: d(41), reason: 'owner_use', note: 'Owner family visit', createdBy: 'tm-maria' },
      { id: 'blk-3', orgId: ORG1, resourceId: ID.res.v2, startDate: d(32), endDate: d(35), reason: 'private_event', note: 'Staff anniversary lunch (all villas closed to guests)', createdBy: 'tm-maria' },
    ],
    guests, bookings, payments, notes, attachments: [], audit, alerts, conversations, messages, templates, channels: [...channels, ...channels2], notificationSettings,
  };
}
