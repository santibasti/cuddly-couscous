-- Signed-in users run the table triggers and row-level-security checks as themselves, and those call helper functions in the `app` schema
-- (app.has_perm, app.touch, the guard_* rules …). Without USAGE on that schema every save fails with "permission denied for schema app".
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant usage on schema app to authenticated;
    grant execute on all functions in schema app to authenticated;
    alter default privileges in schema app grant execute on functions to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    grant usage on schema app to anon;          -- policies are evaluated for the anon role too (it simply sees nothing)
  end if;
end $$;
