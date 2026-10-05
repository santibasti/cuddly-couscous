-- BookingPilot — Row Level Security. Every table is tenant-scoped by organization_id; roles narrow it further.

-- ---------------------------------------------------------------------------------------------------------------
-- Helpers (security definer so they can read team_members without recursing through its own policies)
-- ---------------------------------------------------------------------------------------------------------------
create or replace function public.org_role(p_org uuid) returns public.role_code
language sql stable security definer set search_path = public as $$
  select role from public.team_members where organization_id = p_org and user_id = auth.uid() and active limit 1
$$;

create or replace function public.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members where organization_id = p_org and user_id = auth.uid() and active)
$$;

create or replace function public.has_role(p_org uuid, p_roles public.role_code[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.org_role(p_org) = any (p_roles), false)
$$;

-- Reservation staff only see the resources they are assigned to (empty list = all).
create or replace function public.can_see_resource(p_org uuid, p_resource uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_members m
    where m.organization_id = p_org and m.user_id = auth.uid() and m.active
      and (m.role <> 'staff' or cardinality(m.resource_ids) = 0 or p_resource = any (m.resource_ids))
  )
$$;

create or replace function public.can_see_booking(p_booking uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bookings b where b.id = p_booking and public.can_see_resource(b.organization_id, b.resource_id))
$$;

-- Create an organization and become its owner in one step.
create or replace function public.create_organization(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = public as $$
declare o uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into public.organizations (name, slug) values (p_name, p_slug) returning id into o;
  insert into public.team_members (organization_id, user_id, role) values (o, auth.uid(), 'owner');
  return o;
end $$;

-- ---------------------------------------------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['roles', 'organizations', 'users', 'team_members', 'properties', 'resources', 'resource_availability', 'blocked_dates',
    'booking_channels', 'channel_connections', 'guests', 'bookings', 'booking_items', 'booking_payments', 'conversations', 'booking_messages',
    'booking_notes', 'booking_attachments', 'booking_audit_logs', 'conflict_alerts', 'notification_settings', 'message_templates']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- reference tables: readable by any signed-in user
create policy roles_read on public.roles for select using (auth.uid() is not null);
create policy channels_catalog_read on public.booking_channels for select using (auth.uid() is not null);

-- organizations
create policy org_select on public.organizations for select using (public.is_member(id));
create policy org_update on public.organizations for update using (public.has_role(id, array['owner']::public.role_code[])) with check (public.has_role(id, array['owner']::public.role_code[]));
create policy org_delete on public.organizations for delete using (public.has_role(id, array['owner']::public.role_code[]));

-- users (profiles)
create policy users_select on public.users for select using (
  id = auth.uid() or exists (select 1 from public.team_members a join public.team_members b on a.organization_id = b.organization_id where a.user_id = auth.uid() and b.user_id = users.id and a.active)
);
create policy users_insert on public.users for insert with check (id = auth.uid());
create policy users_update on public.users for update using (id = auth.uid()) with check (id = auth.uid());

-- team_members: everyone in the org can see the team; only the owner changes it
create policy tm_select on public.team_members for select using (public.is_member(organization_id));
create policy tm_write on public.team_members for all using (public.has_role(organization_id, array['owner']::public.role_code[])) with check (public.has_role(organization_id, array['owner']::public.role_code[]));

-- properties & resources
create policy prop_select on public.properties for select using (public.is_member(organization_id));
create policy prop_write on public.properties for all using (public.has_role(organization_id, array['owner', 'manager']::public.role_code[])) with check (public.has_role(organization_id, array['owner', 'manager']::public.role_code[]));
create policy res_select on public.resources for select using (public.can_see_resource(organization_id, id));
create policy res_write on public.resources for all using (public.has_role(organization_id, array['owner', 'manager']::public.role_code[])) with check (public.has_role(organization_id, array['owner', 'manager']::public.role_code[]));
create policy avail_select on public.resource_availability for select using (public.can_see_resource(organization_id, resource_id));
create policy avail_write on public.resource_availability for all using (public.has_role(organization_id, array['owner', 'manager']::public.role_code[])) with check (public.has_role(organization_id, array['owner', 'manager']::public.role_code[]));
create policy blocked_select on public.blocked_dates for select using (public.can_see_resource(organization_id, resource_id));
create policy blocked_write on public.blocked_dates for all
  using (public.has_role(organization_id, array['owner', 'manager', 'staff']::public.role_code[]) and public.can_see_resource(organization_id, resource_id))
  with check (public.has_role(organization_id, array['owner', 'manager', 'staff']::public.role_code[]) and public.can_see_resource(organization_id, resource_id));

-- channels: owners and managers only (staff and viewers never see integration state or mappings)
create policy conn_select on public.channel_connections for select using (public.has_role(organization_id, array['owner', 'manager']::public.role_code[]));
create policy conn_write on public.channel_connections for all using (public.has_role(organization_id, array['owner', 'manager']::public.role_code[])) with check (public.has_role(organization_id, array['owner', 'manager']::public.role_code[]));

-- guests & inbox: owner / manager / staff
create policy guests_select on public.guests for select using (public.has_role(organization_id, array['owner', 'manager', 'staff']::public.role_code[]));
create policy guests_write on public.guests for all using (public.has_role(organization_id, array['owner', 'manager', 'staff']::public.role_code[])) with check (public.has_role(organization_id, array['owner', 'manager', 'staff']::public.role_code[]));
create policy conv_all on public.conversations for all using (public.has_role(organization_id, array['owner', 'manager', 'staff']::public.role_code[])) with check (public.has_role(organization_id, array['owner', 'manager', 'staff']::public.role_code[]));
create policy msg_all on public.booking_messages for all using (public.has_role(organization_id, array['owner', 'manager', 'staff']::public.role_code[])) with check (public.has_role(organization_id, array['owner', 'manager', 'staff']::public.role_code[]));

-- bookings: everyone in the org sees what their resource assignment allows; viewers read only
create policy bookings_select on public.bookings for select using (public.can_see_resource(organization_id, resource_id));
create policy bookings_insert on public.bookings for insert with check (public.has_role(organization_id, array['owner', 'manager', 'staff']::public.role_code[]) and public.can_see_resource(organization_id, resource_id));
create policy bookings_update on public.bookings for update
  using (public.has_role(organization_id, array['owner', 'manager', 'staff']::public.role_code[]) and public.can_see_resource(organization_id, resource_id))
  with check (public.has_role(organization_id, array['owner', 'manager', 'staff']::public.role_code[]) and public.can_see_resource(organization_id, resource_id));
create policy bookings_delete on public.bookings for delete using (public.has_role(organization_id, array['owner', 'manager']::public.role_code[]));

-- booking children inherit visibility from the booking
do $$
declare t text;
begin
  foreach t in array array['booking_items', 'booking_payments', 'booking_notes', 'booking_attachments', 'conflict_alerts']
  loop
    execute format('create policy %I on public.%I for select using (public.can_see_booking(booking_id))', t || '_select', t);
    execute format($p$create policy %I on public.%I for all using (public.has_role(organization_id, array['owner','manager','staff']::public.role_code[]) and public.can_see_booking(booking_id))
                     with check (public.has_role(organization_id, array['owner','manager','staff']::public.role_code[]) and public.can_see_booking(booking_id))$p$, t || '_write', t);
  end loop;
end $$;

-- audit: readable with the booking; org-level entries (no booking) for owner/manager; insert-only (no update/delete policy => denied)
create policy audit_select on public.booking_audit_logs for select using (
  (booking_id is not null and public.can_see_booking(booking_id)) or (booking_id is null and public.has_role(organization_id, array['owner', 'manager']::public.role_code[]))
);
create policy audit_insert on public.booking_audit_logs for insert with check (public.has_role(organization_id, array['owner', 'manager', 'staff']::public.role_code[]));

-- notification settings: your own rows
create policy notif_own on public.notification_settings for all using (user_id = auth.uid() and public.is_member(organization_id)) with check (user_id = auth.uid() and public.is_member(organization_id));

-- templates
create policy tpl_select on public.message_templates for select using (public.has_role(organization_id, array['owner', 'manager', 'staff']::public.role_code[]));
create policy tpl_write on public.message_templates for all using (public.has_role(organization_id, array['owner', 'manager']::public.role_code[])) with check (public.has_role(organization_id, array['owner', 'manager']::public.role_code[]));
