-- SMS reminders to the client: the evening before the service and 7:00 AM on the day. Sent by the send-client-reminders Edge Function (called every 10 minutes by pg_cron).
create table public.client_sms_log (
  id bigint generated always as identity primary key,
  job_id text not null, kind text not null check (kind in ('day_before', 'morning')), service_date date not null,
  to_number text, message text, sent_at timestamptz, error text, attempts int not null default 0,
  created_at timestamptz not null default now(),
  unique (job_id, kind, service_date)
);
alter table public.client_sms_log enable row level security;
create policy client_sms_log_select on public.client_sms_log for select using (app.has_perm('admin.settings') or app.has_perm('jobs.all'));

-- every 10 minutes; needs the pg_cron and pg_net extensions (included with Supabase). If they are unavailable, call the function from any scheduler instead.
do $$ begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron;
  perform cron.unschedule('client-sms-reminders') where exists (select 1 from cron.job where jobname = 'client-sms-reminders');
  perform cron.schedule('client-sms-reminders', '*/10 * * * *', $c$ select net.http_post(url := 'https://ghbumxivporzsalivgyg.supabase.co/functions/v1/send-client-reminders', headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb) $c$);
exception when others then
  raise notice 'Could not schedule the client SMS reminders automatically: %', sqlerrm;
end $$;
