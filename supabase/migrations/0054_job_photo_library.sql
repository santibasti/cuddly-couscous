-- Photo library: job photos kept in private Storage (not inside the app data), with a small table for what each photo is.
insert into public.role_permissions (role, permission) values ('owner', 'photos.manage'), ('ops', 'photos.manage') on conflict do nothing;

create table public.job_photos (
  id text primary key default gen_random_uuid()::text,
  job_id text references public.jobs (id), client_id text references public.clients (id),
  path text not null unique, thumb_path text,                      -- Storage paths inside the 'job-photos' bucket
  kind text not null default 'Other' check (kind in ('Before', 'After', 'During', 'Site', 'Other')),
  caption text not null default '' check (length(caption) <= 200), tags text[] not null default '{}',
  width int, height int, taken_at timestamptz not null default now(),
  client_ok boolean not null default false,                         -- the client agreed to the photo being used for marketing
  uploaded_by uuid default auth.uid(), created_at timestamptz not null default now(), deleted_at timestamptz
);
create index on public.job_photos (job_id) where deleted_at is null;
create index on public.job_photos (client_id) where deleted_at is null;
create index on public.job_photos (created_at desc) where deleted_at is null;
alter table public.job_photos enable row level security;

-- who may see / add photos: managers, and the leader / crew of the job
create or replace function app.photo_job_ok(p_job text) returns boolean language sql stable security definer set search_path = public as $$
  select app.has_perm('photos.manage') or app.has_perm('jobs.all')
    or (p_job is not null and exists (select 1 from public.jobs j where j.id = p_job and (j.leader_id = app.my_employee() or j.crew_ids ? app.my_employee()))) $$;
create policy job_photos_select on public.job_photos for select using (app.photo_job_ok(job_id));
create policy job_photos_insert on public.job_photos for insert with check (app.photo_job_ok(job_id));
create policy job_photos_update on public.job_photos for update using (app.has_perm('photos.manage') or uploaded_by = auth.uid());

-- the private bucket (skipped where the storage schema does not exist)
do $$ begin
  insert into storage.buckets (id, name, public) values ('job-photos', 'job-photos', false) on conflict (id) do nothing;
  create policy job_photos_files_read on storage.objects for select to authenticated using (bucket_id = 'job-photos');
  create policy job_photos_files_add on storage.objects for insert to authenticated with check (bucket_id = 'job-photos');
exception when others then raise notice 'Storage bucket not created automatically: %', sqlerrm; end $$;
