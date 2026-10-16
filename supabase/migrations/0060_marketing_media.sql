-- Marketing photo library: photos staff upload for the Marketing AI to choose from (described by AI), plus a tone for the posts.
create table public.marketing_media (
  id text primary key default gen_random_uuid()::text,
  path text not null unique, thumb_path text,                  -- inside the private 'marketing-graphics' bucket
  description text not null default '', tags text[] not null default '{}',
  quality int check (quality between 1 and 5),                 -- the AI's view of how good it looks on a Page
  privacy_note text,                                           -- e.g. "a licence plate is visible" — the AI will not use the photo until a person clears it
  ok_to_use boolean not null default true,
  used_count int not null default 0, last_used_at timestamptz,
  width int, height int,
  uploaded_by uuid default auth.uid(), created_at timestamptz not null default now(), deleted_at timestamptz
);
create index on public.marketing_media (created_at desc) where deleted_at is null;
alter table public.marketing_media enable row level security;
create policy mkm_select on public.marketing_media for select using (app.has_perm('marketing.manage'));
create policy mkm_insert on public.marketing_media for insert with check (app.has_perm('marketing.manage'));
create policy mkm_update on public.marketing_media for update using (app.has_perm('marketing.manage'));
create trigger trg_no_delete before delete on public.marketing_media for each row execute function app.no_hard_delete();

alter table public.marketing_posts add column media_ids jsonb not null default '[]';   -- marketing_media ids attached to the post
