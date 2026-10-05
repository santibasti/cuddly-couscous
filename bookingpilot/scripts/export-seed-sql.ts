/**
 * Generates supabase/seed.sql from the same demo data the app uses in demo mode (src/data/seed.ts).
 *   npm run db:seed-sql
 * Dates are written as absolute values relative to the day you run it — re-run to refresh the demo.
 * Prerequisite: the demo auth users exist (see scripts/create-demo-users.mjs) — profiles are matched by email.
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { buildSeed } from '../src/data/seed';
import { todayISO } from '../src/domain/dates';

const db = buildSeed(todayISO());
const uuid = (key: string) => {
  const h = createHash('md5').update(`bookingpilot:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const q = (v: unknown): string => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};
const arr = (a: string[], t = 'text') => (a.length ? `array[${a.map(q).join(',')}]::${t}[]` : `'{}'::${t}[]`);
const id = (k?: string) => (k && k !== 'system' ? q(uuid(k)) : 'null');
const day = (ts: string) => ts;
const out: string[] = [];
const insert = (table: string, cols: string[], rows: unknown[][]) => {
  if (!rows.length) return;
  out.push(`insert into public.${table} (${cols.join(', ')}) values\n${rows.map((r) => '  (' + r.join(', ') + ')').join(',\n')};\n`);
};

out.push(`-- BookingPilot demo seed (generated ${new Date().toISOString().slice(0, 10)} by scripts/export-seed-sql.ts). Do not edit by hand.
begin;
do $$ begin
  if (select count(*) from public.users where email in (${db.users.map((u) => q(u.email)).join(', ')})) < ${db.users.length} then
    raise exception 'Create the demo auth users first: node scripts/create-demo-users.mjs';
  end if;
end $$;
-- the confirmation guard must not interfere with loading historical data in a defined order
`);

insert('organizations', ['id', 'name', 'slug', 'timezone', 'currency', 'tagline', 'contact_phone', 'contact_email', 'deposit_percent', 'payment_instructions', 'check_in_instructions', 'cancellation_policy'],
  db.organizations.map((o) => [q(uuid(o.id)), q(o.name), q(o.slug), q(o.timezone), q(o.currency), q(o.tagline), q(o.contactPhone), q(o.contactEmail), o.depositPercent, q(o.paymentInstructions), q(o.checkInInstructions), q(o.cancellationPolicy)]));

for (const m of db.members) {
  const u = db.users.find((x) => x.id === m.userId)!;
  out.push(`insert into public.team_members (id, organization_id, user_id, role, resource_ids, active) select ${q(uuid(m.id))}, ${q(uuid(m.orgId))}, id, ${q(m.role)}, ${arr(m.resourceIds.map(uuid), 'uuid')}, ${m.active} from public.users where email = ${q(u.email)};`);
  out.push(`update public.users set full_name = ${q(u.name)} where email = ${q(u.email)};`);
}
out.push('');

insert('properties', ['id', 'organization_id', 'name', 'address'], db.properties.map((p) => [q(uuid(p.id)), q(uuid(p.orgId)), q(p.name), q(p.address)]));
insert('resources', ['id', 'organization_id', 'property_id', 'name', 'type', 'capacity', 'description', 'base_rate', 'min_stay', 'buffer_days', 'status', 'color', 'amenities', 'internal_notes', 'sort_order'],
  db.resources.map((r) => [q(uuid(r.id)), q(uuid(r.orgId)), q(uuid(r.propertyId)), q(r.name), q(r.type), r.capacity, q(r.description), r.baseRate, r.minStay, r.bufferDays, q(r.status), q(r.color), arr(r.amenities), q(r.notes), r.sortOrder]));
insert('guests', ['id', 'organization_id', 'full_name', 'mobile', 'email', 'nationality', 'notes', 'tags', 'preferred_resource_id', 'created_at'],
  db.guests.map((g) => [q(uuid(g.id)), q(uuid(g.orgId)), q(g.fullName), q(g.mobile), q(g.email), q(g.nationality), q(g.notes), arr(g.tags), g.preferredResourceId ? q(uuid(g.preferredResourceId)) : 'null', q(g.createdAt)]));
insert('blocked_dates', ['id', 'organization_id', 'resource_id', 'start_date', 'end_date', 'reason', 'note', 'created_by'],
  db.blocks.map((b) => [q(uuid(b.id)), q(uuid(b.orgId)), q(uuid(b.resourceId)), q(b.startDate), q(b.endDate), q(b.reason), q(b.note), id(b.createdBy)]));

// Bookings: everything except confirmed first is irrelevant — none of the seeded confirmed bookings conflict, so any order passes the guard.
insert('bookings', ['id', 'organization_id', 'ref', 'guest_id', 'resource_id', 'check_in', 'check_out', 'adults', 'children', 'source', 'external_ref', 'status', 'deposit_amount', 'assigned_to', 'notes', 'cancel_reason', 'approval', 'created_by', 'created_at'],
  [...db.bookings].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((b) => [q(uuid(b.id)), q(uuid(b.orgId)), q(b.ref), q(uuid(b.guestId)), q(uuid(b.resourceId)), q(b.checkIn), q(b.checkOut), b.adults, b.children, q(b.source), q(b.externalRef), q(b.status), b.depositAmount, id(b.assignedTo), q(b.notes), q(b.cancelReason), b.approval ? q(b.approval) : 'null', id(b.createdBy), q(b.createdAt)]));
insert('booking_items', ['id', 'organization_id', 'booking_id', 'position', 'description', 'quantity', 'unit_price'],
  db.bookings.flatMap((b) => b.items.map((it, i) => [q(uuid(it.id + b.id)), q(uuid(b.orgId)), q(uuid(b.id)), i, q(it.description), it.quantity, it.unitPrice])));
insert('booking_payments', ['id', 'organization_id', 'booking_id', 'amount', 'kind', 'method', 'reference', 'paid_at'],
  db.payments.map((p) => [q(uuid(p.id)), q(uuid(p.orgId)), q(uuid(p.bookingId)), p.amount, q(p.kind), q(p.method), q(p.reference), q(day(p.paidAt))]));
insert('booking_notes', ['id', 'organization_id', 'booking_id', 'author_id', 'body', 'created_at'], db.notes.map((n) => [q(uuid(n.id)), q(uuid(n.orgId)), q(uuid(n.bookingId)), id(n.authorId), q(n.body), q(n.createdAt)]));
insert('conflict_alerts', ['id', 'organization_id', 'booking_id', 'other_booking_id', 'kind', 'details', 'status', 'detected_at'],
  db.alerts.map((a) => [q(uuid(a.id)), q(uuid(a.orgId)), q(uuid(a.bookingId)), a.otherBookingId ? q(uuid(a.otherBookingId)) : 'null', q(a.kind), q(a.details), q(a.status), q(a.detectedAt)]));
insert('conversations', ['id', 'organization_id', 'guest_id', 'channel', 'booking_id', 'status', 'subject'],
  db.conversations.map((c) => [q(uuid(c.id)), q(uuid(c.orgId)), q(uuid(c.guestId)), q(c.channel), c.bookingId ? q(uuid(c.bookingId)) : 'null', q(c.status), q(c.subject)]));
insert('booking_messages', ['id', 'organization_id', 'conversation_id', 'booking_id', 'direction', 'body', 'sent_at', 'read_at', 'author_id'],
  db.messages.map((m) => [q(uuid(m.id)), q(uuid(m.orgId)), q(uuid(m.conversationId)), m.bookingId ? q(uuid(m.bookingId)) : 'null', q(m.direction), q(m.body), q(m.sentAt), q(m.readAt), id(m.authorId)]));
insert('booking_audit_logs', ['id', 'organization_id', 'booking_id', 'actor_id', 'action', 'summary', 'at'],
  db.audit.map((a) => [q(uuid(a.id)), q(uuid(a.orgId)), a.bookingId ? q(uuid(a.bookingId)) : 'null', id(a.actorId), q(a.action), q(a.summary), q(a.at)]));
insert('message_templates', ['id', 'organization_id', 'key', 'name', 'body'], db.templates.map((t) => [q(uuid(t.id)), q(uuid(t.orgId)), q(t.key), q(t.name), q(t.body)]));
insert('channel_connections', ['id', 'organization_id', 'source', 'enabled', 'status', 'last_sync_at', 'imported_count', 'last_error', 'ical_url', 'mappings'],
  db.channels.map((c) => [q(uuid(c.id)), q(uuid(c.orgId)), q(c.type), c.enabled, q(c.status), q(c.lastSyncAt), c.importedCount, q(c.lastError), q(c.icalUrl), q(c.mappings.map((m) => ({ externalId: m.externalId, externalName: m.externalName, resourceId: m.resourceId ? uuid(m.resourceId) : null })))]));
for (const n of db.notificationSettings) {
  const u = db.users.find((x) => x.id === n.userId)!;
  out.push(`insert into public.notification_settings (organization_id, user_id, new_booking, conflict_alert, unread_inquiry, daily_digest) select ${q(uuid(n.orgId))}, id, ${n.newBooking}, ${n.conflictAlert}, ${n.unreadInquiry}, ${n.dailyDigest} from public.users where email = ${q(u.email)};`);
}
out.push('\ncommit;');
writeFileSync(new URL('../supabase/seed.sql', import.meta.url), out.join('\n') + '\n');
console.log(`supabase/seed.sql written (${db.bookings.length} bookings)`);
