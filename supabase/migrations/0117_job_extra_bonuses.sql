-- More crew-pay options for a job, switched on by the Owner like the Outside Metro Manila bonus: 2nd site (₱300), Night shift (₱500) and Manlift (₱500, paid only to crew
-- who may use the manlift). The amounts are in the payroll settings. An employee can be marked as a manlift operator.
alter table public.jobs add column if not exists pay_second_site boolean, add column if not exists pay_night_shift boolean, add column if not exists pay_manlift boolean;
alter table public.employees add column if not exists manlift_ok boolean not null default false;

-- only the Owner (the people who approve payroll) may set or change any of the job pay options (0101, 0105), now including these three
create or replace function app.guard_job_pay() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if (coalesce(new.pay_outside_mm, false) or coalesce(new.pay_commercial, false) or new.pay_commercial_amount is not null
        or coalesce(new.pay_second_site, false) or coalesce(new.pay_night_shift, false) or coalesce(new.pay_manlift, false)) and auth.uid() is not null and not app.has_perm('payroll.approve') then
      raise exception 'Only the Owner can add crew bonuses to a job.'; end if;
  elsif (new.pay_outside_mm is distinct from old.pay_outside_mm or new.pay_commercial is distinct from old.pay_commercial or new.pay_commercial_amount is distinct from old.pay_commercial_amount
         or new.pay_second_site is distinct from old.pay_second_site or new.pay_night_shift is distinct from old.pay_night_shift or new.pay_manlift is distinct from old.pay_manlift)
        and auth.uid() is not null and not app.has_perm('payroll.approve') then
    raise exception 'Only the Owner can change the crew bonuses of a job.';
  end if;
  return new;
end $$;
