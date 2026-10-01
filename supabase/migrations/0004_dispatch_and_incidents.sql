-- Dispatch & Return Checklist, equipment incident reports, extended job status flow, edit reasons.
--   Confirmed → Dispatch Checklist Pending → Departed from HQ → Arrived at Site → In Progress
--   → Work Completed → Return Checklist Pending → Returned to HQ → Closed

/* ------------------------------------------------------------------ */
/* Statuses                                                            */
/* ------------------------------------------------------------------ */
alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check check (status in (
  'Pending','Confirmed','Dispatch Checklist Pending','Departed from HQ','Arrived at Site','In Progress',
  'Work Completed','Return Checklist Pending','Returned to HQ','Closed','Completed','Cancelled','Rescheduled'));   -- 'Completed' = legacy, treated as Closed
alter table public.assets drop constraint if exists assets_status_check;
alter table public.assets add constraint assets_status_check
  check (status in ('Available','Reserved','Checked Out','Under Maintenance','Damaged','Missing','Retired'));

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */
alter table public.audit_logs add column if not exists reason text;

create table public.dispatches (
  like app.base_columns including all,
  job_id text not null unique references public.jobs (id),
  stage text not null default 'Pending' check (stage in ('Pending','Departed','On Site','Returned')),
  -- issue list: kind, asset / inventory item, Asset ID (QR), required qty, loaded qty, condition, who confirmed (scan / typed ID / manual),
  -- responsible employee, photos, and on return: returned qty, condition, notes, repair flag, material used (= issued − returned)
  items jsonb not null default '[]',
  -- step 1: crew
  crew_present jsonb, crew_notes text,
  -- step 2: vehicle
  dep_veh_condition text check (dep_veh_condition in ('Good','With Issue')), dep_veh_photo text, dep_veh_notes text,
  dep_fuel text check (dep_fuel in ('Empty','1/4','1/2','3/4','Full')), dep_odo numeric(12,1),
  -- step 5: departure confirmation
  dep_at timestamp, dep_lat double precision, dep_lng double precision, dep_gps_note text, dep_photo text, dep_confirmed_by text, dep_confirmed_at timestamptz,
  dep_exception_reason text, dep_exception_sig text, dep_exception_status text check (dep_exception_status in ('Pending','Approved','Rejected')),
  dep_exception_by text, dep_exception_at timestamptz, dep_exception_note text,
  -- arrival at the client site
  arr_at timestamp, arr_lat double precision, arr_lng double precision, arr_gps_note text, arr_photos jsonb not null default '[]',
  arr_contact_name text, arr_contact_mobile text, arr_safety_briefing boolean, arr_briefing_notes text, arr_site_notes text, arr_requests text,
  -- return to headquarters
  ret_at timestamp, ret_lat double precision, ret_lng double precision, ret_gps_note text, ret_photos jsonb not null default '[]',
  ret_fuel text check (ret_fuel in ('Empty','1/4','1/2','3/4','Full')), ret_odo numeric(12,1),
  ret_veh_condition text check (ret_veh_condition in ('Good','With Issue')), ret_veh_notes text, ret_notes text,
  ret_confirmed_by text, ret_confirmed_at timestamptz, distance_km numeric(10,1),
  check (ret_odo is null or dep_odo is null or ret_odo >= dep_odo)
);

create table public.incidents (
  like app.base_columns including all,
  number text not null unique, job_id text, dispatch_id text references public.dispatches (id), asset_id text, item_id text,
  type text not null check (type in ('Missing asset','Damaged asset','Vehicle damage','Material shortage','Missing PPE','Safety','Other')),
  severity text not null check (severity in ('Low','Medium','High')), description text not null,
  status text not null default 'Open' check (status in ('Open','Investigating','Acknowledged','Resolved')),
  ticket_id text, resolution text, resolved_at timestamptz, auto boolean not null default false
);
create index on public.incidents (status) where deleted_at is null;
create index on public.incidents (job_id);

do $$
declare t text;
begin
  foreach t in array array['dispatches','incidents'] loop
    execute format('create trigger trg_touch before update on public.%I for each row execute function app.touch()', t);
    execute format('create trigger trg_no_delete before delete on public.%I for each row execute function app.no_hard_delete()', t);
    execute format('create trigger trg_audit after insert or update on public.%I for each row execute function app.audit()', t);
  end loop;
end $$;

/* ------------------------------------------------------------------ */
/* Edit reasons: every correction is audited with user, time, old / new value and reason */
/* ------------------------------------------------------------------ */
-- The client calls  select public.set_change_reason('…')  inside the same transaction before correcting a record.
create function public.set_change_reason(r text) returns void language sql as $$ select set_config('app.change_reason', coalesce(r, ''), true) $$;
create function app.change_reason() returns text language sql stable as $$ select nullif(trim(current_setting('app.change_reason', true)), '') $$;

