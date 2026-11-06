-- Security hardening.
-- 1. The SMS functions (send-alerts, send-client-reminders) are called by the database itself. Until now they received no secret, so anyone who knew the address could call them.
--    The database now sends the header  x-webhook-secret  taken from Supabase Vault (a secret named webhook_secret). It sends none until that secret exists, so nothing changes by itself:
--    create the Vault secret, then set the same value as the WEBHOOK_SECRET function secret (steps in supabase/README.md).
-- 2. A per-person limit on the AI helper functions (ai_calls + ai_allow), so one login cannot run up the AI bill.

create or replace function app.webhook_headers() returns jsonb language plpgsql security definer set search_path = public as $$
declare s text; h jsonb := '{"Content-Type": "application/json"}'::jsonb;
begin
  if to_regclass('vault.decrypted_secrets') is not null then
    begin
      execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1' into s using 'webhook_secret';
    exception when others then s := null;
    end;
  end if;
  if coalesce(s, '') <> '' then h := h || jsonb_build_object('x-webhook-secret', s); end if;
  return h;
end $$;
revoke all on function app.webhook_headers() from public;

create or replace function app.push_alert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform net.http_post(url := 'https://ghbumxivporzsalivgyg.supabase.co/functions/v1/send-alerts', headers := app.webhook_headers(), body := jsonb_build_object('id', new.id));
  exception when others then null; -- never block the event that raised the alert
  end;
  return new;
end $$;

do $$ begin
  perform cron.unschedule('client-sms-reminders') where exists (select 1 from cron.job where jobname = 'client-sms-reminders');
  perform cron.schedule('client-sms-reminders', '*/10 * * * *', $c$ select net.http_post(url := 'https://ghbumxivporzsalivgyg.supabase.co/functions/v1/send-client-reminders', headers := app.webhook_headers(), body := '{}'::jsonb) $c$);
exception when others then
  raise notice 'Could not reschedule the client SMS reminders: %', sqlerrm;
end $$;

-- AI usage limit: counts recent calls per person and function.
create table if not exists public.ai_calls (
  id bigint generated always as identity primary key,
  user_id text not null, fn text not null, at timestamptz not null default now()
);
create index if not exists ai_calls_lookup on public.ai_calls (user_id, fn, at desc);
alter table public.ai_calls enable row level security;   -- no policies: only ai_allow() below reads or writes it

create or replace function public.ai_allow(p_fn text, p_max int, p_window_minutes int default 60) returns boolean
language plpgsql security definer set search_path = public as $$
declare uid text := auth.uid()::text; n int;
begin
  if uid is null then return false; end if;
  if random() < 0.02 then delete from public.ai_calls where at < now() - interval '2 days'; end if;
  select count(*) into n from public.ai_calls where user_id = uid and fn = p_fn and at > now() - make_interval(mins => p_window_minutes);
  if n >= p_max then return false; end if;
  insert into public.ai_calls (user_id, fn) values (uid, p_fn);
  return true;
end $$;
revoke all on function public.ai_allow(text, int, int) from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'authenticated') then grant execute on function public.ai_allow(text, int, int) to authenticated; end if; end $$;
