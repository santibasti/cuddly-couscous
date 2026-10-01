-- Job workflow (inside every Job Card), variations, equipment incident reports, job status flow, edit reasons.
--   1 Equipment Checklist (HQ) → 2 Dispatch → 3 Site Arrival + Attendance → 4 Quotation / Conforme → 5 Start Work →
--   6 Final Quotation / Variation → 7 Service Report + Client Signature → 8 Equipment Checklist (Return) → 9 Leave Site →
--   10 Arrived at HQ → 11 Job Closed
-- Job status: Confirmed → Dispatch Checklist Pending → Dispatched → On Site → In Progress → Work Completed → Leaving Site → Arrived at HQ → Closed

/* ------------------------------------------------------------------ */
/* Statuses                                                            */
/* ------------------------------------------------------------------ */
alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check check (status in (
  'Pending','Confirmed','Dispatch Checklist Pending','Dispatched','On Site','In Progress',
  'Work Completed','Leaving Site','Arrived at HQ','Closed','Completed','Cancelled','Rescheduled'));   -- 'Completed' = legacy, treated as Closed
alter table public.assets drop constraint if exists assets_status_check;
update public.assets set status = 'In Use' where status = 'Checked Out';
alter table public.assets add constraint assets_status_check
  check (status in ('Available','Reserved','In Use','Under Maintenance','Damaged','Missing','Retired'));

-- checked-out equipment is "In Use" (was "Checked Out")
create or replace function app.checkout_side_effects() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'Released' and (tg_op = 'INSERT' or old.status <> 'Released') then
    update public.assets set status = 'In Use', custodian_id = new.responsible_id, location = 'On site', condition = coalesce(new.out_condition, condition), meter_reading = coalesce(new.out_meter, meter_reading) where id = new.asset_id;
  elsif new.status = 'Returned' and old.status = 'Released' then
    if new.in_condition in ('Damaged','Poor') or coalesce(new.damage_notes, '') <> '' then
      update public.assets set status = 'Damaged', condition = new.in_condition, location = 'Workshop', custodian_id = null, meter_reading = coalesce(new.in_meter, meter_reading) where id = new.asset_id;
      insert into public.tickets (asset_id, source, checkout_id, description, status, opened_on)
      values (new.asset_id, 'Damage report', new.id, coalesce(new.damage_notes, 'Damage reported on return') || case when coalesce(new.missing_accessories, '') <> '' then ' | Missing: ' || new.missing_accessories else '' end, 'Open', (now() at time zone 'Asia/Manila')::date);
    else
      update public.assets set status = 'Available', condition = coalesce(new.in_condition, condition), custodian_id = null, meter_reading = coalesce(new.in_meter, meter_reading) where id = new.asset_id;
    end if;
  end if;
  return new;
end $$;

/* ------------------------------------------------------------------ */
/* Tables                                                              */
/* ------------------------------------------------------------------ */
alter table public.audit_logs add column if not exists reason text;

