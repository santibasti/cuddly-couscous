-- Photos and videos of an ocular visit, sent from Telegram (caption "OV-2026-0001", or /ocular OV-… first) or added in the app.
alter table public.job_photos add column if not exists ocular_id text references public.ocular_visits (id);
create index if not exists job_photos_ocular on public.job_photos (ocular_id) where ocular_id is not null and deleted_at is null;

-- who may see / add them: the office, and the person the visit is assigned to
create or replace function app.photo_ocular_ok(p_ocular text) returns boolean language sql stable security definer set search_path = public as $$
  select p_ocular is not null and (app.has_perm('photos.manage') or app.has_perm('ocular.schedule')
    or exists (select 1 from public.ocular_visits o where o.id = p_ocular and o.assignee_id = app.my_employee())) $$;
drop policy if exists job_photos_select on public.job_photos;
drop policy if exists job_photos_insert on public.job_photos;
create policy job_photos_select on public.job_photos for select using (app.photo_job_ok(job_id) or app.photo_ocular_ok(ocular_id));
create policy job_photos_insert on public.job_photos for insert with check (app.photo_job_ok(job_id) or app.photo_ocular_ok(ocular_id));

-- "/ocular OV-…" keeps the next photos for 30 minutes on that visit
alter table public.telegram_context add column if not exists ocular_id text;
alter table public.telegram_context alter column job_id drop not null;
