-- One quick question instead of 45: "when was each table last changed?" The app asks this on every background check and then fetches only the
-- tables that moved. It runs as the signed-in person (security invoker), so row-level security applies exactly as it does to the real reads.
create or replace function public.sync_marks(p_tables text[]) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare t text; m timestamptz; out jsonb := '{}'::jsonb;
begin
  foreach t in array p_tables loop
    -- only real tables of ours that have an updated_at column (never an arbitrary name)
    if to_regclass('public.' || quote_ident(t)) is not null
       and exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = t and c.column_name = 'updated_at') then
      execute format('select max(updated_at) from public.%I', t) into m;
      out := out || jsonb_build_object(t, m);
    end if;
  end loop;
  return out;
end $$;
revoke all on function public.sync_marks(text[]) from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'authenticated') then grant execute on function public.sync_marks(text[]) to authenticated; end if; end $$;
