-- The role matrix an Owner saves in Admin → Permissions (settings.data.access) now also drives the database's own checks
-- (public.role_permissions, used by every row-level-security policy). Before, only the screen followed the matrix, so a role that was
-- granted something there (e.g. sales.approve) saw the button but the database refused the save: "NOT SAVED — you do not have permission".
-- Permissions that appear under no role in the saved matrix (features added after it was saved) keep their built-in database defaults.
create or replace function app.sync_role_permissions() returns trigger language plpgsql security definer set search_path = public as $$
declare acc jsonb := new.data -> 'access'; r text; p text; known text[];
begin
  if new.id <> 'main' or acc is null or jsonb_typeof(acc) <> 'object' then return new; end if;
  select coalesce(array_agg(distinct v), '{}') into known from jsonb_each(acc) e, jsonb_array_elements_text(e.value) v;
  for r in select k from jsonb_object_keys(acc) k where k in (select unnest(enum_range(null::public.app_role))::text) and k <> 'owner' loop
    delete from public.role_permissions where role = r::public.app_role and permission = any(known);
    for p in select jsonb_array_elements_text(acc -> r) loop
      insert into public.role_permissions (role, permission) values (r::public.app_role, p) on conflict do nothing;
    end loop;
  end loop;
  return new;
end $$;

drop trigger if exists trg_sync_role_permissions on public.settings;
create trigger trg_sync_role_permissions after insert or update of data on public.settings for each row execute function app.sync_role_permissions();

-- apply the matrix that is saved right now
update public.settings set data = data where id = 'main';
