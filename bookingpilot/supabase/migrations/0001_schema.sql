-- BookingPilot — core schema
-- Dates are plain `date`s in the organization's timezone (default Asia/Manila). A booking occupies [check_in, check_out):
-- the check-out day is free for the next check-in (same-day turnover) unless the resource has a cleaning buffer.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------------------------------------------
-- Enums & lookup tables
-- ---------------------------------------------------------------------------------------------------------------
create type public.role_code as enum ('owner', 'manager', 'staff', 'viewer');
create type public.resource_type as enum ('hotel', 'villa', 'room', 'rental_unit', 'event_space', 'vehicle', 'service_crew', 'equipment', 'other');
create type public.resource_status as enum ('available', 'maintenance', 'inactive');
create type public.booking_status as enum ('inquiry', 'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show', 'conflict_review');
create type public.booking_source as enum ('booking_com', 'agoda', 'airbnb', 'facebook', 'whatsapp', 'website', 'ical', 'manual', 'phone', 'walk_in');
create type public.block_reason as enum ('maintenance', 'owner_use', 'renovation', 'private_event', 'other');
create type public.conflict_kind as enum ('overlap', 'blocked', 'buffer', 'min_stay', 'capacity', 'duplicate', 'unavailable');
create type public.message_channel as enum ('facebook', 'whatsapp', 'website', 'email', 'note');

-- roles: the four built-in roles and what they mean (permission keys mirror src/domain/permissions.ts)
create table public.roles (
  code public.role_code primary key,
  label text not null,
  description text not null,
  permissions text[] not null default '{}'
);

-- ---------------------------------------------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'Asia/Manila',
  currency char(3) not null default 'PHP',
  tagline text not null default '',
  contact_phone text not null default '',
  contact_email text not null default '',
  deposit_percent int not null default 50 check (deposit_percent between 0 and 100),
  payment_instructions text not null default '',
  check_in_instructions text not null default '',
  cancellation_policy text not null default '',
  created_at timestamptz not null default now()
);

-- users: profile row per Supabase Auth user (credentials live in auth.users)
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role public.role_code not null default 'staff',
  -- Reservation staff only see these resources. Empty array = all resources.
  resource_ids uuid[] not null default '{}',
  active boolean not null default true,
  invited_email text,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index on public.team_members (user_id);

-- ---------------------------------------------------------------------------------------------------------------
-- Properties & resources
-- ---------------------------------------------------------------------------------------------------------------
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  address text not null default '',
  created_at timestamptz not null default now()
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  name text not null,
  type public.resource_type not null default 'room',
  capacity int not null default 2 check (capacity > 0),
  description text not null default '',
  photos text[] not null default '{}',              -- Supabase Storage paths in bucket `property-photos`
  base_rate numeric(12, 2) not null default 0 check (base_rate >= 0),
  min_stay int not null default 1 check (min_stay >= 1),
  buffer_days int not null default 0 check (buffer_days >= 0), -- empty nights required between stays (cleaning / setup)
  status public.resource_status not null default 'available',
  color text not null default '#0ea5e9',
  amenities text[] not null default '{}',
  internal_notes text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.resources (organization_id);

-- Seasonal / weekday availability and rate overrides for a resource (rate calendar)
create table public.resource_availability (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  start_date date not null,
  end_date date not null,                           -- exclusive
  days_of_week int[] not null default '{0,1,2,3,4,5,6}',
  is_available boolean not null default true,
  rate_override numeric(12, 2),
  min_stay_override int,
  note text not null default '',
  check (end_date > start_date)
);
create index on public.resource_availability (resource_id, start_date);

create table public.blocked_dates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  start_date date not null,                         -- inclusive
  end_date date not null,                           -- exclusive: available again on this date
  reason public.block_reason not null default 'maintenance',
  note text not null default '',
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_date > start_date),
  -- a resource cannot be blocked twice for the same night
  exclude using gist (resource_id with =, daterange(start_date, end_date, '[)') with &&)
);

-- ---------------------------------------------------------------------------------------------------------------
-- Channels
-- ---------------------------------------------------------------------------------------------------------------
-- booking_channels: global catalogue of supported channel types
create table public.booking_channels (
  source public.booking_source primary key,
  label text not null,
  integration text not null check (integration in ('api', 'webhook', 'form', 'ical', 'staff'))
);

-- channel_connections: one per organization per channel; mapping = external listing -> internal resource
create table public.channel_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  source public.booking_source not null references public.booking_channels (source),
  enabled boolean not null default true,
  status text not null default 'disconnected' check (status in ('connected', 'disconnected', 'error', 'mock')),
  last_sync_at timestamptz,
  imported_count int not null default 0,
  last_error text,
  ical_url text,
  sync_cursor text,
  credentials_ref text,                              -- name of a Vault secret; never store API keys in this table
  mappings jsonb not null default '[]',              -- [{externalId, externalName, resourceId}]
  unique (organization_id, source)
);