create or replace function app.audit() returns trigger language plpgsql security definer set search_path = public as $$
declare rid text; act text; uname text;
begin
  select name into uname from public.profiles where id = auth.uid();
  if tg_op = 'INSERT' then rid := new.id; act := 'create';
  elsif tg_op = 'UPDATE' then rid := new.id; act := case when new.deleted_at is not null and old.deleted_at is null then 'delete' else 'update' end;
  else rid := old.id; act := 'delete'; end if;
  insert into public.audit_logs (user_id, user_name, action, table_name, record_id, summary, reason, before, after)
  values (coalesce(auth.uid()::text, 'system'), coalesce(uname, 'System'), act, tg_table_name, rid, initcap(act) || ' ' || tg_table_name, app.change_reason(),
          case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

/* ------------------------------------------------------------------ */
/* Dispatch rules                                                      */
/* ------------------------------------------------------------------ */
create function app.guard_dispatch() returns trigger language plpgsql as $$
declare order_ text[] := array['Pending','Departed','On Site','Returned'];
        gaps boolean;
begin
  if old.stage = 'Returned' then
    if app.change_reason() is null or not (app.has_perm('incidents.manage') or auth.uid() is null) then
      raise exception 'A completed dispatch record is locked. An Operations Manager or Admin can correct it with a reason.'; end if;
    return new;   -- corrected with a reason: audited by trg_audit
  end if;
  if array_position(order_, new.stage) < array_position(order_, old.stage) then raise exception 'Dispatch phases cannot go backwards.'; end if;

  if new.stage = 'Departed' and old.stage = 'Pending' then
    if new.dep_photo is null or new.dep_veh_photo is null or new.dep_fuel is null or coalesce(new.dep_odo, 0) <= 0 or new.dep_veh_condition is null
       or (new.dep_lat is null and coalesce(new.dep_gps_note, '') = '') or new.dep_confirmed_by is null then
      raise exception 'Departure requires the vehicle check, loading photo, GPS (or a reason) and the Team Leader confirmation.'; end if;
    if exists (select 1 from jsonb_array_elements(new.items) i where not coalesce((i->>'out_ok')::boolean, false)) then
      raise exception 'Confirm every checklist item before departure.'; end if;
    gaps := exists (select 1 from jsonb_array_elements(new.items) i
                    where coalesce((i->>'loaded_qty')::numeric, 0) < (i->>'qty')::numeric or i->>'out_condition' in ('Damaged','Missing') or i->>'out_container' in ('Damaged','Leaking'));
    if gaps and coalesce(new.dep_exception_status, '') <> 'Approved' then
      raise exception 'Required items are missing, damaged or short. An Operations Manager must approve a departure exception.'; end if;
  end if;
  -- exception decision
  if new.dep_exception_status is distinct from old.dep_exception_status and new.dep_exception_status in ('Approved','Rejected') then
    if not (app.has_perm('dispatch.approve') or auth.uid() is null) then raise exception 'Only an Operations Manager or Admin can decide departure exceptions.'; end if;
    new.dep_exception_by := coalesce(auth.uid()::text, new.dep_exception_by); new.dep_exception_at := now();
  end if;

  if new.stage = 'On Site' and old.stage <> 'On Site' and (jsonb_array_length(new.arr_photos) = 0 or not coalesce(new.arr_safety_briefing, false)
     or coalesce(new.arr_contact_name, '') = '' or (new.arr_lat is null and coalesce(new.arr_gps_note, '') = '')) then
    raise exception 'Arrival requires before-work photos, GPS, the site contact and a confirmed safety briefing.'; end if;

  if new.stage = 'Returned' then
    if jsonb_array_length(new.ret_photos) = 0 or new.ret_confirmed_by is null or (new.ret_lat is null and coalesce(new.ret_gps_note, '') = '') then
      raise exception 'Return requires the return photo, GPS (or a reason) and the Team Leader confirmation.'; end if;
    if exists (select 1 from jsonb_array_elements(new.items) i where coalesce((i->>'loaded_qty')::numeric, 0) > 0 and (i->>'returned_qty' is null or i->>'ret_condition' is null)) then
      raise exception 'Record the returned quantity and condition for every issued item.'; end if;
    if new.dep_odo is not null and (new.ret_odo is null or new.ret_fuel is null or new.ret_veh_condition is null) then
      raise exception 'Record the ending odometer, fuel level and vehicle condition.'; end if;
    new.ret_at := coalesce(new.ret_at, now() at time zone 'Asia/Manila');
  end if;
  return new;
end $$;
create trigger trg_guard_dispatch before update on public.dispatches for each row execute function app.guard_dispatch();

create function app.guard_incident() returns trigger language plpgsql as $$
begin
  if old.status = 'Resolved' and app.change_reason() is null and (to_jsonb(new) - array['updated_at','updated_by','deleted_at','deleted_by']) <> (to_jsonb(old) - array['updated_at','updated_by','deleted_at','deleted_by']) then
    raise exception 'A resolved incident is locked. Correct it with a reason.'; end if;
  if new.status <> old.status and not (app.has_perm('incidents.manage') or auth.uid() is null) then raise exception 'Only an Operations Manager or Admin can change an incident status.'; end if;
  if new.status in ('Resolved','Acknowledged') and coalesce(new.resolution, '') = '' then raise exception 'A resolution / acknowledgement note is required.'; end if;
  return new;
end $$;
create trigger trg_guard_incident before update on public.incidents for each row execute function app.guard_incident();

/* ------------------------------------------------------------------ */
/* Job status flow (forward only; override needs dispatch.approve + a reason) */
/* ------------------------------------------------------------------ */
create function app.guard_job_status() returns trigger language plpgsql as $$
declare ok boolean;
begin
  if new.status = old.status then return new; end if;
  ok := (old.status, new.status) in (
    ('Pending','Confirmed'),('Confirmed','Pending'),
    ('Confirmed','Dispatch Checklist Pending'),('Dispatch Checklist Pending','Departed from HQ'),('Departed from HQ','Arrived at Site'),
    ('Arrived at Site','In Progress'),('In Progress','Work Completed'),('In Progress','Completed'),('Work Completed','Return Checklist Pending'),
    ('Return Checklist Pending','Returned to HQ'),('Returned to HQ','Closed'))
    or (new.status in ('Cancelled','Rescheduled') and old.status in ('Pending','Confirmed','Dispatch Checklist Pending'))
    or old.status = 'Rescheduled';
  if not ok then
    if app.change_reason() is not null and (app.has_perm('dispatch.approve') or auth.uid() is null) then return new; end if;
    raise exception 'Job status cannot change from "%" to "%" except by an Operations Manager / Admin override with a reason.', old.status, new.status;
  end if;
  if new.status = 'Closed' and exists (select 1 from public.incidents i where i.job_id = new.id and i.deleted_at is null and i.status in ('Open','Investigating')) then
    raise exception 'Resolve or acknowledge the open incident reports before closing the job.'; end if;
  return new;
end $$;
create trigger trg_guard_job_status before update of status on public.jobs for each row execute function app.guard_job_status();

-- finished jobs no longer hold crew / vehicle / equipment
create or replace function app.guard_job_overlap() returns trigger language plpgsql as $$
declare jn text; done_ text[] := array['Cancelled','Rescheduled','Completed','Work Completed','Return Checklist Pending','Returned to HQ','Closed'];
begin
  if new.deleted_at is not null or new.status = any (done_) then return new; end if;
  select j.number into jn from public.jobs j
   where j.id <> new.id and j.deleted_at is null and not (j.status = any (done_)) and j.start_at < new.end_at and new.start_at < j.end_at
     and exists (
       select 1 from jsonb_array_elements_text(j.crew_ids || jsonb_build_array(coalesce(j.leader_id, ''))) a(p)
       join jsonb_array_elements_text(new.crew_ids || jsonb_build_array(coalesce(new.leader_id, ''))) b(p) on a.p = b.p and a.p <> '')
   limit 1;
  if jn is not null then raise exception 'Double-booking blocked: crew already assigned on %.', jn; end if;
  select j.number into jn from public.jobs j
   where j.id <> new.id and j.deleted_at is null and not (j.status = any (done_)) and j.start_at < new.end_at and new.start_at < j.end_at
     and ((new.vehicle_id is not null and j.vehicle_id = new.vehicle_id)
          or exists (select 1 from jsonb_array_elements_text(j.equipment_ids) a(e) join jsonb_array_elements_text(new.equipment_ids) b(e) on a.e = b.e))
   limit 1;
  if jn is not null then raise exception 'Double-booking blocked: vehicle or equipment already assigned on %.', jn; end if;
  return new;
end $$;

/* ------------------------------------------------------------------ */
/* RLS                                                                 */
/* ------------------------------------------------------------------ */
alter table public.dispatches enable row level security;
alter table public.incidents enable row level security;
create policy dsp_select on public.dispatches for select using (
  app.has_perm('dispatch.view') and (app.has_perm('jobs.all') or exists (select 1 from public.jobs j where j.id = job_id and (j.leader_id = app.my_employee() or j.crew_ids ? app.my_employee()))));
create policy dsp_insert on public.dispatches for insert with check (app.has_perm('dispatch.run'));
create policy dsp_update on public.dispatches for update using (
  app.has_perm('dispatch.approve') or (app.has_perm('dispatch.run') and (app.has_perm('jobs.all') or exists (select 1 from public.jobs j where j.id = job_id and (j.leader_id = app.my_employee() or j.crew_ids ? app.my_employee())))));
create policy inc_select on public.incidents for select using (app.has_perm('dispatch.view') or app.has_perm('incidents.manage'));
create policy inc_insert on public.incidents for insert with check (app.has_perm('dispatch.run') or app.has_perm('incidents.manage'));
create policy inc_update on public.incidents for update using (app.has_perm('incidents.manage'));

insert into public.role_permissions (role, permission) values
  ('owner','dispatch.view'),('owner','dispatch.run'),('owner','dispatch.approve'),('owner','incidents.manage'),
  ('ops','dispatch.view'),('ops','dispatch.run'),('ops','dispatch.approve'),('ops','incidents.manage'),
  ('leader','dispatch.view'),('leader','dispatch.run'),('field','dispatch.view')
on conflict do nothing;

-- QR payload convention: TOPMOP:ASSET:<assets.code>  (labels are generated in the app; the manual Asset ID entry fallback uses the same code).
