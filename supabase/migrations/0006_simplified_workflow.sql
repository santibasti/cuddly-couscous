-- Simplified 7-step job workflow: 1 Job Prep at HQ → 2 Dispatch → 3 Site Check-In → 4 Scope Approval → 5 Work in Progress → 6 Client Handover → 7 Close-Out.
-- Odometer fields and in-app photo storage are removed (TopMop keeps job / equipment photos in its own file system).
-- NOTE: this drops columns — export anything you still need before applying it to a database with real data.
-- The (empty) storage buckets job-photos, equipment-photos and attendance-selfies from 0002 are no longer used.

alter table public.workflows
  drop column if exists hq_odo, drop column if exists hq_veh_condition, drop column if exists hq_veh_photo, drop column if exists hq_veh_notes,
  drop column if exists disp_lat, drop column if exists disp_lng, drop column if exists disp_gps_note, drop column if exists disp_photo, drop column if exists disp_notes,
  drop column if exists arr_lat, drop column if exists arr_lng, drop column if exists arr_gps_note, drop column if exists arr_photos,
  drop column if exists conf_file, drop column if exists conf_file_name,
  drop column if exists start_crew_present, drop column if exists start_safety, drop column if exists start_ppe, drop column if exists start_photos, drop column if exists start_notes,
  drop column if exists rc_photos,
  drop column if exists leave_lat, drop column if exists leave_lng, drop column if exists leave_gps_note, drop column if exists leave_photo, drop column if exists leave_notes,
  drop column if exists hqa_lat, drop column if exists hqa_lng, drop column if exists hqa_gps_note, drop column if exists hqa_odo, drop column if exists hqa_veh_condition,
  drop column if exists hqa_veh_notes, drop column if exists hqa_equipment_ok, drop column if exists hqa_notes, drop column if exists distance_km;
alter table public.workflows
  add column scope_changed boolean not null default false,
  add column conf_mode text check (conf_mode in ('approval','confirmed')),     -- approval = client signed; confirmed = recurring job, no change
  add column finish_at timestamp, add column finish_by text, add column work_notes text;
alter table public.variations drop column if exists signed_file, drop column if exists signed_file_name;
alter table public.jobs drop column if exists photos;
alter table public.attendance drop column if exists in_photo, drop column if exists out_photo;
alter table public.checkouts drop column if exists out_photos, drop column if exists in_photos;

-- Workflow rules: steps run in order. Dispatch = time + confirmation; check-in = time, site contact, crew attendance; scope approval is
-- a signed conforme (new job / changed scope) or a leader confirmation (recurring, no change); work = start / finish times.
create or replace function app.guard_workflow() returns trigger language plpgsql as $$
declare corrected boolean := app.change_reason() is not null and (app.has_perm('incidents.manage') or auth.uid() is null);
        pending_var int;
begin
  if old.closed_at is not null then
    if not corrected then raise exception 'A closed job workflow is locked. An Operations Manager or Admin can correct it with a reason.'; end if;
    return new;
  end if;
  if corrected then return new; end if;     -- corrections are audited with the reason by trg_audit
  if (old.hq_at is not null and new.hq_at is null) or (old.disp_at is not null and new.disp_at is null) or (old.arr_at is not null and new.arr_at is null)
     or (old.conf_at is not null and new.conf_at is null) or (old.start_at is not null and new.start_at is null) or (old.finish_at is not null and new.finish_at is null)
     or (old.rep_at is not null and new.rep_at is null) then
    raise exception 'A completed workflow step cannot be undone. Correct the record with a reason instead.'; end if;

  if new.hq_at is not null and old.hq_at is null then
    if exists (select 1 from jsonb_array_elements(new.items) i where not coalesce((i->>'out_ok')::boolean, false)) then raise exception 'Confirm every checklist item.'; end if;
    if exists (select 1 from jsonb_array_elements(new.items) i
               where coalesce((i->>'loaded_qty')::numeric, 0) < (i->>'qty')::numeric and i->>'kind' <> 'vehicle' or i->>'out_condition' in ('Damaged','Missing') or i->>'out_container' in ('Damaged','Leaking'))
       and coalesce(new.hq_shortage_reason, '') = '' then
      raise exception 'Items are short, damaged or missing: enter the reason for proceeding.'; end if;
  end if;
  if new.disp_at is not null and old.disp_at is null and new.hq_at is null then raise exception 'Complete job prep first.'; end if;
  if new.arr_at is not null and old.arr_at is null then
    if new.disp_at is null then raise exception 'Dispatch the crew first.'; end if;
    if new.arr_at < new.disp_at then raise exception 'The arrival time cannot be before the departure.'; end if;
    if coalesce(new.arr_contact_name, '') = '' or coalesce(jsonb_array_length(new.arr_crew_present), 0) = 0 then raise exception 'Check-in needs the site contact and confirmed crew attendance.'; end if;
  end if;
  if new.conf_at is not null and old.conf_at is null then
    if new.arr_at is null then raise exception 'Check in at the site first.'; end if;
    if exists (select 1 from public.variations v where v.job_id = new.job_id and v.source = 'final_review' and v.status = 'Draft' and jsonb_array_length(v.items) > 0 and v.deleted_at is null) then
      raise exception 'Additional work is waiting for the client: approve, decline or revise it before the scope is approved.'; end if;
    if new.conf_mode = 'approval' and (coalesce(new.conf_name, '') = '' or new.conf_signature is null) then raise exception 'The conforme needs the client name and signature.'; end if;
    if new.conf_mode is null then raise exception 'Choose how the scope was approved (client signature or confirmed – no changes).'; end if;
  end if;
  if new.start_at is not null and old.start_at is null and new.conf_at is null then raise exception 'Work cannot start until the scope is approved.'; end if;
  if new.finish_at is not null and old.finish_at is null then
    if new.start_at is null then raise exception 'Start the work first.'; end if;
    if new.finish_at < new.start_at then raise exception 'The finish time cannot be before the start.'; end if;
    select count(*) into pending_var from public.variations v where v.job_id = new.job_id and v.deleted_at is null and v.status in ('Draft','Pending Approval') and jsonb_array_length(v.items) > 0;
    if pending_var > 0 then raise exception 'Variations are waiting for client approval.'; end if;
  end if;
  if new.rep_at is not null and old.rep_at is null then
    if new.finish_at is null then raise exception 'Finish the work before the client handover.'; end if;
    if new.rep_client_sig is null or new.rep_tm_sig is null or coalesce(new.rep_client_name, '') = '' or coalesce(new.rep_scope, '') = ''
       or coalesce(new.rep_findings, '') = '' or coalesce(new.rep_recs, '') = '' or coalesce(new.rep_limits, '') = '' then
      raise exception 'The handover needs work completed, findings, recommendations, limitations and both signatures.'; end if;
  end if;
  if new.closed_at is not null then
    if new.rep_at is null or new.conf_at is null or new.arr_at is null or new.finish_at is null then raise exception 'The job cannot be closed yet: finish every earlier step.'; end if;
    if new.leave_at is null or new.hqa_at is null then raise exception 'Close-out needs the leave-site and arrival-at-HQ times.'; end if;
    if new.hqa_at < new.leave_at then raise exception 'The arrival at HQ cannot be before leaving the site.'; end if;
    if exists (select 1 from jsonb_array_elements(new.items) i where coalesce((i->>'loaded_qty')::numeric, 0) > 0 and (i->>'returned_qty' is null or i->>'ret_condition' is null)) then
      raise exception 'Record the returned quantity and condition for every issued item.'; end if;
  end if;
  return new;
