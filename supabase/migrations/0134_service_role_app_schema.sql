-- The Edge Functions run as the database role `service_role`. Row guards such as app.guard_job_photo (and app.touch, app.has_perm) live in the schema `app`; running them needs USAGE on that schema,
-- otherwise every save from a function fails with "permission denied for schema app" (Telegram photos stopped saving on 15 Nov 2026).
-- Migration 0019 granted this to authenticated and anon only. Idempotent: safe to run again, and safe if it was already applied by hand.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant usage on schema app to service_role;
    grant execute on all functions in schema app to service_role;
    alter default privileges in schema app grant execute on functions to service_role;
  end if;
end $$;