-- One workflow record per job: every step stores its date / time (*_at), user (*_by), notes, photos and GPS where applicable.
create table public.workflows (
  like app.base_columns including all,
  job_id text not null unique references public.jobs (id),
  -- issue list: kind, asset / inventory item, Asset ID (QR), required qty, loaded qty, condition, who confirmed (scan / typed ID / manual),
  -- responsible employee, photos; at the return check: returned qty, condition, notes, repair flag, material used (= issued − returned)
  items jsonb not null default '[]',
  -- glass panel counting table: [{id, area, side, external, internal, notes, additional}]
  panels jsonb not null default '[]',
  -- 1 Equipment Checklist (HQ)
  hq_at timestamp, hq_by text, hq_odo numeric(12,1), hq_fuel text check (hq_fuel in ('Empty','1/4','1/2','3/4','Full')),
  hq_veh_condition text check (hq_veh_condition in ('Good','With Issue')), hq_veh_photo text, hq_veh_notes text, hq_notes text, hq_shortage_reason text,
  -- 2 Dispatch
  disp_at timestamp, disp_by text, disp_lat double precision, disp_lng double precision, disp_gps_note text, disp_photo text, disp_notes text,
  -- 3 Site Arrival + Attendance
  arr_at timestamp, arr_by text, arr_lat double precision, arr_lng double precision, arr_gps_note text, arr_photos jsonb not null default '[]',
  arr_contact_name text, arr_contact_mobile text, arr_notes text, arr_crew_present jsonb, arr_crew_absent jsonb,
  -- 4 Quotation / Conforme (the original quotation is only referenced, never modified)
  conf_at timestamp, conf_by text, conf_quotation_id text references public.quotations (id), conf_original_total numeric(14,2),
  conf_name text, conf_signature text, conf_file text, conf_file_name text, conf_notes text,
  -- 5 Start Work
  start_at timestamp, start_by text, start_crew_present jsonb, start_safety boolean, start_ppe boolean, start_photos jsonb not null default '[]', start_notes text,
  -- 7 Service Accomplishment Report
  rep_at timestamp, rep_by text, rep_scope text, rep_method text, rep_findings text, rep_limits text, rep_recs text, rep_complimentary text,
  rep_client_name text, rep_client_sig text, rep_client_at timestamp, rep_tm_name text, rep_tm_sig text, rep_rating int check (rep_rating between 1 and 5), rep_notes text,
  -- 8 Equipment Checklist (Return, at the client site)
  rc_at timestamp, rc_by text, rc_notes text, rc_photos jsonb not null default '[]',
  -- 9 Leave Site
  leave_at timestamp, leave_by text, leave_lat double precision, leave_lng double precision, leave_gps_note text, leave_photo text, leave_notes text,
  -- 10 Arrived at HQ
  hqa_at timestamp, hqa_by text, hqa_lat double precision, hqa_lng double precision, hqa_gps_note text, hqa_odo numeric(12,1),
  hqa_fuel text check (hqa_fuel in ('Empty','1/4','1/2','3/4','Full')), hqa_veh_condition text check (hqa_veh_condition in ('Good','With Issue')), hqa_veh_notes text,
  hqa_equipment_ok boolean, hqa_notes text, distance_km numeric(10,1),
  -- 11 Job Closed
  closed_at timestamp, closed_by text, closed_notes text,
  check (hqa_odo is null or hq_odo is null or hqa_odo >= hq_odo)
);

create table public.variations (
  like app.base_columns including all,
  job_id text not null references public.jobs (id),
  number text not null unique,                       -- e.g. JOB-2026-0123-V1
  reason text not null,
  items jsonb not null default '[]',                 -- same line shape as quotations.items
  discount numeric(14,2) not null default 0 check (discount >= 0),
  vat_mode text not null default 'exclusive' check (vat_mode in ('exclusive','inclusive','none')), vat_rate numeric(5,2) not null default 12,
  panel_row_ids jsonb not null default '[]',         -- additional glass panels linked from workflows.panels
  status text not null default 'Draft' check (status in ('Draft','Pending Approval','Approved','Rejected')),
  client_name text, client_signature text, signed_at timestamptz, signed_file text, signed_file_name text, decided_by text, notes text
);
create index on public.variations (job_id);

