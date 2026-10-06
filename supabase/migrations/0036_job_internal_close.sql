-- Stage 8 — after the service, Admin / Finance enters every job expense (gas, toll, parking, meals, purchases) and closes the job internally.
alter table public.jobs
  add column if not exists internal_closed_at timestamptz, add column if not exists internal_closed_by text, add column if not exists internal_no_expenses boolean,
  add column if not exists internal_notes text, add column if not exists internal_expense_total numeric(14,2);

alter table public.expenses drop constraint if exists expenses_category_check;
alter table public.expenses add constraint expenses_category_check
  check (category in ('Payroll','Fuel','Materials','Equipment Repair','Transportation','Marketing','Rent','Utilities','Government Fees','Subcontractor','Toll & Parking','Meals & Snacks','Other'));

insert into public.role_permissions (role, permission) values ('owner', 'jobs.close_internal'), ('finance', 'jobs.close_internal') on conflict do nothing;

-- people who may close a job internally but cannot edit jobs can update only the internal_* columns of a finished (Closed) job
drop policy if exists jobs_update_internal on public.jobs;
create policy jobs_update_internal on public.jobs for update using (app.has_perm('jobs.close_internal'));

create or replace function app.guard_job_internal_close() returns trigger language plpgsql as $$
declare strip text[] := array['internal_closed_at','internal_closed_by','internal_no_expenses','internal_notes','internal_expense_total','updated_at','updated_by'];
begin
  if auth.uid() is null then return new; end if;
  -- only people closing without edit rights are restricted here (jobs.edit / crew keep their own rules)
  if app.has_perm('jobs.close_internal') and not app.has_perm('jobs.edit') and not app.has_perm('jobs.complete') then
    if (to_jsonb(new) - strip) is distinct from (to_jsonb(old) - strip) then raise exception 'You can only change the expense / internal-close fields of a job.'; end if;
  end if;
  if new.internal_closed_at is not null and old.internal_closed_at is null then
    if new.status <> 'Closed' then raise exception 'The operational close-out must be finished before the job can be closed internally.'; end if;
    if not app.has_perm('jobs.close_internal') then raise exception 'Not permitted to close a job internally.'; end if;
    if coalesce(new.internal_no_expenses, false) is not true
       and not exists (select 1 from public.expenses e where e.job_id = new.id and e.deleted_at is null and not coalesce(e.reversed, false) and e.approval <> 'Rejected') then
      raise exception 'Enter the job expenses, or tick "No expenses for this job", before closing.';
    end if;
    if exists (select 1 from public.expenses e where e.job_id = new.id and e.deleted_at is null and not coalesce(e.reversed, false) and e.approval = 'Pending') then
      raise exception 'Approve or reject the pending expenses of this job first.';
    end if;
  end if;
  if new.internal_closed_at is null and old.internal_closed_at is not null and app.user_role() <> 'owner' then
    raise exception 'Only the Owner can reopen an internally closed job.';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_job_internal_close on public.jobs;
create trigger trg_guard_job_internal_close before update on public.jobs for each row execute function app.guard_job_internal_close();

-- once closed internally, no expense can be added to / changed on that job (the Owner reopens it first)
create or replace function app.guard_expense_job_closed() returns trigger language plpgsql as $$
begin
  if auth.uid() is null then return new; end if;
  if new.job_id is not null and exists (select 1 from public.jobs j where j.id = new.job_id and j.internal_closed_at is not null) then
    raise exception 'This job is closed internally. The Owner must reopen it before expenses change.';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_expense_job_closed on public.expenses;
create trigger trg_guard_expense_job_closed before insert or update on public.expenses for each row execute function app.guard_expense_job_closed();
