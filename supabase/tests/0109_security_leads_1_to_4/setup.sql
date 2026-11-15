create role authenticated nologin; create role anon nologin;
create schema auth; create schema app; create schema storage;
grant usage on schema auth, app, storage, public to authenticated;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true), '')::uuid $$;
create table public.profiles(id uuid primary key, role text, client_id text, employee_id text, active boolean default true);
create table public.perms(role text, permission text);
create function app.user_role() returns text language sql stable security definer as $$ select role from public.profiles where id = auth.uid() and active $$;
create function app.has_perm(p text) returns boolean language sql stable security definer as $$ select app.user_role() = 'owner' or exists(select 1 from public.perms where role = app.user_role() and permission = p) $$;
create function app.my_client() returns text language sql stable security definer as $$ select client_id from public.profiles where id = auth.uid() and active $$;
create function app.my_employee() returns text language sql stable security definer as $$ select employee_id from public.profiles where id = auth.uid() and active $$;
create table public.settings(id text primary key, data jsonb not null default '{}', updated_at timestamptz, updated_by text);
create table public.role_permissions(role text, permission text);
create table public.clients(id text primary key);
create table public.jobs(id text primary key, number text, client_id text, site_id text default 's', service_codes jsonb default '[]', status text default 'Confirmed', start_at timestamp default now(), end_at timestamp default now(), findings text, completed_at timestamp, estimated_cost numeric default 0, internal_notes text, leader_id text, crew_ids jsonb default '[]', deleted_at timestamptz);
create table public.quotations(id text primary key, client_id text, status text, items jsonb default '[]', terms text, decided_at timestamptz, reject_reason text, updated_at timestamptz, updated_by text);
create table public.ocular_visits(id text primary key, client_id text, assignee_id text);
create table public.job_photos(id text primary key, job_id text, client_id text, ocular_id text, path text unique, thumb_path text, caption text default '', client_ok boolean default false, uploaded_by uuid default auth.uid(), deleted_at timestamptz);
create function app.photo_job_ok(p_job text) returns boolean language sql stable security definer as $$
  select app.has_perm('photos.manage') or app.has_perm('jobs.all') or (p_job is not null and exists (select 1 from public.jobs j where j.id = p_job and (j.leader_id = app.my_employee() or j.crew_ids ? app.my_employee()))) $$;
create function app.photo_ocular_ok(p_ocular text) returns boolean language sql stable security definer as $$
  select p_ocular is not null and (app.has_perm('photos.manage') or app.has_perm('ocular.schedule') or exists (select 1 from public.ocular_visits o where o.id = p_ocular and o.assignee_id = app.my_employee())) $$;
create table storage.objects(id serial primary key, bucket_id text, name text);
create table storage.buckets(id text primary key, name text, public boolean);
create function storage.foldername(n text) returns text[] language sql as $$ select string_to_array(n, '/') $$;
-- policies as they are before 0109
alter table public.settings enable row level security; alter table public.jobs enable row level security; alter table public.quotations enable row level security; alter table public.job_photos enable row level security; alter table storage.objects enable row level security;
create policy settings_read on public.settings for select using (auth.uid() is not null);
create policy settings_write on public.settings for all using (app.has_perm('admin.settings')) with check (app.has_perm('admin.settings'));
create policy jobs_select on public.jobs for select using (app.has_perm('jobs.all') or (app.has_perm('jobs.mine') and (leader_id = app.my_employee() or crew_ids ? app.my_employee())) or client_id = app.my_client());
create policy q_staff on public.quotations for all using (app.has_perm('sales.edit') or app.has_perm('sales.approve'));
create policy portal_quotations on public.quotations for select using (client_id = app.my_client() and status <> 'Draft');
create policy portal_decision on public.quotations for update using (client_id = app.my_client() and status = 'Sent');
create policy job_photos_select on public.job_photos for select using (app.photo_job_ok(job_id) or app.photo_ocular_ok(ocular_id));
create policy job_photos_insert on public.job_photos for insert with check (app.photo_job_ok(job_id) or app.photo_ocular_ok(ocular_id));
create policy job_photos_update on public.job_photos for update using (app.has_perm('photos.manage') or uploaded_by = auth.uid());
create policy storage_read on storage.objects for select to authenticated using ((bucket_id in ('job-photos','signed-documents') and (app.has_perm('jobs.all') or app.has_perm('jobs.mine'))));
create policy storage_write on storage.objects for insert to authenticated with check ((bucket_id in ('job-photos','signed-documents') and app.has_perm('jobs.complete')));
create policy job_photos_files_read on storage.objects for select to authenticated using (bucket_id = 'job-photos');
create policy job_photos_files_add on storage.objects for insert to authenticated with check (bucket_id = 'job-photos');
grant all on all tables in schema public, storage to authenticated; grant usage on all sequences in schema storage to authenticated;
-- sync trigger of 0032 (simplified)
create function app.sync_role_permissions() returns trigger language plpgsql security definer as $$ begin delete from public.role_permissions; insert into public.role_permissions select k, p from jsonb_each(new.data->'access') e(k,v), jsonb_array_elements_text(e.v) p; return new; end $$;
create trigger trg_sync after insert or update of data on public.settings for each row execute function app.sync_role_permissions();
-- people
insert into public.profiles values ('00000000-0000-0000-0000-000000000001','owner',null,null),('00000000-0000-0000-0000-000000000002','pricing',null,null),('00000000-0000-0000-0000-000000000003','portal','c1',null),('00000000-0000-0000-0000-000000000004','crew',null,'e1'),('00000000-0000-0000-0000-000000000005','crew',null,'e2'),('00000000-0000-0000-0000-000000000006','ops',null,null);
insert into public.perms values ('pricing','admin.settings'),('crew','jobs.mine'),('crew','jobs.complete'),('ops','photos.manage'),('ops','jobs.all');
insert into public.clients values ('c1'),('c2');
insert into public.jobs(id,number,client_id,leader_id,crew_ids,estimated_cost,internal_notes) values ('jA','JOB-A','c1','e1','[]',5000,'secret cost note'),('jB','JOB-B','c2','e2','[]',9000,'other');
insert into public.ocular_visits values ('oA','c1','e1');
insert into public.settings values ('main','{"access":{"pricing":["admin.settings"]},"rates":{"x":1}}');
insert into public.quotations(id,client_id,status,items,terms) values ('qA','c1','Sent','[{"rate":100}]','terms');
insert into storage.objects(bucket_id,name) values ('job-photos','jA/a.jpg'),('job-photos','jB/b.jpg'),('job-photos','unsorted/u.jpg'),('job-photos','jB/moved_t.jpg');
insert into public.job_photos(id,job_id,client_id,path,thumb_path,uploaded_by) values ('pA','jA','c1','jA/a.jpg',null,null),('pB','jB','c2','jB/b.jpg',null,null),('pM','jA','c1','unsorted/u.jpg',null,null);
