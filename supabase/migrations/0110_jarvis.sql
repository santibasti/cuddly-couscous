-- Jarvis: the owner's voice assistant (Edge Function `jarvis`, delivered on Telegram).
-- • a morning brief every day at 7:00 Manila time (23:00 UTC the evening before)
-- • instant voice alerts for discount requests and accepted quotations (the alert rows that already exist for SMS), and for every new inquiry
-- The function refuses to run without the WEBHOOK_SECRET header, which the database sends from the Vault secret `webhook_secret` (see migration 0088 and supabase/README.md).

-- idempotency (a call can be repeated by Telegram, cron or the database) and a 30-minute memory so follow-up questions make sense; used only by the function (service role)
create table if not exists public.jarvis_log (key text primary key, at timestamptz not null default now());
create table if not exists public.jarvis_memory (chat_id bigint primary key, turns jsonb not null default '[]', updated_at timestamptz not null default now());
alter table public.jarvis_log enable row level security;
alter table public.jarvis_memory enable row level security;

create or replace function app.push_jarvis_alert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform net.http_post(url := 'https://ghbumxivporzsalivgyg.supabase.co/functions/v1/jarvis', headers := app.webhook_headers(), body := jsonb_build_object('action', 'alert', 'id', new.id));
  exception when others then null;   -- never block the event that raised the alert
  end;
  return new;
end $$;
drop trigger if exists push_jarvis_alert on public.alert_outbox;
create trigger push_jarvis_alert after insert on public.alert_outbox for each row when (new.kind in ('discount', 'quotation')) execute function app.push_jarvis_alert();

create or replace function app.push_jarvis_inquiry() returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform net.http_post(url := 'https://ghbumxivporzsalivgyg.supabase.co/functions/v1/jarvis', headers := app.webhook_headers(), body := jsonb_build_object('action', 'inquiry', 'id', new.id));
  exception when others then null;
  end;
  return new;
end $$;
drop trigger if exists push_jarvis_inquiry on public.inquiries;
create trigger push_jarvis_inquiry after insert on public.inquiries for each row execute function app.push_jarvis_inquiry();

do $$ begin
  perform cron.unschedule('jarvis-morning-brief') where exists (select 1 from cron.job where jobname = 'jarvis-morning-brief');
  perform cron.schedule('jarvis-morning-brief', '0 23 * * *', $c$ select net.http_post(url := 'https://ghbumxivporzsalivgyg.supabase.co/functions/v1/jarvis', headers := app.webhook_headers(), body := '{"action":"brief"}'::jsonb) $c$);
exception when others then
  raise notice 'Could not schedule the Jarvis morning brief: %', sqlerrm;
end $$;
