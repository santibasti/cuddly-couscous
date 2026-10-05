-- Back Job / Callback management.
--   A finished job is never reopened or overwritten. A linked follow-up job is created (own job number, schedule, attendance, equipment
--   checklist, service report and closure through the normal workflow) and a back_jobs record tracks the case:
--   Reported → Under Review → Approved → Scheduled → In Progress → Resolved → Closed   (or Rejected).
--   No Charge: no bill; the follow-up job's cost is attributed to the original job as Back Job Cost.
--   Chargeable Additional Work: a new quotation the client must approve before work starts; the new invoice and payments link to the follow-up job.

create table public.back_jobs (
  like app.base_columns including all,
  number text not null unique,
  origin_job_id text not null references public.jobs (id), job_id text not null references public.jobs (id),
  client_id text not null references public.clients (id), site_id text not null references public.sites (id),
  origin_workflow_id text references public.workflows (id), origin_quotation_id text, origin_invoice_id text,
  origin_leader_id text, origin_crew_ids jsonb not null default '[]',
  reason text not null check (reason in ('Missed Area','Quality Issue','Client Complaint','Damage','Warranty/Touch-Up','Other')),
  description text not null check (length(trim(description)) > 0),
  reported_on date not null, reported_by text not null check (length(trim(reported_by)) > 0), responsible text not null check (length(trim(responsible)) > 0),
  charge_type text not null check (charge_type in ('No Charge','Chargeable Additional Work')),
  status text not null default 'Reported' check (status in ('Reported','Under Review','Approved','Scheduled','In Progress','Resolved','Closed','Rejected')),
  reviewed_by text, reviewed_at timestamptz, approved_by text, approved_at timestamptz, approval_note text,
  quotation_id text references public.quotations (id), resolved_at timestamptz, closed_at timestamptz
);
create index on public.back_jobs (origin_job_id);
create index on public.back_jobs (job_id);
create index on public.back_jobs (status) where deleted_at is null;

alter table public.jobs add column back_job_id text, add column origin_job_id text references public.jobs (id);
alter table public.jobs add constraint jobs_back_job_fk foreign key (back_job_id) references public.back_jobs (id) deferrable initially deferred;
create index on public.jobs (origin_job_id) where origin_job_id is not null;

create trigger trg_touch before update on public.back_jobs for each row execute function app.touch();
create trigger trg_no_delete before delete on public.back_jobs for each row execute function app.no_hard_delete();
create trigger trg_audit after insert or update on public.back_jobs for each row execute function app.audit();

