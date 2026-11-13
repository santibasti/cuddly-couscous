-- The inspector confirms on the day that they have arrived at the site before an ocular visit can be started / completed.
alter table public.ocular_visits add column if not exists arrived_at timestamp, add column if not exists arrived_by text, add column if not exists arr_lat double precision, add column if not exists arr_lng double precision;

create or replace function app.guard_ocular_arrival() returns trigger language plpgsql as $$
begin
  if new.status = 'Completed' and old.status in ('Scheduled', 'Confirmed') and new.arrived_at is null then
    raise exception 'Confirm that the inspector has arrived at the site before starting the visit.';
  end if;
  return new;
end $$;
drop trigger if exists ocular_arrival_guard on public.ocular_visits;
create trigger ocular_arrival_guard before update on public.ocular_visits for each row execute function app.guard_ocular_arrival();
