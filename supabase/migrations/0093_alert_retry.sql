-- Owner alerts were sent only at the moment they were recorded. If that one call failed (a busy moment, a wrong secret, the SMS service down),
-- the alert waited until some other alert arrived. This retries every 5 minutes: send-alerts sends anything still unsent (up to 5 tries each).
do $$ begin
  perform cron.unschedule('owner-alerts-retry') where exists (select 1 from cron.job where jobname = 'owner-alerts-retry');
  perform cron.schedule('owner-alerts-retry', '*/5 * * * *', $c$ select net.http_post(url := 'https://ghbumxivporzsalivgyg.supabase.co/functions/v1/send-alerts', headers := app.webhook_headers(), body := '{}'::jsonb) where exists (select 1 from public.alert_outbox where sent_at is null and attempts < 5) $c$);
exception when others then
  raise notice 'Could not schedule the alert retry: %', sqlerrm;
end $$;