create table public.incidents (
  like app.base_columns including all,
  number text not null unique, job_id text, workflow_id text references public.workflows (id), asset_id text, item_id text,
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
  foreach t in array array['workflows','variations','incidents'] loop
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
/* Workflow rules: steps run in order, each with its required evidence */
/* ------------------------------------------------------------------ */
create function app.guard_workflow() returns trigger language plpgsql as $$
declare corrected boolean := app.change_reason() is not null and (app.has_perm('incidents.manage') or auth.uid() is null);
        j record; open_inc int; pending_var int;
begin
  if old.closed_at is not null then
    if not corrected then raise exception 'A closed job workflow is locked. An Operations Manager or Admin can correct it with a reason.'; end if;
    return new;
  end if;
  if corrected then return new; end if;     -- corrections are audited with the reason by trg_audit
  -- a recorded step cannot be un-recorded
  if (old.hq_at is not null and new.hq_at is null) or (old.disp_at is not null and new.disp_at is null) or (old.arr_at is not null and new.arr_at is null)
     or (old.conf_at is not null and new.conf_at is null) or (old.start_at is not null and new.start_at is null) or (old.rep_at is not null and new.rep_at is null)
     or (old.rc_at is not null and new.rc_at is null) or (old.leave_at is not null and new.leave_at is null) or (old.hqa_at is not null and new.hqa_at is null) then
    raise exception 'A completed workflow step cannot be undone. Correct the record with a reason instead.'; end if;
  select * into j from public.jobs where id = new.job_id;

  if new.hq_at is not null and old.hq_at is null then
    if exists (select 1 from jsonb_array_elements(new.items) i where not coalesce((i->>'out_ok')::boolean, false)) then raise exception 'Confirm every checklist item.'; end if;
    if exists (select 1 from jsonb_array_elements(new.items) i where i->>'kind' = 'vehicle') and (coalesce(new.hq_odo, 0) <= 0 or new.hq_fuel is null) then
      raise exception 'Record the starting odometer and fuel level.'; end if;
    if exists (select 1 from jsonb_array_elements(new.items) i
               where coalesce((i->>'loaded_qty')::numeric, 0) < (i->>'qty')::numeric or i->>'out_condition' in ('Damaged','Missing') or i->>'out_container' in ('Damaged','Leaking'))
       and coalesce(new.hq_shortage_reason, '') = '' then
      raise exception 'Items are short, damaged or missing: enter the reason for proceeding.'; end if;
  end if;
  if new.disp_at is not null and old.disp_at is null then
    if new.hq_at is null then raise exception 'Complete the HQ equipment checklist first.'; end if;
    if new.disp_lat is null and coalesce(new.disp_gps_note, '') = '' then raise exception 'Dispatch needs the departure GPS (or a reason).'; end if;
  end if;
  if new.arr_at is not null and old.arr_at is null then
    if new.disp_at is null then raise exception 'Dispatch the crew first.'; end if;
    if jsonb_array_length(new.arr_photos) = 0 or coalesce(new.arr_contact_name, '') = '' or (new.arr_lat is null and coalesce(new.arr_gps_note, '') = '')
       or coalesce(jsonb_array_length(new.arr_crew_present), 0) = 0 then
      raise exception 'Arrival needs before-work photos, GPS, the site contact and confirmed crew attendance.'; end if;
  end if;
  if new.conf_at is not null and old.conf_at is null then
    if new.arr_at is null then raise exception 'Record the site arrival first.'; end if;
    if coalesce(new.conf_name, '') = '' or (new.conf_signature is null and new.conf_file is null) then raise exception 'The conforme needs the client name and a signature or signed copy.'; end if;
  end if;
  if new.start_at is not null and old.start_at is null then
    if new.conf_at is null then raise exception 'Work cannot start until the client conforme is signed.'; end if;
    if not coalesce(new.start_safety, false) or not coalesce(new.start_ppe, false) or jsonb_array_length(new.start_photos) = 0 then
      raise exception 'Starting work needs the safety briefing, PPE confirmation and a work-start photo.'; end if;
  end if;
  if new.rep_at is not null and old.rep_at is null then
    if new.start_at is null then raise exception 'Start the work first.'; end if;
    select count(*) into pending_var from public.variations v where v.job_id = new.job_id and v.deleted_at is null and v.status in ('Draft','Pending Approval');
    if pending_var > 0 then raise exception 'Variations are waiting for client approval.'; end if;
    if new.rep_client_sig is null or new.rep_tm_sig is null or coalesce(new.rep_client_name, '') = '' or coalesce(new.rep_scope, '') = '' then
      raise exception 'The service report needs the scope, the client signature and the TopMop representative signature.'; end if;
  end if;
  if new.rc_at is not null and old.rc_at is null then
    if new.rep_at is null then raise exception 'Sign the service report before the return equipment check.'; end if;
    if jsonb_array_length(new.rc_photos) = 0 then raise exception 'The return check needs at least one photo.'; end if;
    if exists (select 1 from jsonb_array_elements(new.items) i where i->>'kind' <> 'vehicle' and coalesce((i->>'loaded_qty')::numeric, 0) > 0 and (i->>'returned_qty' is null or i->>'ret_condition' is null)) then
      raise exception 'Record the returned quantity and condition for every issued item.'; end if;
  end if;
  if new.leave_at is not null and old.leave_at is null then
    if new.rc_at is null then raise exception 'Complete the return equipment check before leaving the site.'; end if;
    if new.leave_lat is null and coalesce(new.leave_gps_note, '') = '' then raise exception 'Leaving the site needs GPS (or a reason).'; end if;
  end if;
  if new.hqa_at is not null and old.hqa_at is null then
    if new.leave_at is null then raise exception 'Record leaving the site first.'; end if;
    if (new.hqa_lat is null and coalesce(new.hqa_gps_note, '') = '') or not coalesce(new.hqa_equipment_ok, false) then raise exception 'Arrival at HQ needs GPS (or a reason) and the final equipment confirmation.'; end if;
    if exists (select 1 from jsonb_array_elements(new.items) i where i->>'kind' = 'vehicle') and (new.hqa_odo is null or new.hqa_fuel is null or new.hqa_veh_condition is null) then
      raise exception 'Record the ending odometer, fuel level and vehicle condition.'; end if;
  end if;
  if new.closed_at is not null then
    if new.hqa_at is null or new.rc_at is null or new.rep_at is null or new.conf_at is null or new.arr_at is null then raise exception 'The job cannot be closed yet: finish every earlier step.'; end if;
    select count(*) into open_inc from public.incidents i where i.job_id = new.job_id and i.deleted_at is null and i.status in ('Open','Investigating');
    if open_inc > 0 then raise exception 'Resolve or acknowledge the open incident reports before closing the job.'; end if;
    if exists (select 1 from jsonb_array_elements(j.materials) m where m->>'used_qty' is null) then raise exception 'Record material usage for every job material before closing.'; end if;
  end if;
  return new;
end $$;
create trigger trg_guard_workflow before update on public.workflows for each row execute function app.guard_workflow();

/* Variations: an approved variation is locked; approval needs the client's signature; approval adds its net amount to the contract value. */
create function app.doc_net(items jsonb, doc_discount numeric, vat_mode text, vat_rate numeric) returns numeric language sql immutable as $$
  select round(case when vat_mode = 'inclusive' then g / (1 + vat_rate / 100) else g end, 2)
  from (select greatest(0, coalesce(sum((i->>'qty')::numeric * (i->>'rate')::numeric - coalesce((i->>'discount')::numeric, 0)), 0) - coalesce(doc_discount, 0)) as g
        from jsonb_array_elements(items) i) s
$$;
create function app.guard_variation() returns trigger language plpgsql as $$
begin
  if old.status = 'Approved' and (to_jsonb(new) - array['updated_at','updated_by','deleted_at','deleted_by']) <> (to_jsonb(old) - array['updated_at','updated_by','deleted_at','deleted_by'])
     and not (app.change_reason() is not null and (app.has_perm('incidents.manage') or auth.uid() is null)) then
    raise exception 'An approved variation is locked. Create a new variation or correct it with a reason.'; end if;
  if new.status = 'Approved' and old.status <> 'Approved' then
    if coalesce(new.client_name, '') = '' or (new.client_signature is null and new.signed_file is null) then raise exception 'Client approval needs the client name and a signature.'; end if;
    if not exists (select 1 from public.workflows w where w.job_id = new.job_id and w.start_at is not null) then raise exception 'Variations can be approved once work has started.'; end if;
    if exists (select 1 from public.workflows w where w.job_id = new.job_id and w.rep_at is not null) then raise exception 'The service report is signed; no more variations can be approved.'; end if;
    new.signed_at := coalesce(new.signed_at, now());
    update public.jobs set contract_amount = round(contract_amount + app.doc_net(new.items, new.discount, new.vat_mode, new.vat_rate), 2) where id = new.job_id;
  end if;
  return new;
end $$;
create trigger trg_guard_variation before update on public.variations for each row execute function app.guard_variation();

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
    ('Confirmed','Dispatch Checklist Pending'),('Dispatch Checklist Pending','Dispatched'),('Dispatched','On Site'),
    ('On Site','In Progress'),('In Progress','Work Completed'),('In Progress','Completed'),('Work Completed','Leaving Site'),
    ('Leaving Site','Arrived at HQ'),('Arrived at HQ','Closed'))
    or (new.status in ('Cancelled','Rescheduled') and old.status in ('Pending','Confirmed','Dispatch Checklist Pending'))
    or old.status = 'Rescheduled';
  if not ok then
    if app.change_reason() is not null and (app.has_perm('dispatch.approve') or auth.uid() is null) then return new; end if;
    raise exception 'Job status cannot change from "%" to "%" except by an Operations Manager / Admin override with a reason.', old.status, new.status;
  end if;
  if new.status = 'Closed' and (exists (select 1 from public.incidents i where i.job_id = new.id and i.deleted_at is null and i.status in ('Open','Investigating'))
     or not exists (select 1 from public.workflows w where w.job_id = new.id and w.closed_at is not null)) then
    raise exception 'Close the job from the workflow (all steps done, incidents resolved or acknowledged).'; end if;
  return new;
