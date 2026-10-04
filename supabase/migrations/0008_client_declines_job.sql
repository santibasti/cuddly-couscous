-- Client Final Quote Review: the client may decline the job on site (e.g. after the Admin rejected a discount).
-- conf_mode = 'declined' skips work + handover, nothing is billed, and the crew goes straight to close-out to return the equipment.
alter table public.workflows drop constraint if exists workflows_conf_mode_check;
alter table public.workflows add constraint workflows_conf_mode_check check (conf_mode in ('approval','confirmed','declined'));

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
    if new.conf_mode = 'declined' and coalesce(new.conf_name, '') = '' then raise exception 'Record the name of the client who declined the job.'; end if;
    if new.conf_mode is null then raise exception 'Choose how the scope was approved (client signature or confirmed – no changes).'; end if;
  end if;
  if new.start_at is not null and old.start_at is null and (new.conf_at is null or new.conf_mode = 'declined') then raise exception 'Work cannot start until the client has signed the quotation.'; end if;
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
    if new.conf_at is null or new.arr_at is null or (new.conf_mode is distinct from 'declined' and (new.rep_at is null or new.finish_at is null)) then raise exception 'The job cannot be closed yet: finish every earlier step.'; end if;
    if new.leave_at is null or new.hqa_at is null then raise exception 'Close-out needs the leave-site and arrival-at-HQ times.'; end if;
    if new.hqa_at < new.leave_at then raise exception 'The arrival at HQ cannot be before leaving the site.'; end if;
    if exists (select 1 from jsonb_array_elements(new.items) i where coalesce((i->>'loaded_qty')::numeric, 0) > 0 and (i->>'returned_qty' is null or i->>'ret_condition' is null)) then
      raise exception 'Record the returned quantity and condition for every issued item.'; end if;
  end if;
  return new;
end $$;

-- A declined job moves On Site → Work Completed so that close-out can run.
create or replace function app.guard_job_status() returns trigger language plpgsql as $$
declare ok boolean;
begin
  if new.status = old.status then return new; end if;
  ok := (old.status, new.status) in (
    ('Pending','Confirmed'),('Confirmed','Pending'),
    ('Confirmed','Dispatch Checklist Pending'),('Dispatch Checklist Pending','Dispatched'),('Dispatched','On Site'),
    ('On Site','In Progress'),('In Progress','Work Completed'),('In Progress','Completed'),('Work Completed','Closed'),
    ('Work Completed','Leaving Site'),('Leaving Site','Arrived at HQ'),('Arrived at HQ','Closed'))
    or (old.status = 'On Site' and new.status = 'Work Completed' and exists (select 1 from public.workflows w where w.job_id = new.id and w.conf_mode = 'declined'))
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

-- Starting work, a client signature or an invoice is refused while a discount request is open (see 0007); a declined job is never invoiced.
create or replace function app.guard_no_invoice_declined() returns trigger language plpgsql as $$
begin
  if new.job_id is not null and exists (select 1 from public.workflows w where w.job_id = new.job_id and w.conf_mode = 'declined' and w.deleted_at is null) then
    raise exception 'The client declined this job: there is nothing to invoice.'; end if;
  return new;
end $$;
create trigger trg_no_invoice_declined before insert on public.invoices for each row execute function app.guard_no_invoice_declined();

-- A Team Leader cannot override a rejected discount by asking again; only the Owner / Admin can open a new request.
create or replace function app.guard_discount_request() returns trigger language plpgsql as $$
declare locked boolean;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'Pending Admin Approval' then raise exception 'A new Discount Request always starts as Pending Admin Approval.'; end if;
    if new.base_total - new.requested_amount <= 0 then raise exception 'The discount cannot be equal to or more than the bill total.'; end if;
    if auth.uid() is not null and not app.has_perm('discount.approve') and exists (select 1 from public.discount_requests r where r.job_id = new.job_id and r.status = 'Rejected' and r.deleted_at is null) then
      raise exception 'The Admin already rejected a discount for this job. The decision stands.'; end if;
    if exists (select 1 from public.invoices i where i.job_id = new.job_id and i.status <> 'Reversed' and i.deleted_at is null) then raise exception 'This job is already invoiced.'; end if;
    return new;
  end if;
  -- the request itself is immutable; only the decision / application columns change
  if (new.job_id, new.client_id, new.base_total, new.kind, new.value, new.requested_amount, new.reason, new.submitted_by, new.submitted_at)
     is distinct from (old.job_id, old.client_id, old.base_total, old.kind, old.value, old.requested_amount, old.reason, old.submitted_by, old.submitted_at)
     and not (new.status = 'Approved' and app.has_perm('discount.approve')) then
    raise exception 'A submitted Discount Request cannot be edited. Only the Owner / Admin can approve it at a modified amount.'; end if;
  if old.status = 'Rejected' and new.status <> 'Rejected' then raise exception 'A rejected request stays rejected: submit a new one.'; end if;
  select exists (select 1 from public.workflows w where w.job_id = new.job_id and w.deleted_at is null
                 and ((w.conf_mode = 'approval' and w.conf_at is not null) or w.rep_client_at is not null)) into locked;
  if old.status = 'Applied' and locked and new.status <> old.status then
    raise exception 'The client has already signed the discounted bill — the discount is final.'; end if;
  if new.status <> old.status or new.approved_amount is distinct from old.approved_amount then
    if new.status in ('Approved','Rejected') then
      if not (app.has_perm('discount.approve') or auth.uid() is null) then raise exception 'Only the Owner / Admin can approve, reject or modify a discount.'; end if;
      if coalesce(trim(new.decision_note), '') = '' then raise exception 'An approval / rejection note is required.'; end if;
      if new.status = 'Approved' and (new.approved_amount is null or new.approved_amount >= new.approved_base or new.approved_base is null) then
        raise exception 'Approve with the discount amount and the bill total it was approved against.'; end if;
    elsif new.status = 'Applied' then
      if old.status <> 'Approved' then raise exception 'Only an approved discount can be applied to the final bill.'; end if;
      if not (app.has_perm('discount.request') or app.has_perm('discount.approve') or auth.uid() is null) then raise exception 'Not permitted to apply this discount.'; end if;
    end if;
  end if;
  return new;
end $$;
