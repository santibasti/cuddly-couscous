-- Marketing AI: posts for the Facebook Page, written by the AI (or by staff), approved, scheduled and published by the marketing-run Edge Function.
insert into public.role_permissions (role, permission) values ('owner', 'marketing.manage'), ('ops', 'marketing.manage') on conflict do nothing;

create table public.marketing_posts (
  id text primary key default gen_random_uuid()::text,
  kind text not null default 'Tip' check (kind in ('Tip', 'Completed job', 'Promo', 'Seasonal', 'Other')),
  text text not null,
  photo_ids jsonb not null default '[]',               -- job_photos ids (only photos the client agreed to share)
  job_id text,                                         -- the booking a "Completed job" post is about
  scheduled_at timestamptz not null,
  status text not null default 'Idea' check (status in ('Idea', 'Approved', 'Posted', 'Failed', 'Rejected')),
  by_ai boolean not null default false,
  fb_post_id text, posted_at timestamptz, error text,
  created_by text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.marketing_posts (status, scheduled_at);
alter table public.marketing_posts enable row level security;
create policy mkt_select on public.marketing_posts for select using (app.has_perm('marketing.manage'));
create policy mkt_insert on public.marketing_posts for insert with check (app.has_perm('marketing.manage'));
create policy mkt_update on public.marketing_posts for update using (app.has_perm('marketing.manage'));
create trigger trg_no_delete before delete on public.marketing_posts for each row execute function app.no_hard_delete();

create or replace function public.can_manage_marketing() returns boolean language sql stable security definer set search_path = public as $$ select app.has_perm('marketing.manage') $$;
revoke all on function public.can_manage_marketing() from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'authenticated') then grant execute on function public.can_manage_marketing() to authenticated; end if; end $$;

-- every hour: top up the schedule with new drafts and publish what is due
do $$ begin
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron;
  perform cron.unschedule('marketing-run') where exists (select 1 from cron.job where jobname = 'marketing-run');
  perform cron.schedule('marketing-run', '7 * * * *', $c$ select net.http_post(url := 'https://ghbumxivporzsalivgyg.supabase.co/functions/v1/marketing-run', headers := '{"Content-Type": "application/json"}'::jsonb, body := '{"action":"tick"}'::jsonb) $c$);
exception when others then
  raise notice 'Could not schedule the marketing run automatically: %', sqlerrm;
end $$;
