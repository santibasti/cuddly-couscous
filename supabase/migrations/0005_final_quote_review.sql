-- Client Final Quote Review (workflow step 4): additional work offered at the site before the conforme is signed.
-- Approved additions become a linked variation / change order; declined ones stay on record; the original quotation is never modified.
alter table public.variations
  add column source text check (source in ('final_review')),
  add column revision_open boolean not null default false, add column revision_note text, add column revision_at timestamptz,
  add column decided_at timestamptz,
  add column sign_lat double precision, add column sign_lng double precision, add column sign_gps_note text, add column sign_device text;

alter table public.workflows
  add column conf_variation_id text references public.variations (id), add column conf_final_total numeric(14,2),
  add column conf_deposit numeric(14,2) check (conf_deposit is null or conf_deposit >= 0), add column conf_deposit_note text,
  add column conf_lat double precision, add column conf_lng double precision, add column conf_gps_note text, add column conf_device text;

create or replace function app.guard_workflow() returns trigger language plpgsql as $$
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
    if exists (select 1 from public.variations v where v.job_id = new.job_id and v.source = 'final_review' and v.status = 'Draft' and jsonb_array_length(v.items) > 0 and v.deleted_at is null) then
      raise exception 'Additional work is waiting for the client: approve, decline or revise it in the Client Final Quote Review before the conforme is signed.'; end if;
    if coalesce(new.conf_name, '') = '' or (new.conf_signature is null and new.conf_file is null) then raise exception 'The conforme needs the client name and a signature or signed copy.'; end if;
  end if;
  if new.start_at is not null and old.start_at is null then
    if new.conf_at is null then raise exception 'Work cannot start until the client conforme is signed.'; end if;
    if not coalesce(new.start_safety, false) or not coalesce(new.start_ppe, false) or jsonb_array_length(new.start_photos) = 0 then
      raise exception 'Starting work needs the safety briefing, PPE confirmation and a work-start photo.'; end if;
  end if;
  if new.rep_at is not null and old.rep_at is null then
    if new.start_at is null then raise exception 'Start the work first.'; end if;
    select count(*) into pending_var from public.variations v where v.job_id = new.job_id and v.deleted_at is null and v.status in ('Draft','Pending Approval') and jsonb_array_length(v.items) > 0;
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

create or replace function app.guard_variation() returns trigger language plpgsql as $$
begin
  if old.status in ('Approved','Rejected') and (to_jsonb(new) - array['updated_at','updated_by','deleted_at','deleted_by']) <> (to_jsonb(old) - array['updated_at','updated_by','deleted_at','deleted_by'])
     and not (app.change_reason() is not null and (app.has_perm('incidents.manage') or auth.uid() is null)) then
    raise exception 'An approved or declined variation is locked. Create a new variation or correct it with a reason.'; end if;
  if new.status = 'Approved' and old.status <> 'Approved' then
    if coalesce(new.client_name, '') = '' or (new.client_signature is null and new.signed_file is null) then raise exception 'Client approval needs the client name and a signature.'; end if;
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
