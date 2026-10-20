-- Used by the admin-set-password function to check that the caller may manage logins (the Owner, or anyone given "Manage users & permissions").
create or replace function public.can_manage_users() returns boolean language sql stable security definer set search_path = public as $$ select app.has_perm('admin.users') $$;
revoke all on function public.can_manage_users() from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'authenticated') then grant execute on function public.can_manage_users() to authenticated; end if; end $$;
