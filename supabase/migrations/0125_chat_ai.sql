-- The AI chat (ManyChat → chat-brain): conversations and messages. Mode (off / suggest / full) is in Admin → Settings → AI chat (settings.chat_ai.mode).
-- In "suggest" mode the AI only writes a DRAFT reply; staff approve, edit or discard it in the app. In "full" mode the reply goes out at once, unless a safety check fails (then a person takes over).
-- Staff read these tables in the app (permission inbox.manage, the same as the Facebook Inbox); every change is made by the functions (chat-brain, chat-send).
create table if not exists public.chat_conversations (
  id text primary key default gen_random_uuid()::text,
  channel text not null check (channel in ('messenger', 'instagram', 'whatsapp', 'other')),
  subscriber_id text not null, name text, lang text,
  status text not null default 'Open' check (status in ('Open', 'Needs a person', 'Lead created', 'Closed')),
  human_reason text, client_id text, inquiry_id text,
  last_message_at timestamptz not null default now(), created_at timestamptz not null default now(),
  unique (channel, subscriber_id)
);
create table if not exists public.chat_messages (
  id text primary key default gen_random_uuid()::text,
  conversation_id text not null references public.chat_conversations (id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  body text not null default '',
  status text not null default 'received' check (status in ('received', 'draft', 'approved', 'sent', 'failed', 'discarded')),
  actions jsonb not null default '[]'::jsonb,           -- what staff approval will do (book, save the lead, hand over)
  flags jsonb not null default '[]'::jsonb,             -- safety checks the draft failed
  model text, rulebook_version integer, tool_log jsonb, error text,
  external_id text,                                      -- the chatbot's own message id: the same message is never handled twice
  created_at timestamptz not null default now(), decided_by text, decided_at timestamptz
);
create unique index if not exists chat_messages_external on public.chat_messages (conversation_id, external_id) where external_id is not null;
create index if not exists chat_messages_conv on public.chat_messages (conversation_id, created_at);
create index if not exists chat_messages_drafts on public.chat_messages (status) where status in ('draft', 'failed', 'approved');
alter table public.chat_conversations enable row level security; alter table public.chat_messages enable row level security;
drop policy if exists chat_conv_read on public.chat_conversations; create policy chat_conv_read on public.chat_conversations for select using (app.has_perm('inbox.manage'));
drop policy if exists chat_msg_read on public.chat_messages; create policy chat_msg_read on public.chat_messages for select using (app.has_perm('inbox.manage'));
revoke all on public.chat_conversations, public.chat_messages from anon, authenticated;
grant select on public.chat_conversations, public.chat_messages to authenticated;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.chat_messages; exception when duplicate_object then null; end;
  end if;
exception when others then raise notice 'Realtime for chat_messages not enabled: %', sqlerrm;
end $$;
