-- Lets an Edge Function ask "is the signed-in person an Owner / Admin who may change settings?" (used by the Admin "send me a sample reminder" button).
create or replace function public.can_admin_settings() returns boolean language sql stable security definer set search_path = public as $$ select app.has_perm('admin.settings') $$;
revoke all on function public.can_admin_settings() from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'authenticated') then grant execute on function public.can_admin_settings() to authenticated; end if; end $$;
