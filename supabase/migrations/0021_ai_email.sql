-- AI Email: isolated server-managed records, never included in offline sync.
create table if not exists public.email_threads (
  id uuid primary key default gen_random_uuid(),
  graph_message_id text not null unique,
  conversation_id text,
  sender_email text not null,
  sender_name text,
  subject text not null default '',
  preview text not null default '',
  received_at timestamptz not null,
  status text not null default 'new' check (status in ('new','draft','sending','sent','skipped','needs_review')),
  ai_draft text,
  draft_edited_at timestamptz,
  sent_at timestamptz,
  sent_by uuid references auth.users(id),
  graph_sent_draft_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_threads_received_idx on public.email_threads(received_at desc);
create index if not exists email_threads_status_idx on public.email_threads(status);
alter table public.email_threads enable row level security;
-- No client-side insert/update/delete: service-role Edge Function enforces authorization.
create policy email_owner_read on public.email_threads for select to authenticated
  using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and p.deleted_at is null and p.role in ('owner','ops')));
create table if not exists public.email_audit (
  id bigint generated always as identity primary key,
  thread_id uuid references public.email_threads(id),
  action text not null,
  actor uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.email_audit enable row level security;
create policy email_audit_owner_read on public.email_audit for select to authenticated
  using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and p.deleted_at is null and p.role='owner'));
