-- BookingPilot — business rules enforced in the database (the same rules as src/domain/conflicts.ts)

-- ---------------------------------------------------------------------------------------------------------------
-- check_booking_conflicts: the single source of truth for "can this booking hold these dates?"
-- Returns a jsonb array of {kind, severity, message, other_booking_id?, blocked_date_id?}.
--   hard = never overridable (overlap, blocked dates, duplicate, unavailable resource)
--   soft = a manager may approve an exception (cleaning buffer, minimum stay, capacity)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.check_booking_conflicts(
  p_booking_id uuid, p_org uuid, p_resource uuid, p_check_in date, p_check_out date,
  p_adults int, p_children int, p_source public.booking_source, p_external_ref text, p_guest uuid
) returns jsonb
language plpgsql stable
as $$
declare
  r public.resources;
  res jsonb := '[]'::jsonb;
  b record;
  bl record;
  dups uuid[] := '{}';
  gap int;
  nights int := p_check_out - p_check_in;
begin
  select * into r from public.resources where id = p_resource and organization_id = p_org;
  if not found then
    return jsonb_build_array(jsonb_build_object('kind', 'unavailable', 'severity', 'hard', 'message', 'The selected property / resource does not exist.'));
  end if;

  if r.status <> 'available' then
    res := res || jsonb_build_object('kind', 'unavailable', 'severity', 'hard', 'message', format('%s is currently marked "%s" and cannot take bookings.', r.name, r.status));
  end if;

  -- duplicate records (channel re-import, double entry)
  for b in
    select id, ref, external_ref, source from public.bookings
    where organization_id = p_org and id is distinct from p_booking_id and status <> 'cancelled'
      and ((p_external_ref is not null and external_ref = p_external_ref and source = p_source)
        or (p_guest is not null and guest_id = p_guest and resource_id = p_resource and check_in = p_check_in and check_out = p_check_out))
  loop
    dups := dups || b.id;
    res := res || jsonb_build_object('kind', 'duplicate', 'severity', 'hard', 'other_booking_id', b.id,
      'message', format('%s looks like the same reservation (same channel reference or same guest, property and dates).', b.ref));
  end loop;

  -- overlapping reservations that hold dates
  for b in
    select id, ref, check_in, check_out, status from public.bookings
    where organization_id = p_org and resource_id = p_resource and id is distinct from p_booking_id
      and status in ('pending', 'confirmed', 'checked_in', 'checked_out')
  loop
    continue when b.id = any (dups);
    if p_check_in < b.check_out and b.check_in < p_check_out then
      res := res || jsonb_build_object('kind', 'overlap', 'severity', 'hard', 'other_booking_id', b.id,
        'message', format('Overlaps %s (%s to %s, %s).', b.ref, b.check_in, b.check_out, b.status));
    elsif r.buffer_days > 0 then
      gap := case when b.check_out <= p_check_in then p_check_in - b.check_out
                  when b.check_in >= p_check_out then b.check_in - p_check_out end;
      if gap is not null and gap < r.buffer_days then
        res := res || jsonb_build_object('kind', 'buffer', 'severity', 'soft', 'other_booking_id', b.id,
          'message', format('Only %s empty night(s) next to %s; %s needs %s for cleaning/setup.', gap, b.ref, r.name, r.buffer_days));
      end if;
    end if;
  end loop;

  -- blocked dates (maintenance, owner use, renovation, private events)
  for bl in select id, reason, start_date, end_date from public.blocked_dates
            where resource_id = p_resource and daterange(start_date, end_date, '[)') && daterange(p_check_in, p_check_out, '[)')
  loop
    res := res || jsonb_build_object('kind', 'blocked', 'severity', 'hard', 'blocked_date_id', bl.id,
      'message', format('Dates are blocked for %s (%s to %s).', replace(bl.reason::text, '_', ' '), bl.start_date, bl.end_date));
  end loop;

  if nights < r.min_stay then
    res := res || jsonb_build_object('kind', 'min_stay', 'severity', 'soft',
      'message', format('%s requires at least %s night(s); this booking is %s.', r.name, r.min_stay, nights));
  end if;
  if p_adults + p_children > r.capacity then
    res := res || jsonb_build_object('kind', 'capacity', 'severity', 'soft',
      'message', format('%s guests exceeds the capacity of %s (%s).', p_adults + p_children, r.name, r.capacity));
  end if;
  return res;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- Confirmation guard: a booking cannot become `confirmed` through ANY write path unless it passes the checks.
-- Soft conflicts are allowed only inside approve_conflict_override() (which sets a transaction-local reason).
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.bookings_enforce_confirmation() returns trigger
language plpgsql
as $$
declare
  c jsonb;
  hard boolean;
  moved boolean;
begin
  if new.status <> 'confirmed' then
    return new;
  end if;
  moved := tg_op = 'INSERT' or old.status is distinct from 'confirmed' or old.resource_id <> new.resource_id
           or old.check_in <> new.check_in or old.check_out <> new.check_out or old.adults + old.children <> new.adults + new.children;
  if not moved then
    return new;
  end if;
  c := public.check_booking_conflicts(new.id, new.organization_id, new.resource_id, new.check_in, new.check_out, new.adults, new.children, new.source, new.external_ref, new.guest_id);
  if jsonb_array_length(c) = 0 then
    return new;
  end if;
  select exists (select 1 from jsonb_array_elements(c) e where e ->> 'severity' = 'hard') into hard;
  if hard then
    raise exception 'BOOKING_CONFLICT: this booking cannot be confirmed' using errcode = 'P0001', detail = c::text, hint = 'hard';
  end if;
  if coalesce(current_setting('bookingpilot.override_reason', true), '') = '' then
    raise exception 'BOOKING_CONFLICT: manager approval required' using errcode = 'P0001', detail = c::text, hint = 'soft';
  end if;
  return new;