-- ---------------------------------------------------------------------------------------------------------------
-- Guests & bookings
-- ---------------------------------------------------------------------------------------------------------------
create table public.guests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  full_name text not null,
  mobile text not null default '',
  email text not null default '',
  nationality text not null default '',
  notes text not null default '',
  tags text[] not null default '{}' check (tags <@ array['VIP', 'Repeat Guest', 'Corporate', 'Needs Follow-up', 'Blacklist']),
  preferred_resource_id uuid references public.resources (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.guests (organization_id, lower(full_name));

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  ref text not null,
  guest_id uuid not null references public.guests (id),
  resource_id uuid not null references public.resources (id),
  check_in date not null,
  check_out date not null,                           -- exclusive
  adults int not null default 1 check (adults >= 1),
  children int not null default 0 check (children >= 0),
  source public.booking_source not null default 'manual',
  external_ref text,
  status public.booking_status not null default 'pending',
  total_amount numeric(12, 2) not null default 0,
  deposit_amount numeric(12, 2) not null default 0,
  assigned_to uuid references public.team_members (id) on delete set null,
  notes text not null default '',
  cancel_reason text,
  duplicate_of uuid references public.bookings (id),
  approval jsonb,                                    -- {requestedBy, requestedAt, reason, status, decidedBy, decidedAt, decisionNote}
  payment_requested_at timestamptz,
  confirmation_sent_at timestamptz,
  created_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now(),
  check (check_out > check_in),
  unique (organization_id, ref)
);
create index on public.bookings (organization_id, resource_id, check_in);
create index on public.bookings (organization_id, status);
-- A channel reservation can be imported only once
create unique index bookings_external_ref_uniq on public.bookings (organization_id, source, external_ref)
  where external_ref is not null and status <> 'cancelled';

-- HARD GUARANTEE: no two confirmed / in-house / completed bookings can ever overlap on a resource,
-- whatever client, import job or SQL console writes them.
alter table public.bookings add constraint bookings_no_double_booking
  exclude using gist (resource_id with =, daterange(check_in, check_out, '[)') with &&)
  where (status in ('confirmed', 'checked_in', 'checked_out'));

create table public.booking_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  position int not null default 0,                   -- 0 = room / resource charge
  description text not null,
  quantity numeric(10, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0
);
create index on public.booking_items (booking_id);

create table public.booking_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  kind text not null check (kind in ('deposit', 'balance', 'refund')),
  method text not null check (method in ('gcash', 'bank_transfer', 'cash', 'card', 'ota_payout')),
  reference text not null default '',
  paid_at timestamptz not null default now(),
  recorded_by uuid references public.team_members (id) on delete set null
);
create index on public.booking_payments (booking_id);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  guest_id uuid not null references public.guests (id) on delete cascade,
  channel public.message_channel not null,
  booking_id uuid references public.bookings (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'converted', 'closed')),
  subject text not null default ''
);

create table public.booking_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,
  direction text not null check (direction in ('in', 'out', 'note')),
  body text not null,
  sent_at timestamptz not null default now(),
  read_at timestamptz,
  author_id uuid references public.team_members (id) on delete set null
);
create index on public.booking_messages (conversation_id, sent_at);

create table public.booking_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  author_id uuid references public.team_members (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.booking_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  name text not null,
  size_bytes bigint not null default 0,
  mime text not null default '',
  storage_path text not null,                        -- bucket `booking-attachments`, path `<org_id>/<booking_id>/<file>`
  uploaded_by uuid references public.team_members (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Append-only audit trail (see 0003: updates and deletes are blocked)
create table public.booking_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete set null,
  actor_id uuid references public.team_members (id) on delete set null,   -- null = system / import
  action text not null,
  summary text not null,
  meta jsonb,
  at timestamptz not null default now()
);
create index on public.booking_audit_logs (organization_id, at desc);
create index on public.booking_audit_logs (booking_id, at desc);

create table public.conflict_alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  other_booking_id uuid references public.bookings (id) on delete set null,
  blocked_date_id uuid references public.blocked_dates (id) on delete set null,
  kind public.conflict_kind not null,
  details text not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'overridden')),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.team_members (id) on delete set null,
  resolution text
);
create index on public.conflict_alerts (organization_id, status);

create table public.notification_settings (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  new_booking boolean not null default true,
  conflict_alert boolean not null default true,
  unread_inquiry boolean not null default true,
  daily_digest boolean not null default false,
  primary key (organization_id, user_id)
);

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null check (key in ('availability', 'payment_reminder', 'booking_confirmation', 'check_in', 'cancellation_policy')),
  name text not null,
  body text not null,
  unique (organization_id, key)
);

-- ---------------------------------------------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------------------------------------------
insert into public.roles (code, label, description, permissions) values
  ('owner', 'Owner / Super Admin', 'Full access to all properties, reports, users, channels, settings and financial data.',
    array['bookings.*', 'conflicts.override', 'calendar.block', 'properties.manage', 'channels.manage', 'guests.manage', 'reports.view', 'revenue.view', 'team.manage', 'settings.owner', 'org.delete']),
  ('manager', 'Manager', 'Manages bookings, calendar, guests, properties and reports. Cannot change owner settings or delete the organization.',
    array['bookings.*', 'conflicts.override', 'calendar.block', 'properties.manage', 'channels.manage', 'guests.manage', 'reports.view', 'revenue.view']),
  ('staff', 'Reservation Staff', 'Creates, edits, confirms, cancels and messages bookings for assigned properties. No revenue reports or user settings.',
    array['bookings.*', 'calendar.block', 'guests.manage']),
  ('viewer', 'Read-only Viewer', 'Can view the calendar, bookings and availability. Cannot create, edit, confirm or cancel.',
    array['bookings.view']);

insert into public.booking_channels (source, label, integration) values
  ('booking_com', 'Booking.com', 'api'), ('agoda', 'Agoda', 'api'), ('airbnb', 'Airbnb', 'ical'),
  ('facebook', 'Facebook Messenger', 'webhook'), ('whatsapp', 'WhatsApp', 'webhook'), ('website', 'Website booking form', 'form'),
  ('ical', 'Google Calendar / iCal', 'ical'), ('manual', 'Manual booking', 'staff'), ('phone', 'Phone booking', 'staff'), ('walk_in', 'Walk-in', 'staff');
