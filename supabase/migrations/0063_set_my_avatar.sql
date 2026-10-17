-- Every employee can set (or remove) their own photo. A crew login can read only its own employee row and cannot update it,
-- so the change goes through this function, which touches the avatar of the caller's own employee record and nothing else.
create or replace function public.set_my_avatar(p_avatar text)
returns void language plpgsql security definer set search_path = public as $$
declare me text := app.my_employee();
begin
  if auth.uid() is null or me is null then raise exception 'Your login is not linked to an employee record.' using errcode = 'P0001'; end if;
  if p_avatar is not null and (p_avatar not like 'data:image/%' or length(p_avatar) > 150000) then raise exception 'That photo is too large or not a picture. Try a smaller one.' using errcode = 'P0001'; end if;
  update public.employees set avatar = p_avatar where id = me;
end $$;
revoke all on function public.set_my_avatar(text) from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'authenticated') then grant execute on function public.set_my_avatar(text) to authenticated; end if; end $$;
