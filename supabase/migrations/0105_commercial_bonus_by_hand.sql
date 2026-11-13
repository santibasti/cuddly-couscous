-- Commercial projects get no automatic crew bonus: the Owner types the bonus for each crew member on the job (₱), and it is added to payroll as the Commercial bonus.
alter table public.jobs add column if not exists pay_commercial_amount numeric(12,2) check (pay_commercial_amount is null or pay_commercial_amount >= 0);

-- only the Owner (the people who approve payroll) may set or change the job pay options (0101) — now including the typed commercial amount
create or replace function app.guard_job_pay() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if (coalesce(new.pay_outside_mm, false) or coalesce(new.pay_commercial, false) or new.pay_commercial_amount is not null) and auth.uid() is not null and not app.has_perm('payroll.approve') then
      raise exception 'Only the Owner can add the Outside Metro Manila or Commercial Project bonus to a job.'; end if;
  elsif (new.pay_outside_mm is distinct from old.pay_outside_mm or new.pay_commercial is distinct from old.pay_commercial or new.pay_commercial_amount is distinct from old.pay_commercial_amount)
        and auth.uid() is not null and not app.has_perm('payroll.approve') then
    raise exception 'Only the Owner can change the Outside Metro Manila or Commercial Project bonus of a job.';
  end if;
  return new;
end $$;
