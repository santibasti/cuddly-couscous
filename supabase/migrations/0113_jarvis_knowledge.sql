-- Jarvis company knowledge base: the owner uploads a document on the Jarvis screen; it is cut into sections here so Jarvis can look up the right part when asked.
-- Kept ONLY in the database (the repository is public and the document is confidential). Used only by the Edge Function `jarvis` (service role); RLS on, no policies.
create table if not exists public.jarvis_knowledge (
  num integer primary key,
  title text not null,
  body text not null,
  chars integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.jarvis_knowledge enable row level security;
revoke all on public.jarvis_knowledge from anon, authenticated;
