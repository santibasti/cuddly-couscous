-- Announcements to the crew and staff: rewards, awards, recognition, news and reminders from TopMop, shown in everyone's app.
-- announce.manage (Owner by default) writes them; announce.view (all staff roles) reads the ones meant for them.
-- Clients (portal logins) never see these: they have no announce.view.
create table public.announcements (
  like app.base_columns including all,
  kind text not null default 'Announcement' check (kind in ('Reward','Award','Recognition','Announcement','Reminder')),
  title text not null,
  body text not null default '',
  awardee_ids jsonb not null default '[]',        -- employees being recognised (they always see it)
  reward text,                                      -- e.g. "₱1,000 bonus" or "Extra day off"
  audience text not null default 'all' check (audience in ('all','leaders','people')),
  audience_ids jsonb not null default '[]',        -- employee ids when audience = 'people'
  pinned boolean not null default false,
  status text not null default 'Published' check (status in ('Draft','Published','Archived')),
  publish_at timestamptz,                           -- show from this time (empty = now)
  expires_on date                                   -- hide after this day (empty = keep showing)
);
create index on public.announcements (created_at desc) where deleted_at is null;
alter table public.announcements enable row level security;
create policy ann_select on public.announcements for select using (
  (select app.has_perm('announce.manage'))
  or ((select app.has_perm('announce.view')) and deleted_at is null and status = 'Published'
      and (publish_at is null or publish_at <= now()) and (expires_on is null or expires_on >= (now() at time zone 'Asia/Manila')::date)
      and (audience = 'all'
           or (audience = 'leaders' and (select app.user_role()::text) in ('leader', 'ops', 'owner'))
           or (audience = 'people' and audience_ids ? (select app.my_employee()))
           or awardee_ids ? (select app.my_employee())))
);
create policy ann_insert on public.announcements for insert with check ((select app.has_perm('announce.manage')));
create policy ann_update on public.announcements for update using ((select app.has_perm('announce.manage')));
create trigger trg_touch before update on public.announcements for each row execute function app.touch();
create trigger trg_no_delete before delete on public.announcements for each row execute function app.no_hard_delete();
create trigger trg_audit after insert or update on public.announcements for each row execute function app.audit();

-- who has seen an announcement and how they reacted (one row per person)
create table public.announcement_reactions (
  announcement_id text not null references public.announcements (id),
  user_id text not null default auth.uid()::text,
  seen_at timestamptz not null default now(),
  reaction text check (reaction is null or reaction in ('👏','🎉','❤️','💪')),
  primary key (announcement_id, user_id)
);
alter table public.announcement_reactions enable row level security;
create policy annr_select on public.announcement_reactions for select using (user_id = (select auth.uid()::text) or (select app.has_perm('announce.manage')));
create policy annr_insert on public.announcement_reactions for insert with check (user_id = (select auth.uid()::text) and (select app.has_perm('announce.view')));
create policy annr_update on public.announcement_reactions for update using (user_id = (select auth.uid()::text));

-- totals for the cards ("12 colleagues cheered", "9 of 12 have seen it"), without exposing who
create or replace function public.announcement_stats(p_ids text[]) returns table (announcement_id text, seen int, reactions jsonb)
language sql stable security definer set search_path = public as $$
  select r.announcement_id, count(*)::int,
         coalesce(jsonb_object_agg(r.reaction, r.n) filter (where r.reaction is not null), '{}'::jsonb)
    from (select announcement_id, reaction, count(*) over (partition by announcement_id, reaction) as n from public.announcement_reactions where announcement_id = any(p_ids)) r
   where app.has_perm('announce.view')
   group by r.announcement_id
$$;
revoke all on function public.announcement_stats(text[]) from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'authenticated') then grant execute on function public.announcement_stats(text[]) to authenticated; end if; end $$;

insert into public.role_permissions (role, permission) values
  ('ops', 'announce.view'), ('finance', 'announce.view'), ('leader', 'announce.view'), ('field', 'announce.view') on conflict do nothing;