end;
$$;
create trigger bookings_enforce_confirmation before insert or update on public.bookings
  for each row execute function public.bookings_enforce_confirmation();

-- ---------------------------------------------------------------------------------------------------------------
-- Housekeeping triggers
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.bookings_set_ref() returns trigger language plpgsql as $$
declare n int;
begin
  if coalesce(new.ref, '') = '' then
    perform pg_advisory_xact_lock(hashtext(new.organization_id::text));
    select coalesce(max((substring(ref from '(\d+)$'))::int), 0) + 1 into n from public.bookings where organization_id = new.organization_id;
    new.ref := format('BP-%s-%s', to_char(now() at time zone 'Asia/Manila', 'YYMM'), lpad(n::text, 4, '0'));
  end if;
  return new;
end $$;
create trigger bookings_set_ref before insert on public.bookings for each row execute function public.bookings_set_ref();

create or replace function public.booking_items_total() returns trigger language plpgsql as $$
declare bid uuid := coalesce(new.booking_id, old.booking_id);
begin
  update public.bookings set total_amount = coalesce((select sum(quantity * unit_price) from public.booking_items where booking_id = bid), 0) where id = bid;
  return null;
end $$;
create trigger booking_items_total after insert or update or delete on public.booking_items for each row execute function public.booking_items_total();

-- The audit trail is append-only. (Cascading deletes from a deleted organization/booking run at trigger depth >= 2 and are allowed.)
create or replace function public.audit_is_append_only() returns trigger language plpgsql as $$
begin
  if pg_trigger_depth() < 2 then
    raise exception 'booking_audit_logs is append-only';
  end if;
  return coalesce(new, old);
end $$;
create trigger audit_no_update before update or delete on public.booking_audit_logs for each row execute function public.audit_is_append_only();

-- ---------------------------------------------------------------------------------------------------------------
-- RPCs used by the app
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.confirm_booking(p_booking_id uuid) returns jsonb
language plpgsql
as $$
declare
  b public.bookings;
  c jsonb;
begin
  select * into b from public.bookings where id = p_booking_id;      -- RLS applies: invisible rows are "not found"
  if not found then raise exception 'Booking not found'; end if;
  c := public.check_booking_conflicts(b.id, b.organization_id, b.resource_id, b.check_in, b.check_out, b.adults, b.children, b.source, b.external_ref, b.guest_id);
  if jsonb_array_length(c) > 0 then
    insert into public.booking_audit_logs (organization_id, booking_id, actor_id, action, summary, meta)
    values (b.organization_id, b.id, (select id from public.team_members where organization_id = b.organization_id and user_id = auth.uid()),
            'conflict_detected', 'Confirmation refused — conflict detected', jsonb_build_object('conflicts', c));
    return jsonb_build_object('ok', false, 'conflicts', c);
  end if;
  update public.bookings set status = 'confirmed' where id = b.id;
  insert into public.booking_audit_logs (organization_id, booking_id, actor_id, action, summary)
  values (b.organization_id, b.id, (select id from public.team_members where organization_id = b.organization_id and user_id = auth.uid()),
          'confirmed', 'Booking confirmed — availability check passed');
  return jsonb_build_object('ok', true);
end $$;

-- Manager / owner exception for SOFT conflicts only (buffer, minimum stay, capacity). Hard conflicts can never be overridden.
create or replace function public.approve_conflict_override(p_booking_id uuid, p_reason text) returns jsonb
language plpgsql
as $$
declare
  b public.bookings;
  c jsonb;
  m uuid;
begin
  select * into b from public.bookings where id = p_booking_id;
  if not found then raise exception 'Booking not found'; end if;
  if not public.has_role(b.organization_id, array['owner', 'manager']::public.role_code[]) then
    raise exception 'Only managers and owners can approve exceptions';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  c := public.check_booking_conflicts(b.id, b.organization_id, b.resource_id, b.check_in, b.check_out, b.adults, b.children, b.source, b.external_ref, b.guest_id);
  if exists (select 1 from jsonb_array_elements(c) e where e ->> 'severity' = 'hard') then
    return jsonb_build_object('ok', false, 'error', 'hard_conflict', 'conflicts', c);
  end if;
  select id into m from public.team_members where organization_id = b.organization_id and user_id = auth.uid();
  perform set_config('bookingpilot.override_reason', p_reason, true);   -- transaction-local
  update public.bookings set status = 'confirmed',
         approval = coalesce(approval, '{}'::jsonb) || jsonb_build_object('status', 'approved', 'decidedBy', m, 'decidedAt', now(), 'decisionNote', p_reason)
   where id = b.id;
  update public.conflict_alerts set status = 'overridden', resolved_at = now(), resolved_by = m, resolution = p_reason where booking_id = b.id and status = 'open';
  insert into public.booking_audit_logs (organization_id, booking_id, actor_id, action, summary, meta)
  values (b.organization_id, b.id, m, 'conflict_override', 'Conflict OVERRIDDEN by manager: ' || p_reason, jsonb_build_object('conflicts', c));
  return jsonb_build_object('ok', true);
end $$;
