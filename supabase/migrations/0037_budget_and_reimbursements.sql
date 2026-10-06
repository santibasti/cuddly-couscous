-- Budget vs actual on a job (expense budget for gas, toll, meals) and crew reimbursements (an employee paid out of pocket; Finance pays them back).
alter table public.jobs add column if not exists expense_budget numeric(14,2) check (expense_budget is null or expense_budget >= 0);
alter table public.expenses
  add column if not exists paid_by_employee text, add column if not exists reimbursed_at timestamptz, add column if not exists reimbursed_by text, add column if not exists reimbursed_via text;

create or replace function app.guard_job_internal_close() returns trigger language plpgsql as $$
declare strip text[] := array['internal_closed_at','internal_closed_by','internal_no_expenses','internal_notes','internal_expense_total','expense_budget','updated_at','updated_by'];
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

create or replace function app.guard_expense_job_closed() returns trigger language plpgsql as $$
begin
  if auth.uid() is null then return new; end if;
  -- paying the crew back is allowed even after the job is closed internally
  if tg_op = 'UPDATE' and (to_jsonb(new) - array['reimbursed_at','reimbursed_by','reimbursed_via','updated_at','updated_by']) = (to_jsonb(old) - array['reimbursed_at','reimbursed_by','reimbursed_via','updated_at','updated_by']) then return new; end if;
  if new.job_id is not null and exists (select 1 from public.jobs j where j.id = new.job_id and j.internal_closed_at is not null) then
    raise exception 'This job is closed internally. The Owner must reopen it before expenses change.';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_expense_job_closed on public.expenses;
create trigger trg_guard_expense_job_closed before insert or update on public.expenses for each row execute function app.guard_expense_job_closed();
