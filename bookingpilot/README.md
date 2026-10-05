# BookingPilot

**One calendar. Every channel. No conflicts.**

A centralised booking, availability and conflict-prevention platform for boutique hotels, villas, resorts, rentals and service
businesses (Philippine Peso ₱, Asia/Manila). Reservations from Booking.com, Agoda, Facebook Messenger, WhatsApp, website forms,
phone calls and walk-ins land in one live calendar that **refuses to double-book**.

React 19 · TypeScript · Tailwind CSS 4 · shadcn-style components (Radix primitives) · Zustand · Recharts · Supabase (schema, RLS, storage)

```bash
cd bookingpilot
npm install
npm run dev        # http://localhost:5173
npm test           # 21 tests: conflict engine, seed integrity, store rules, permissions, channel imports
npm run build      # type-check + production build
```

## Demo login

Password for every account: **`demo123`** (or use the role buttons on the sign-in page).

| Role | Email | What to try |
| --- | --- | --- |
| Owner / Super Admin | `owner@sunrise.ph` | Everything, incl. Team, Settings, deleting the org. Has a second org ("Island Wheels Rentals" — vehicles & equipment) in the org switcher |
| Manager | `manager@sunrise.ph` | Approve conflict exceptions, reports, channels. Team/owner settings are read-only |
| Reservation Staff | `staff@sunrise.ph` | Sees **only Ocean View, Villa 02, Villa 03**; no Reports / Team / Settings / Channels, no revenue |
| Read-only Viewer | `viewer@sunrise.ph` | Calendar, bookings, availability. No create/edit/confirm/cancel buttons anywhere |

Seed data (Sunrise Villas & Suites — Ocean View Villa, Villa 02, Villa 03, Beach House, Garden Suite) is generated relative to
*today*: 61 bookings from Booking.com, Agoda, Facebook, WhatsApp, Website, Phone, Walk-in and Manual; **two conflicts** (Ocean View:
Booking.com vs a confirmed Agoda stay; Beach House: Facebook vs a confirmed Booking.com stay), **three pending**, in-house guests,
guest histories (repeat guests, VIPs, a blacklisted guest), payments, an inbox with unread Messenger/WhatsApp inquiries, maintenance /
owner-use / private-event blocks. **Settings → Data → Reset** restores it.

## The product: availability control

Every path that can hold dates — new booking, edit, drag-and-drop, reassign, channel import, confirm — goes through one pure function,
`checkBooking()` in [`src/domain/conflicts.ts`](src/domain/conflicts.ts):

| Rule | Severity | Notes |
| --- | --- | --- |
| Overlap with a pending / confirmed / in-house booking | **hard** | Check-out day is free for the next check-in (same-day turnover) |
| Blocked dates (maintenance, owner use, renovation, private event) | **hard** | |
| Duplicate (same channel reference, or same guest + property + dates) | **hard** | Makes channel re-imports idempotent |
| Resource not `available` | **hard** | |
| Cleaning / setup buffer between stays | soft | Per-resource empty nights |
| Minimum stay | soft | Per-resource |
| Capacity | soft | |

* **Hard** conflicts can never be overridden — not even by the owner. **Soft** ones can be approved by a manager/owner with a written reason.
* A conflict never auto-confirms. The **conflict modal** shows each problem with the conflicting reservation's details and offers only the controlled options:
  *Keep as pending · Move to another available property · Change dates · Mark as duplicate · Request manager approval · Cancel the new booking*
  (for an already-confirmed booking that is being edited/dragged: *Keep original* replaces *Keep as pending / Cancel*).
* The booking form re-checks live while you type, and annotates every property with ✓/✕ for the chosen dates.
* Drag a bar on the timeline: a ghost preview turns green/amber/red *while dragging*; dropping on a conflict opens the modal instead of moving.
* Open alerts auto-resolve when the cause disappears (other booking cancelled, dates moved, block released).
* **Audit trail**: created, edited, moved, confirmed, cancelled, conflict detected, approval requested, **override** (with reason), duplicates, payments, messages — per booking (Timeline / Changes tabs).

## What's where

