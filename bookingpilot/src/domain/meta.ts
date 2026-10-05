import type { BookingStatus, GuestTag, ResourceType, Source, BlockReason, PaymentStatus } from '@/types';

export const SOURCE_META: Record<Source, { label: string; short: string; color: string; group: SourceGroup }> = {
  booking_com: { label: 'Booking.com', short: 'Booking.com', color: '#1d4ed8', group: 'booking_com' },
  agoda: { label: 'Agoda', short: 'Agoda', color: '#7c3aed', group: 'agoda' },
  airbnb: { label: 'Airbnb', short: 'Airbnb', color: '#be185d', group: 'airbnb' },
  facebook: { label: 'Facebook Messenger', short: 'Facebook', color: '#0284c7', group: 'facebook' },
  whatsapp: { label: 'WhatsApp', short: 'WhatsApp', color: '#4d7c0f', group: 'whatsapp' },
  website: { label: 'Website form', short: 'Website', color: '#334155', group: 'website' },
  ical: { label: 'Google Calendar / iCal', short: 'iCal', color: '#6d28d9', group: 'ical' },
  manual: { label: 'Manual booking', short: 'Manual', color: '#92400e', group: 'manual' },
  phone: { label: 'Phone booking', short: 'Phone', color: '#92400e', group: 'manual' },
  walk_in: { label: 'Walk-in', short: 'Walk-in', color: '#92400e', group: 'manual' },
};
export type SourceGroup = 'booking_com' | 'agoda' | 'airbnb' | 'facebook' | 'whatsapp' | 'website' | 'ical' | 'manual';

/** Channel mix groups phone + walk-in + manual into "Walk-in / Manual". */
export const SOURCE_GROUPS: { key: SourceGroup; label: string; color: string }[] = [
  { key: 'booking_com', label: 'Booking.com', color: '#1d4ed8' },
  { key: 'agoda', label: 'Agoda', color: '#7c3aed' },
  { key: 'airbnb', label: 'Airbnb', color: '#be185d' },
  { key: 'facebook', label: 'Facebook', color: '#0284c7' },
  { key: 'whatsapp', label: 'WhatsApp', color: '#4d7c0f' },
  { key: 'website', label: 'Website', color: '#334155' },
  { key: 'ical', label: 'iCal', color: '#6d28d9' },
  { key: 'manual', label: 'Walk-in / Manual', color: '#92400e' },
];
export const ALL_SOURCES = Object.keys(SOURCE_META) as Source[];

export const STATUS_META: Record<BookingStatus, { label: string; tone: 'green' | 'amber' | 'red' | 'gray' | 'blue' | 'slate' }> = {
  inquiry: { label: 'Inquiry', tone: 'slate' },
  pending: { label: 'Pending', tone: 'amber' },
  confirmed: { label: 'Confirmed', tone: 'green' },
  checked_in: { label: 'Checked In', tone: 'blue' },
  checked_out: { label: 'Checked Out', tone: 'gray' },
  cancelled: { label: 'Cancelled', tone: 'gray' },
  no_show: { label: 'No Show', tone: 'red' },
  conflict_review: { label: 'Conflict Review', tone: 'red' },
};
export const ALL_STATUSES = Object.keys(STATUS_META) as BookingStatus[];

export const PAYMENT_META: Record<PaymentStatus, { label: string; tone: 'green' | 'amber' | 'red' | 'gray' | 'blue' | 'slate' }> = {
  unpaid: { label: 'Unpaid', tone: 'amber' },
  partial: { label: 'Partially paid', tone: 'blue' },
  paid: { label: 'Paid', tone: 'green' },
  refunded: { label: 'Refunded', tone: 'gray' },
};

export const RESOURCE_TYPES: { value: ResourceType; label: string }[] = [
  { value: 'hotel', label: 'Hotel' }, { value: 'villa', label: 'Villa' }, { value: 'room', label: 'Room' },
  { value: 'rental_unit', label: 'Rental unit' }, { value: 'event_space', label: 'Event space' },
  { value: 'vehicle', label: 'Vehicle' }, { value: 'service_crew', label: 'Service crew' },
  { value: 'equipment', label: 'Equipment' }, { value: 'other', label: 'Other' },
];
export const GUEST_TAGS: GuestTag[] = ['VIP', 'Repeat Guest', 'Corporate', 'Needs Follow-up', 'Blacklist'];
export const BLOCK_REASONS: { value: BlockReason; label: string }[] = [
  { value: 'maintenance', label: 'Maintenance' }, { value: 'owner_use', label: 'Owner use' },
  { value: 'renovation', label: 'Renovation' }, { value: 'private_event', label: 'Private event' }, { value: 'other', label: 'Other' },
];
export const RESOURCE_COLORS = ['#0ea5e9', '#6366f1', '#14b8a6', '#f59e0b', '#ec4899', '#84cc16', '#64748b', '#8b5cf6'];
