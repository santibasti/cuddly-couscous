-- Messages the chat sends later: the automatic Job Order goes to the customer a few minutes after the booking (Admin → Settings → Messenger booking rules).
create table if not exists public.chat_followups (
  id text primary key default gen_random_uuid()::text,
  channel text not null default 'messenger',
  subscriber_id text not null,
  job_order_id text,
  messages jsonb not null,                                   -- ManyChat content messages, e.g. [{"type":"text","text":"..."}]
  send_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0, error text,
  created_at timestamptz not null default now(), sent_at timestamptz
);
create index if not exists chat_followups_due on public.chat_followups (send_at) where status = 'pending';
alter table public.chat_followups enable row level security;
drop policy if exists chat_followups_read on public.chat_followups; create policy chat_followups_read on public.chat_followups for select using (app.has_perm('inbox.manage'));
revoke all on public.chat_followups from anon, authenticated; grant select on public.chat_followups to authenticated;
-- every minute: send what is due (only calls the function when something is waiting)
do $$ begin
  perform cron.unschedule('chat-followups') where exists (select 1 from cron.job where jobname = 'chat-followups');
  perform cron.schedule('chat-followups', '* * * * *', $c$ select net.http_post(url := 'https://ghbumxivporzsalivgyg.supabase.co/functions/v1/chat-followups', headers := app.webhook_headers(), body := '{}'::jsonb) where exists (select 1 from public.chat_followups where status = 'pending' and send_at <= now() and attempts < 3) $c$);
exception when others then
  raise notice 'Could not schedule the chat follow-ups: %', sqlerrm;
end $$;