end $$;
create trigger trg_guard_job_status before update of status on public.jobs for each row execute function app.guard_job_status();

-- finished jobs no longer hold crew / vehicle / equipment
create or replace function app.guard_job_overlap() returns trigger language plpgsql as $$
declare jn text; done_ text[] := array['Cancelled','Rescheduled','Completed','Work Completed','Leaving Site','Arrived at HQ','Closed'];
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
alter table public.workflows enable row level security;
alter table public.variations enable row level security;
alter table public.incidents enable row level security;
create policy wf_select on public.workflows for select using (
  app.has_perm('dispatch.view') and (app.has_perm('jobs.all') or exists (select 1 from public.jobs j where j.id = job_id and (j.leader_id = app.my_employee() or j.crew_ids ? app.my_employee()))));
create policy wf_insert on public.workflows for insert with check (app.has_perm('dispatch.run'));
create policy wf_update on public.workflows for update using (
  app.has_perm('dispatch.approve') or app.has_perm('incidents.manage') or (app.has_perm('dispatch.run') and (app.has_perm('jobs.all') or exists (select 1 from public.jobs j where j.id = job_id and (j.leader_id = app.my_employee() or j.crew_ids ? app.my_employee())))));
create policy var_select on public.variations for select using (
  app.has_perm('dispatch.view') and (app.has_perm('jobs.all') or exists (select 1 from public.jobs j where j.id = job_id and (j.leader_id = app.my_employee() or j.crew_ids ? app.my_employee()))));
create policy var_insert on public.variations for insert with check (app.has_perm('dispatch.run'));
create policy var_update on public.variations for update using (app.has_perm('dispatch.run') or app.has_perm('incidents.manage'));
create policy inc_select on public.incidents for select using (app.has_perm('dispatch.view') or app.has_perm('incidents.manage'));
create policy inc_insert on public.incidents for insert with check (app.has_perm('dispatch.run') or app.has_perm('incidents.manage'));
create policy inc_update on public.incidents for update using (app.has_perm('incidents.manage'));

-- Role permissions (dispatch.view / dispatch.run / dispatch.approve / incidents.manage) are part of 0003_role_permissions.sql.
-- QR payload convention: TOPMOP:ASSET:<assets.code>  (labels are generated in the app; the manual Asset ID entry fallback uses the same code).