```
src/
  domain/        pure business logic (no React, no store) — conflicts, metrics, reports, permissions,
                 confirmation documents, channel adapters (+ mock Booking.com/Agoda, iCal parser)
  store/         Zustand store (all mutations, permission checks, audit), UI flow store, shared result handling
  data/seed.ts   Sunrise Villas & Suites + Island Wheels Rentals demo data
  components/    ui/ (button, form, dialog, tabs…), layout/, calendar/ (timeline, month, day, agenda), bookings/ (form, conflict modal…)
  pages/         Dashboard, CalendarPage, Bookings, BookingDetail, Properties, Channels, Guests, Inbox, Reports, Team, Settings, Login
supabase/
  migrations/    0001 schema · 0002 rules (conflict function, confirmation guard, RPCs) · 0003 RLS · 0004 storage · 0005 auth profile
  seed.sql       generated from src/data/seed.ts  (npm run db:seed-sql)
scripts/         export-seed-sql.ts, create-demo-users.mjs
```

Calendar views: **Day, Week, Month, Timeline (30 days), Agenda** (default on phones). Filters: property, source, status, staff, guest/ref, conflicts-only,
show-cancelled. Drag-select empty dates to create a booking; drag a bar to move or re-assign it; **Block dates** for maintenance/owner use/etc.

## Channels

`src/domain/integrations.ts` defines `ChannelAdapter` → normalised `ExternalBooking[]`. The shared import pipeline (`importBatch` in the store)
does listing → resource mapping, duplicate detection, the availability check, alerts and audit logging. Included:

* **Mock Booking.com and Agoda** adapters — *Sync now* imports sample reservations; the second sync re-sends a known reference (skipped as a duplicate)
  and a reservation that clashes with a confirmed stay (held in **Conflict Review**, never confirmed). Agoda's "Garden Suite" listing is deliberately
  unmapped, so one booking reports a mapping error until you map it.
* **iCal import** (paste an `.ics`), a mapping UI per channel, enable/disable, last sync, imported count and error display.
* Facebook / WhatsApp / website are modelled as inbox/webhook sources; staff can also create bookings manually from any of them, from phone calls and walk-ins.
* A real API, iCal poller, webhook or email parser only has to return `ExternalBooking[]`.

## Supabase

`supabase/migrations` is a complete, tested schema (every requested table, plus `conversations` for the inbox):

* **Hard guarantee in the database**: an exclusion constraint makes it impossible for two confirmed / in-house / completed bookings to overlap on a resource,
  and a trigger blocks any write that would set `status = 'confirmed'` unless it passes the same rules as `checkBooking()` (soft conflicts only inside
  `approve_conflict_override()`, which requires manager/owner + reason). `confirm_booking()` returns the conflict list instead of raising.
* **RLS on every table**, scoped by `organization_id`; roles narrow it (staff see only assigned resources; viewers are read-only; channels, team and settings are
  owner/manager). The audit table is append-only. Storage buckets `property-photos` (public) and `booking-attachments` (private) are scoped by org folder.
* I ran all five migrations and `seed.sql` against an in-process Postgres (PGlite) with checks for overlap/blocked/buffer/duplicate/override rules, audit immutability,
  cross-organization isolation and role visibility — all pass. They have **not** been run against a hosted Supabase project.

Apply: `supabase db push` (or paste the files in order into the SQL editor) → `node scripts/create-demo-users.mjs` → run `supabase/seed.sql`.

### Moving from demo mode to Supabase — what is *not* done

The UI currently runs on the in-browser store (`src/store/store.ts`, persisted in `localStorage`); `src/lib/supabase.ts` creates the client when
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are set, but **no screen reads or writes Supabase yet**. The remaining work is a data-access layer that maps the store's
actions to table writes and the `confirm_booking` / `approve_conflict_override` RPCs, swaps demo login for Supabase Auth, uploads photos/attachments to Storage, and
runs channel syncs in an Edge Function with webhooks. The domain logic, permission model and schema are already shaped for that.

Other honest limits: messages/payment requests/confirmations are logged but not actually delivered (mock delivery); revenue is recognised per night stayed;
bookings are day-granular (no hourly slots for appointment businesses yet); property photos in demo mode are resized and kept in the browser.
