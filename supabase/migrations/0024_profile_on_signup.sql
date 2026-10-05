-- A login created in Supabase (Authentication → Users → Add user) now gets its app profile automatically, switched off ("waiting for the Admin")
-- with the lowest role. The Owner / Admin then opens Admin → Users in the app, sets the role, links the employee and switches it on.
-- Nobody can use the system just by having a login, even if public sign-ups are enabled.
create or replace function app.on_auth_user_created() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, role, active)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)), lower(new.email), 'viewer', false)
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created after insert on auth.users for each row execute function app.on_auth_user_created();

-- logins that already exist without a profile (created before this migration)
insert into public.profiles (id, name, email, role, active)
select u.id, coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), split_part(u.email, '@', 1)), lower(u.email), 'viewer', false
from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id) and u.email is not null
on conflict do nothing;
