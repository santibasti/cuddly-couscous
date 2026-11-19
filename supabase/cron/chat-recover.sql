-- Run this ONCE PER ENVIRONMENT (staging first), in that project's SQL editor, after migration 0133 and after deploying the chat-recover function.
-- Replace <PROJECT_URL> with that project's own address, e.g. https://abcdefgh.supabase.co  (never copy another project's address: a staging database must not call production).
-- It needs the project's vault secret `webhook_secret` (same one the other scheduled functions use) when WEBHOOK_SECRET is set on the function.
do $$ begin
  perform cron.unschedule('chat-recover') where exists (select 1 from cron.job where jobname = 'chat-recover');
  perform cron.schedule('chat-recover', '* * * * *', $c$ select net.http_post(url := '<PROJECT_URL>/functions/v1/chat-recover', headers := app.webhook_headers(), body := '{}'::jsonb) where exists (select 1 from public.chat_messages where direction = 'in' and handled_at is null and created_at < now() - interval '45 seconds') $c$);
exception when others then
  raise notice 'Could not schedule chat-recover: %', sqlerrm;
end $$;
-- To stop it:  select cron.unschedule('chat-recover');
