-- Crew availability: from 7:00 PM the evening before a service, each assigned team leader / crew member confirms (or declines) in their own account.
-- The answers live on the job as {employee_id: {status, at, note, for_start}}.
alter table public.jobs add column if not exists crew_confirmations jsonb not null default '{}'::jsonb;

-- a crew member may change only their OWN answer; managers (jobs.edit) may change anything
create or replace function app.guard_crew_confirmations() returns trigger language plpgsql as $$
declare me text := app.my_employee(); k text;
begin
  if auth.uid() is null or app.has_perm('jobs.edit') then return new; end if;
  if new.crew_confirmations is not distinct from old.crew_confirmations then return new; end if;
  for k in select key from (select jsonb_object_keys(coalesce(new.crew_confirmations, '{}'::jsonb)) key union select jsonb_object_keys(coalesce(old.crew_confirmations, '{}'::jsonb))) x loop
    if (new.crew_confirmations -> k) is distinct from (old.crew_confirmations -> k) and k is distinct from me then
      raise exception 'You can only confirm your own availability.';
    end if;
  end loop;
  if me is null or not (me = old.leader_id or old.crew_ids ? me) then raise exception 'You are not on this job.'; end if;
  return new;
end $$;
drop trigger if exists trg_guard_crew_confirmations on public.jobs;
create trigger trg_guard_crew_confirmations before update of crew_confirmations on public.jobs for each row execute function app.guard_crew_confirmations();
