-- Calls the send-alerts Edge Function the moment an alert is recorded (instead of a dashboard Database Webhook).
-- Needs the pg_net extension (included with Supabase). If it is unavailable the alerts simply wait in the outbox until the function next runs.
do $$ begin
  create extension if not exists pg_net with schema extensions;
exception when others then null;
end $$;

create or replace function app.push_alert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    perform net.http_post(url := 'https://ghbumxivporzsalivgyg.supabase.co/functions/v1/send-alerts', headers := '{"Content-Type": "application/json"}'::jsonb, body := jsonb_build_object('id', new.id));
  exception when others then null; -- never block the event that raised the alert
  end;
  return new;
end $$;

drop trigger if exists push_alert on public.alert_outbox;
create trigger push_alert after insert on public.alert_outbox for each row execute function app.push_alert();
