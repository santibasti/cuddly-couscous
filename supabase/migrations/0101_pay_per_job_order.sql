-- Pay per job order: an employee can be paid a set amount for every job order they attended (late or not) instead of per day / per month.
-- The Owner can switch on two extra bonuses for a job's crew: Outside Metro Manila and Commercial Project (amounts are set in the payroll settings).
alter table public.employees add column if not exists job_rate numeric(12,2) not null default 0 check (job_rate >= 0);
alter table public.employees drop constraint if exists employees_pay_basis_check;
alter table public.employees add constraint employees_pay_basis_check check (pay_basis in ('daily', 'monthly', 'per_job'));

alter table public.jobs add column if not exists pay_outside_mm boolean, add column if not exists pay_commercial boolean;

-- only the people who approve payroll (the Owner) may switch these bonuses on or off
create or replace function app.guard_job_pay() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if (coalesce(new.pay_outside_mm, false) or coalesce(new.pay_commercial, false)) and auth.uid() is not null and not app.has_perm('payroll.approve') then
      raise exception 'Only the Owner can add the Outside Metro Manila or Commercial Project bonus to a job.'; end if;
  elsif (new.pay_outside_mm is distinct from old.pay_outside_mm or new.pay_commercial is distinct from old.pay_commercial) and auth.uid() is not null and not app.has_perm('payroll.approve') then
    raise exception 'Only the Owner can change the Outside Metro Manila or Commercial Project bonus of a job.';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_job_pay on public.jobs;
create trigger trg_guard_job_pay before insert or update on public.jobs for each row execute function app.guard_job_pay();
