-- Admin → Settings → "Send a test text": queues one test alert so the real path (outbox → send-alerts → Semaphore → the alert number) can be checked from the app.
-- Two kinds: a plain one, and one that carries the app link (phone companies sometimes drop texts that contain a link).
create or replace function public.send_test_alert(p_with_link boolean default false) returns bigint
language plpgsql security definer set search_path = public as $$
declare i bigint;
begin
  if not app.has_perm('admin.settings') then raise exception 'Only the Owner / Admin can send a test text.'; end if;
  insert into public.alert_outbox (kind, title, body, link)
  values ('test', 'test', case when p_with_link then 'SMS test with the app link. Tap the link to open the app.' else 'SMS alerts are working. If you can read this, the alert number is correct.' end, case when p_with_link then '/dashboard' end)
  returning id into i;
  return i;
end $$;
revoke all on function public.send_test_alert(boolean) from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'authenticated') then grant execute on function public.send_test_alert(boolean) to authenticated; end if; end $$;
