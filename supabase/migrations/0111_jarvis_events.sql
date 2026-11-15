-- Jarvis activity log: what Jarvis did and when (brief delivered, alert spoken, question answered, web search used). Shown on the Jarvis console screen.
-- No question or answer text is stored here, only the kind of event. Written and read by the jarvis function (service role).
create table if not exists public.jarvis_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null,
  text text not null
);
create index if not exists jarvis_events_at on public.jarvis_events (at desc);
alter table public.jarvis_events enable row level security;
