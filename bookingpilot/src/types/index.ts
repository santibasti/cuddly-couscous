export type Role = 'owner' | 'manager' | 'staff' | 'viewer';

export type ResourceType =
  | 'hotel' | 'villa' | 'room' | 'rental_unit' | 'event_space'
  | 'vehicle' | 'service_crew' | 'equipment' | 'other';

export type ResourceStatus = 'available' | 'maintenance' | 'inactive';

export type BookingStatus =
  | 'inquiry' | 'pending' | 'confirmed' | 'checked_in'
  | 'checked_out' | 'cancelled' | 'no_show' | 'conflict_review';

export type PaymentStatus = 'unpaid' | 'partial' | 'paid' | 'refunded';

export type Source =
  | 'booking_com' | 'agoda' | 'airbnb' | 'facebook' | 'whatsapp'
  | 'website' | 'ical' | 'manual' | 'phone' | 'walk_in';

export type GuestTag = 'VIP' | 'Repeat Guest' | 'Corporate' | 'Needs Follow-up' | 'Blacklist';

export type BlockReason = 'maintenance' | 'owner_use' | 'renovation' | 'private_event' | 'other';

export type ConflictKind =
  | 'overlap' | 'blocked' | 'buffer' | 'min_stay' | 'capacity' | 'duplicate' | 'unavailable';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  tagline: string;
  // Settings used by generated confirmations
  contactPhone: string;
  contactEmail: string;
  depositPercent: number;
  paymentInstructions: string;
  checkInInstructions: string;
  cancellationPolicy: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  password: string; // demo only — Supabase Auth owns credentials in production
}

export interface TeamMember {
  id: string;
  orgId: string;
  userId: string;
  role: Role;
  /** Empty = all properties. Reservation staff are limited to these resource ids. */
  resourceIds: string[];
  active: boolean;
  invitedEmail?: string;
}

export interface Property {
  id: string;
  orgId: string;
  name: string;
  address: string;
}

export interface Resource {
  id: string;
  orgId: string;
  propertyId: string;
  name: string;
  type: ResourceType;
  capacity: number;
  description: string;
  photos: string[];
  baseRate: number;
  minStay: number;
  /** Nights that must stay empty between a check-out and the next check-in (cleaning / setup). */
  bufferDays: number;
  status: ResourceStatus;
  color: string;
  amenities: string[];
  notes: string;
  sortOrder: number;
}

export interface BlockedDate {
  id: string;
  orgId: string;
  resourceId: string;
  startDate: string; // inclusive
  endDate: string; // exclusive — resource is free again on this date
  reason: BlockReason;
  note: string;
  createdBy: string;
}

export interface BookingItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface ApprovalRequest {
  requestedBy: string;
  requestedAt: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
}

export interface Booking {
  id: string;
  orgId: string;
  ref: string;
  guestId: string;
  resourceId: string;
  checkIn: string;
  checkOut: string; // exclusive
  adults: number;
  children: number;
  source: Source;
  externalRef?: string;
  status: BookingStatus;
  items: BookingItem[];
  totalAmount: number;
  depositAmount: number;
  assignedTo?: string; // team member id
  notes: string;
  cancelReason?: string;
  duplicateOfId?: string;
  approval?: ApprovalRequest;
  paymentRequestedAt?: string;
  confirmationSentAt?: string;
  createdAt: string;
  createdBy: string;
}

export type PaymentMethod = 'gcash' | 'bank_transfer' | 'cash' | 'card' | 'ota_payout';

export interface BookingPayment {
  id: string;
  orgId: string;
  bookingId: string;
  amount: number;
  kind: 'deposit' | 'balance' | 'refund';
  method: PaymentMethod;
  reference: string;
  paidAt: string;
}

export interface BookingNote {
  id: string;
  orgId: string;
  bookingId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface BookingAttachment {
  id: string;
  orgId: string;
  bookingId: string;
  name: string;
  size: number;
  mime: string;
  /** Demo: data URL. Production: Supabase Storage object path. */
  url: string;
  uploadedBy: string;
  createdAt: string;
}

export type AuditAction =
  | 'created' | 'edited' | 'confirmed' | 'cancelled' | 'status_changed' | 'moved'
  | 'conflict_detected' | 'conflict_override' | 'approval_requested' | 'approval_rejected'
  | 'marked_duplicate' | 'payment_recorded' | 'payment_requested' | 'message_sent'
  | 'note_added' | 'attachment_added' | 'imported' | 'block_created' | 'block_removed'
  | 'draft_discarded';

export interface AuditLog {
  id: string;
  orgId: string;
  bookingId?: string;
  actorId: string; // team member id or 'system'
  action: AuditAction;
  summary: string;
  meta?: Record<string, unknown>;
  at: string;
}

export interface ConflictAlert {
  id: string;
  orgId: string;
  bookingId: string;
  otherBookingId?: string;
  blockId?: string;
  kind: ConflictKind;
  details: string;
  status: 'open' | 'resolved' | 'overridden';
  detectedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
}

export interface Guest {
  id: string;
  orgId: string;
  fullName: string;
  mobile: string;
  email: string;
  nationality: string;
  notes: string;
  tags: GuestTag[];
  preferredResourceId?: string;
  createdAt: string;
}

export type MessageChannel = 'facebook' | 'whatsapp' | 'website' | 'email' | 'note';

export interface Conversation {
  id: string;
  orgId: string;
  guestId: string;
  channel: MessageChannel;
  bookingId?: string;
  status: 'open' | 'converted' | 'closed';
  subject: string;
}

export interface Message {
  id: string;
  orgId: string;
  conversationId: string;
  bookingId?: string;
  direction: 'in' | 'out' | 'note';
  body: string;
  sentAt: string;
  readAt?: string;
  authorId?: string;
}

export interface MessageTemplate {
  id: string;
  orgId: string;
  key: 'availability' | 'payment_reminder' | 'booking_confirmation' | 'check_in' | 'cancellation_policy';
  name: string;
  body: string;
}

export interface ChannelMapping {
  id: string;
  externalId: string;
  externalName: string;
  resourceId: string | null;
}

export interface Channel {
  id: string;
  orgId: string;
  type: Source;
  name: string;
  enabled: boolean;
  status: 'connected' | 'disconnected' | 'error' | 'mock';
  lastSyncAt?: string;
  importedCount: number;
  lastError?: string;
  icalUrl?: string;
  mappings: ChannelMapping[];
  syncCursor: number;
}

export interface NotificationSettings {
  orgId: string;
  userId: string;
  newBooking: boolean;
  conflictAlert: boolean;
  unreadInquiry: boolean;
  dailyDigest: boolean;
}

export interface Database {
  organizations: Organization[];
  users: UserProfile[];
  members: TeamMember[];
  properties: Property[];
  resources: Resource[];
  blocks: BlockedDate[];
  guests: Guest[];
  bookings: Booking[];
  payments: BookingPayment[];
  notes: BookingNote[];
  attachments: BookingAttachment[];
  audit: AuditLog[];
  alerts: ConflictAlert[];
  conversations: Conversation[];
  messages: Message[];
  templates: MessageTemplate[];
  channels: Channel[];
  notificationSettings: NotificationSettings[];
}
