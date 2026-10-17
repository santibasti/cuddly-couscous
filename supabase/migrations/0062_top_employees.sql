-- The top-rated employees, readable by every signed-in account (a crew member's login can read only its own employee row,
-- so the "Top 3" board on the attendance screen goes through this function, which returns only name, position, rating and photo).
create or replace function public.top_employees(p_n integer default 3)
returns table (id text, full_name text, position text, rating numeric, avatar text)
language sql stable security definer set search_path = public as $$
  select e.id, e.full_name, e.position, e.rating, e.avatar
    from public.employees e
   where e.deleted_at is null and e.status <> 'inactive' and e.rating is not null and auth.uid() is not null
   order by e.rating desc, e.full_name
   limit greatest(1, least(coalesce(p_n, 3), 10))
$$;
revoke all on function public.top_employees(integer) from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'authenticated') then grant execute on function public.top_employees(integer) to authenticated; end if; end $$;
