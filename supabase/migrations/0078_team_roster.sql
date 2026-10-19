-- A crew or Team Leader login can read only its own employee row, so a job card showed just their own name instead of the whole team.
-- This returns only the public basics (name, position, role tier, photo, rating) of active employees to any signed-in account;
-- pay, bank, ID and contact details stay hidden.
create or replace function public.team_roster()
returns table (id text, full_name text, "position" text, tier text, department text, branch_id text, status text, avatar text, rating numeric)
language sql stable security definer set search_path = public as $$
  select e.id, e.full_name, e."position", e.tier, e.department, e.branch_id, e.status, e.avatar, e.rating
    from public.employees e
   where e.deleted_at is null and e.status <> 'inactive' and auth.uid() is not null
   order by e.full_name
$$;
revoke all on function public.team_roster() from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'authenticated') then grant execute on function public.team_roster() to authenticated; end if; end $$;
