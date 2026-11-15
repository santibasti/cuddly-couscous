-- Jarvis long-term memory: short notes he learns about the owner (preferences, corrections, routines, facts) and a count of what the owner asks about most.
-- Used only by the Edge Function `jarvis` (service role); the owner sees and deletes notes through the Jarvis screen, which goes through the function. RLS is on with no policies.
create table if not exists public.jarvis_notes (
  id bigserial primary key,
  kind text not null default 'fact' check (kind in ('preference', 'fact', 'routine', 'correction')),
  text text not null check (char_length(text) between 3 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists jarvis_notes_text_uq on public.jarvis_notes (lower(text));
create table if not exists public.jarvis_topics (topic text primary key, n integer not null default 0, last_at timestamptz not null default now());
alter table public.jarvis_notes enable row level security;
alter table public.jarvis_topics enable row level security;
revoke all on public.jarvis_notes, public.jarvis_topics from anon, authenticated;
revoke all on sequence public.jarvis_notes_id_seq from anon, authenticated;
