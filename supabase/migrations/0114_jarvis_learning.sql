-- Jarvis learning loop: a short log of questions and answers (kept 14 days), thumbs up/down from the owner, and notes he proposes after his nightly review.
-- Also: the nightly review (22:00 Manila = 14:00 UTC) and the weather check for tomorrow's jobs (18:00 Manila = 10:00 UTC).
-- Used only by the Edge Function `jarvis` (service role); RLS on, no policies.
create table if not exists public.jarvis_turns (id bigserial primary key, at timestamptz not null default now(), src text not null default 'screen', question text not null, answer text not null, tools text not null default '');
create index if not exists jarvis_turns_at on public.jarvis_turns (at);
create table if not exists public.jarvis_feedback (id bigserial primary key, at timestamptz not null default now(), rating smallint not null check (rating in (-1, 1)), question text not null default '', answer text not null default '', note text not null default '');
create index if not exists jarvis_feedback_at on public.jarvis_feedback (at);
create table if not exists public.jarvis_proposals (
  id bigserial primary key,
  kind text not null default 'preference' check (kind in ('preference', 'fact', 'routine', 'correction')),
  text text not null check (char_length(text) between 3 and 200),
  why text not null default '',
  status text not null default 'pending' check (status in ('pending', 'rejected', 'accepted')),
  created_at timestamptz not null default now()
);
create unique index if not exists jarvis_proposals_text_uq on public.jarvis_proposals (lower(text));
alter table public.jarvis_turns enable row level security;
alter table public.jarvis_feedback enable row level security;
alter table public.jarvis_proposals enable row level security;
revoke all on public.jarvis_turns, public.jarvis_feedback, public.jarvis_proposals from anon, authenticated;
revoke all on sequence public.jarvis_turns_id_seq, public.jarvis_feedback_id_seq, public.jarvis_proposals_id_seq from anon, authenticated;

do $$ begin
  perform cron.unschedule('jarvis-nightly-review') where exists (select 1 from cron.job where jobname = 'jarvis-nightly-review');
  perform cron.schedule('jarvis-nightly-review', '0 14 * * *', $c$ select net.http_post(url := 'https://ghbumxivporzsalivgyg.supabase.co/functions/v1/jarvis', headers := app.webhook_headers(), body := '{"action":"review"}'::jsonb) $c$);
  perform cron.unschedule('jarvis-weather-check') where exists (select 1 from cron.job where jobname = 'jarvis-weather-check');
  perform cron.schedule('jarvis-weather-check', '0 10 * * *', $c$ select net.http_post(url := 'https://ghbumxivporzsalivgyg.supabase.co/functions/v1/jarvis', headers := app.webhook_headers(), body := '{"action":"weather"}'::jsonb) $c$);
exception when others then
  raise notice 'Could not schedule the Jarvis review / weather jobs: %', sqlerrm;
end $$;
