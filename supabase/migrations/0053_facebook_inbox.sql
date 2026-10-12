-- Facebook Page inbox with an AI assistant: conversations, messages (customer / AI draft / sent), leads created in the system.
insert into public.role_permissions (role, permission) values ('owner', 'inbox.manage'), ('ops', 'inbox.manage') on conflict do nothing;

create table public.fb_conversations (
  id text primary key default gen_random_uuid()::text,
  psid text not null unique,                       -- the Facebook sender id
  name text, status text not null default 'Open' check (status in ('Open', 'Needs a person', 'Lead created', 'Closed')),
  needs_human boolean not null default false, human_reason text,
  inquiry_id text, client_id text,
  last_message_at timestamptz not null default now(), last_customer_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.fb_messages (
  id bigint generated always as identity primary key,
  conversation_id text not null references public.fb_conversations (id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  text text not null,
  status text not null default 'received' check (status in ('received', 'draft', 'sent', 'failed', 'discarded')),
  mid text unique,                                 -- Facebook message id (stops duplicates when Facebook retries)
  by_ai boolean not null default false, error text,
  created_at timestamptz not null default now()
);
create index on public.fb_messages (conversation_id, created_at);
alter table public.fb_conversations enable row level security;
alter table public.fb_messages enable row level security;
create policy fb_conv_select on public.fb_conversations for select using (app.has_perm('inbox.manage'));
create policy fb_conv_update on public.fb_conversations for update using (app.has_perm('inbox.manage'));
create policy fb_msg_select on public.fb_messages for select using (app.has_perm('inbox.manage'));
create policy fb_msg_update on public.fb_messages for update using (app.has_perm('inbox.manage'));

create or replace function public.can_manage_inbox() returns boolean language sql stable security definer set search_path = public as $$ select app.has_perm('inbox.manage') $$;
revoke all on function public.can_manage_inbox() from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'authenticated') then grant execute on function public.can_manage_inbox() to authenticated; end if; end $$;
