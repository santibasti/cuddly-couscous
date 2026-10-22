-- Stop a write storm: the app re-saved every employee's rating / badge data over and over because jsonb returns object keys in its own order,
-- so the app thought nothing had been stored. Each save also wrote an activity-log row and woke every open screen.
-- The app is fixed too, but devices still on the old version keep doing it until they update; this makes the database ignore an update that changes nothing.
create or replace function app.skip_noop_update() returns trigger language plpgsql as $$
begin
  if (to_jsonb(new) - array['updated_at','updated_by']) = (to_jsonb(old) - array['updated_at','updated_by']) then
    return null;   -- nothing changed (jsonb compares objects regardless of key order): no write, no audit row, no new updated_at
  end if;
  return new;
end $$;

drop trigger if exists a_skip_noop_update on public.employees;
create trigger a_skip_noop_update before update on public.employees for each row execute function app.skip_noop_update();   -- "a_" runs before the other triggers
