-- RUN THIS ON THE STAGING PROJECT ONLY, right after `supabase db push`, BEFORE any test.
-- Why: nine migrations (0046, 0048, 0058, 0088, 0093, 0110, 0114, 0127 …) contain the PRODUCTION project's address inside database triggers and scheduled jobs
-- (alerts, Jarvis briefs, client SMS reminders, marketing posts, Job Order follow-ups). In a copy of the database those would call production's functions.
-- This script stops every scheduled job in this database, and reports anything that could still reach another project.

-- 1. stop all scheduled jobs of THIS (staging) database
do $$ declare j record; begin
  for j in select jobid, jobname from cron.job loop perform cron.unschedule(j.jobid); raise notice 'unscheduled %', j.jobname; end loop;
exception when others then raise notice 'cron is not available here: %', sqlerrm;
end $$;

-- 2. the webhook secret must NOT exist in the staging vault: without it the database sends no x-webhook-secret, so production's functions refuse any call that does leave staging
select case when to_regclass('vault.decrypted_secrets') is null then 'vault not installed: OK'
            when exists (select 1 from vault.decrypted_secrets where name = 'webhook_secret') then 'WARNING: delete the vault secret webhook_secret in this staging project'
            else 'OK: no webhook_secret in the staging vault' end as webhook_secret_check;

-- 3. what is still scheduled (must be empty) and which functions embed a production address (informational: they can only run when a trigger fires)
select jobname, schedule from cron.job;
select p.proname as function_with_production_address
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public', 'app') and pg_get_functiondef(p.oid) like '%ghbumxivporzsalivgyg%';
-- 4. Optional hard stop: also disable outgoing calls from this database  ->  drop extension if exists pg_net;