/* ---------------- rules ---------------- */
create function app.guard_back_job() returns trigger language plpgsql as $$
declare o public.jobs; sync boolean := coalesce(current_setting('app.bj_sync', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    select * into o from public.jobs where id = new.origin_job_id;
    if o.status not in ('Work Completed','Closed','Completed') then raise exception 'A Back Job / Callback can only be created for a completed or closed job.'; end if;
    if new.status <> 'Reported' then raise exception 'A new back job starts as Reported.'; end if;
    if not (app.has_perm('backjobs.create') or auth.uid() is null) then raise exception 'Only Admin / Operations can create a back job.'; end if;
    return new;
  end if;
  if (new.origin_job_id, new.job_id, new.client_id, new.site_id, new.reason, new.description, new.reported_on, new.reported_by, new.charge_type)
     is distinct from (old.origin_job_id, old.job_id, old.client_id, old.site_id, old.reason, old.description, old.reported_on, old.reported_by, old.charge_type) then
    raise exception 'A reported back job cannot be edited.'; end if;
  if new.status is distinct from old.status then
    if old.status in ('Rejected','Closed') then raise exception 'This back job is finished.'; end if;
    if new.status in ('Under Review','Approved','Rejected') then
      if not (app.has_perm('backjobs.approve') or auth.uid() is null) then raise exception 'Only the Admin or an Operations Manager can review, approve or reject a back job.'; end if;
      if new.status <> 'Under Review' and coalesce(trim(new.approval_note), '') = '' then raise exception 'An approval / rejection note is required.'; end if;
      if new.status = 'Approved' and new.charge_type = 'Chargeable Additional Work' and new.quotation_id is null then raise exception 'A chargeable back job needs its new quotation.'; end if;
      if new.status = 'Approved' then new.approved_at := coalesce(new.approved_at, now()); end if;
    elsif not sync and auth.uid() is not null then
      raise exception 'Scheduled, In Progress, Resolved and Closed follow the linked job automatically.';
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_back_job before insert or update on public.back_jobs for each row execute function app.guard_back_job();

-- The follow-up job's progress moves the back job along; a chargeable back job's quotation is approved when the client signs.
create function app.sync_back_job() returns trigger language plpgsql security definer set search_path = public as $$
declare b public.back_jobs; st text;
begin
  select * into b from public.back_jobs where id = new.back_job_id;
  if not found or b.status in ('Reported','Under Review','Rejected','Closed') then return new; end if;
  st := case new.status when 'Closed' then 'Closed' when 'Work Completed' then 'Resolved' when 'Completed' then 'Resolved' when 'Leaving Site' then 'Resolved' when 'Arrived at HQ' then 'Resolved'
        when 'Dispatched' then 'In Progress' when 'On Site' then 'In Progress' when 'In Progress' then 'In Progress'
        when 'Confirmed' then 'Scheduled' when 'Dispatch Checklist Pending' then 'Scheduled' when 'Rescheduled' then 'Scheduled'
        when 'Cancelled' then 'Rejected' else 'Approved' end;
  if st <> b.status then
    perform set_config('app.bj_sync', 'on', true);
    update public.back_jobs set status = st, resolved_at = case when st in ('Resolved','Closed') then coalesce(resolved_at, now()) else resolved_at end, closed_at = case when st = 'Closed' then now() else closed_at end where id = b.id;
    perform set_config('app.bj_sync', 'off', true);
  end if;
  return new;
end $$;
create trigger trg_sync_back_job after update of status on public.jobs for each row when (new.back_job_id is not null) execute function app.sync_back_job();

-- A back-job follow-up cannot be scheduled (Confirmed) until it is approved.
create function app.guard_back_job_schedule() returns trigger language plpgsql as $$
declare b public.back_jobs;
begin
  if new.back_job_id is not null and new.status = 'Confirmed' and old.status is distinct from 'Confirmed' then
    select * into b from public.back_jobs where id = new.back_job_id;
    if b.status in ('Reported','Under Review','Rejected') then raise exception 'Back job % must be approved by Admin / Operations before it can be scheduled.', b.number; end if;
  end if;
  return new;
end $$;
create trigger trg_guard_back_job_schedule before update on public.jobs for each row execute function app.guard_back_job_schedule();

-- No-charge back jobs are never billed.
create function app.guard_no_invoice_no_charge() returns trigger language plpgsql as $$
begin
  if new.job_id is not null and exists (select 1 from public.back_jobs b where b.job_id = new.job_id and b.charge_type = 'No Charge' and b.deleted_at is null) then
    raise exception 'This is a no-charge back job: there is nothing to bill. Its cost is tracked against the original job.'; end if;
  return new;
end $$;
create trigger trg_no_invoice_no_charge before insert on public.invoices for each row execute function app.guard_no_invoice_no_charge();

/* ---------------- access ---------------- */
alter table public.back_jobs enable row level security;
create policy bj_select on public.back_jobs for select using (
  app.has_perm('backjobs.create') or app.has_perm('backjobs.approve') or app.has_perm('reports.ops')
  or (app.has_perm('dispatch.view') and exists (select 1 from public.jobs j where j.id in (back_jobs.job_id, back_jobs.origin_job_id) and (j.leader_id = app.my_employee() or j.crew_ids ? app.my_employee()))));
create policy bj_insert on public.back_jobs for insert with check (app.has_perm('backjobs.create'));
create policy bj_update on public.back_jobs for update using (app.has_perm('backjobs.approve') or app.has_perm('backjobs.create'));
insert into public.role_permissions (role, permission) values
('owner', 'backjobs.create'), ('owner', 'backjobs.approve'), ('ops', 'backjobs.create'), ('ops', 'backjobs.approve')
on conflict do nothing;
