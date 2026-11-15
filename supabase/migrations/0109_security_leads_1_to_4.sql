-- Security audit follow-up (leads 1-4). Database-side enforcement of rules that only the screens enforced before.

/* ---- 1. job-photos storage: object access follows the photo's own permission, not "any signed-in account" ---- */
-- who may add an object under a path: the office, the leader / crew of the job named by the first folder, or the assignee of the ocular visit (folder ocular/<id>/)
create or replace function app.photo_upload_ok(p_name text) returns boolean language sql stable security definer set search_path = public as $$
  select app.has_perm('photos.manage') or case split_part(p_name, '/', 1)
    when 'unsorted' then false
    when 'ocular' then app.photo_ocular_ok(split_part(p_name, '/', 2))
    else app.photo_job_ok(split_part(p_name, '/', 1)) end $$;
create index if not exists job_photos_thumb on public.job_photos (thumb_path) where thumb_path is not null;
do $$ begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists job_photos_files_read on storage.objects;
    drop policy if exists job_photos_files_add on storage.objects;
    -- the generic policies of 0002 let every jobs.mine holder read, and every jobs.complete holder write, ALL job photos: job-photos leaves them
    drop policy if exists storage_read on storage.objects;
    drop policy if exists storage_write on storage.objects;
    execute $p$create policy storage_read on storage.objects for select to authenticated using (
      (bucket_id = 'receipts' and app.has_perm('expenses.view')) or (bucket_id = 'signed-documents' and (app.has_perm('jobs.all') or app.has_perm('jobs.mine')))
      or (bucket_id = 'equipment-photos' and (app.has_perm('assets.view') or app.has_perm('assets.request')))
      or (bucket_id = 'attendance-selfies' and (app.has_perm('attendance.view') or (storage.foldername(name))[1] = app.my_employee()))
      or (bucket_id = 'employee-documents' and app.has_perm('employees.edit')))$p$;
    execute $p$create policy storage_write on storage.objects for insert to authenticated with check (
      (bucket_id = 'receipts' and app.has_perm('expenses.edit')) or (bucket_id = 'signed-documents' and app.has_perm('jobs.complete'))
      or (bucket_id = 'equipment-photos' and app.has_perm('assets.request'))
      or (bucket_id = 'attendance-selfies' and app.has_perm('attendance.own') and (storage.foldername(name))[1] = app.my_employee())
      or (bucket_id = 'employee-documents' and app.has_perm('employees.edit')))$p$;
    -- an object can be read when its photo row can be read (the job_photos policy decides), or by the office
    execute $p$create policy job_photos_files_read on storage.objects for select to authenticated using (bucket_id = 'job-photos' and (
      app.has_perm('photos.manage') or app.has_perm('jobs.all')
      or exists (select 1 from public.job_photos p where p.deleted_at is null and (p.path = name or p.thumb_path = name))))$p$;
    execute $p$create policy job_photos_files_add on storage.objects for insert to authenticated with check (bucket_id = 'job-photos' and app.photo_upload_ok(name))$p$;
  end if;
exception when others then raise notice 'job-photos storage policies not changed: %', sqlerrm; end $$;

/* ---- 2. the permission matrix is changed only by people who may manage users ---- */
-- app.sync_role_permissions copies settings.data.access into role_permissions as the function owner. Anyone with admin.settings could therefore edit
-- the matrix, grant their own role admin.users and then promote themselves. A settings write by a signed-in person without admin.users now keeps the saved matrix as it is.
create or replace function app.guard_settings_access() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not app.has_perm('admin.users') then
    if tg_op = 'INSERT' then new.data := new.data - 'access';
    elsif (new.data -> 'access') is distinct from (old.data -> 'access') then
      new.data := case when old.data ? 'access' then jsonb_set(new.data, '{access}', old.data -> 'access') else new.data - 'access' end;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_settings_access on public.settings;
create trigger trg_guard_settings_access before insert or update of data on public.settings for each row execute function app.guard_settings_access();

/* ---- 3. client portal logins: decision columns only, and no internal job columns ---- */
create or replace function app.guard_portal_quotation_edit() returns trigger language plpgsql as $$
declare allowed text[] := array['status','decided_at','reject_reason','updated_at','updated_by'];
begin
  if auth.uid() is not null and app.my_client() is not null and not (app.has_perm('sales.edit') or app.has_perm('sales.approve')) then
    if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
      raise exception 'A client portal login can only record a decision on a quotation, not change its content.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_portal_quotation_edit on public.quotations;
create trigger trg_guard_portal_quotation_edit before update on public.quotations for each row execute function app.guard_portal_quotation_edit();

-- the jobs row carries cost and internal notes; a portal login gets a client-safe list through this function instead of the whole row
drop policy if exists jobs_select on public.jobs;
create policy jobs_select on public.jobs for select using (
  app.has_perm('jobs.all') or (app.has_perm('jobs.mine') and (leader_id = app.my_employee() or crew_ids ? app.my_employee())));
create or replace function public.portal_jobs() returns setof jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', j.id, 'number', j.number, 'client_id', j.client_id, 'site_id', j.site_id, 'service_codes', j.service_codes, 'status', j.status,
    'start_at', to_char(j.start_at, 'YYYY-MM-DD"T"HH24:MI'), 'end_at', to_char(j.end_at, 'YYYY-MM-DD"T"HH24:MI'), 'findings', j.findings,
    'completed_at', case when j.completed_at is null then null else to_char(j.completed_at, 'YYYY-MM-DD"T"HH24:MI') end)
  from public.jobs j where app.my_client() is not null and j.client_id = app.my_client() and j.deleted_at is null and j.status <> 'Cancelled' $$;
revoke all on function public.portal_jobs() from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'authenticated') then grant execute on function public.portal_jobs() to authenticated; end if; end $$;

/* ---- 4. job_photos: job, client, ocular visit and marketing consent are tied to the caller's scope ---- */
drop policy if exists job_photos_insert on public.job_photos;
create policy job_photos_insert on public.job_photos for insert with check (
  (ocular_id is null and app.photo_job_ok(job_id))
  or (ocular_id is not null and app.photo_ocular_ok(ocular_id) and (job_id is null or app.photo_job_ok(job_id))));
drop policy if exists job_photos_update on public.job_photos;
create policy job_photos_update on public.job_photos for update
  using (app.has_perm('photos.manage') or uploaded_by = auth.uid())
  with check (app.has_perm('photos.manage') or uploaded_by = auth.uid());
-- only photos.manage can say a client agreed to marketing use, or move a photo to another job / client / visit
create or replace function app.guard_job_photo() returns trigger language plpgsql as $$
begin
  if auth.uid() is null or app.has_perm('photos.manage') then return new; end if;
  if tg_op = 'INSERT' then
    if new.client_ok then raise exception 'Only the office can mark a photo as approved for marketing use.'; end if;
    if new.client_id is not null and not exists (select 1 from public.jobs j where j.id = new.job_id and j.client_id = new.client_id)
       and not exists (select 1 from public.ocular_visits o where o.id = new.ocular_id and o.client_id = new.client_id) then
      raise exception 'The client of a photo must be the client of its job or ocular visit.';
    end if;
  else
    if new.client_ok is distinct from old.client_ok then raise exception 'Only the office can mark a photo as approved for marketing use.'; end if;
    if new.job_id is distinct from old.job_id or new.client_id is distinct from old.client_id or new.ocular_id is distinct from old.ocular_id then
      raise exception 'Only the office can move a photo to another job, client or ocular visit.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_job_photo on public.job_photos;
create trigger trg_guard_job_photo before insert or update on public.job_photos for each row execute function app.guard_job_photo();