end $$;

-- Job status: Work Completed → Closed is now one close-out step (the old Leaving Site / Arrived at HQ values stay valid for earlier data).
create or replace function app.guard_job_status() returns trigger language plpgsql as $$
declare ok boolean;
begin
  if new.status = old.status then return new; end if;
  ok := (old.status, new.status) in (
    ('Pending','Confirmed'),('Confirmed','Pending'),
    ('Confirmed','Dispatch Checklist Pending'),('Dispatch Checklist Pending','Dispatched'),('Dispatched','On Site'),
    ('On Site','In Progress'),('In Progress','Work Completed'),('In Progress','Completed'),('Work Completed','Closed'),
    ('Work Completed','Leaving Site'),('Leaving Site','Arrived at HQ'),('Arrived at HQ','Closed'))
    or (new.status in ('Cancelled','Rescheduled') and old.status in ('Pending','Confirmed','Dispatch Checklist Pending'))
    or old.status = 'Rescheduled';
  if not ok then
    if app.change_reason() is not null and (app.has_perm('dispatch.approve') or auth.uid() is null) then return new; end if;
    raise exception 'Job status cannot change from "%" to "%" except by an Operations Manager / Admin override with a reason.', old.status, new.status;
  end if;
  if new.status = 'Closed' and not exists (select 1 from public.workflows w where w.job_id = new.id and w.closed_at is not null) then
    raise exception 'Close the job from the workflow close-out step.'; end if;
  return new;
end $$;

create or replace function app.guard_variation() returns trigger language plpgsql as $$
begin
  if old.status in ('Approved','Rejected') and (to_jsonb(new) - array['updated_at','updated_by','deleted_at','deleted_by']) <> (to_jsonb(old) - array['updated_at','updated_by','deleted_at','deleted_by'])
     and not (app.change_reason() is not null and (app.has_perm('incidents.manage') or auth.uid() is null)) then
    raise exception 'An approved or declined variation is locked. Create a new variation or correct it with a reason.'; end if;
  if new.status = 'Approved' and old.status <> 'Approved' then
    if coalesce(new.client_name, '') = '' or new.client_signature is null then raise exception 'Client approval needs the client name and a signature.'; end if;
    if coalesce(new.revision_open, false) then raise exception 'The client asked for a revision: present the updated additional work again first.'; end if;
    if new.source = 'final_review' then
      if not exists (select 1 from public.workflows w where w.job_id = new.job_id and w.arr_at is not null and w.conf_at is null) then raise exception 'The final quote can be approved on site, before the conforme is signed.'; end if;
    elsif not exists (select 1 from public.workflows w where w.job_id = new.job_id and w.start_at is not null) then raise exception 'Variations can be approved once work has started.'; end if;
    if exists (select 1 from public.workflows w where w.job_id = new.job_id and w.rep_at is not null) then raise exception 'The service report is signed; no more variations can be approved.'; end if;
    new.signed_at := coalesce(new.signed_at, now());
    update public.jobs set contract_amount = round(contract_amount + app.doc_net(new.items, new.discount, new.vat_mode, new.vat_rate), 2) where id = new.job_id;
  end if;
  return new;
end $$;
