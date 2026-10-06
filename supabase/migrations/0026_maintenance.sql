-- Maintenance module: preventive maintenance of vehicles and operating equipment.
--   maint_profiles   one per tracked asset (category, assigned to, responsible person, provider, readings, registration / insurance dates)
--   maint_templates  reusable checklists per asset type
--   maint_plans      recurring tasks on an asset (by date, mileage, operating hours, usage count or custom)
--   maint_records    work records: Requested → Scheduled → In Progress → Completed (or Deferred / Cancelled), with parts, cost and completion details
-- Only Admin / Operations (maintenance.manage) plan, edit, defer, approve cost or complete. Team Leaders (maintenance.request) can only report an issue.
-- Assets set to Under Maintenance or Out of Service can no longer be released to a job.

-- 1. two new asset statuses
alter table public.assets drop constraint if exists assets_status_check;
alter table public.assets add constraint assets_status_check
  check (status in ('Available','Reserved','In Use','Due for Maintenance','Under Maintenance','Out of Service','Damaged','Missing','Retired'));

-- 2. releasing equipment: refuse the new unavailable status too (re-creates the current guard with the extra status)
do $$
declare src text;
begin
  select pg_get_functiondef('app.guard_checkout()'::regprocedure) into src;
  if src like '%''Retired'',''Damaged'',''Under Maintenance'')%' then
    execute replace(src, '''Retired'',''Damaged'',''Under Maintenance'')', '''Retired'',''Damaged'',''Under Maintenance'',''Out of Service'')');
  end if;
end $$;

-- 3. tables
create table public.maint_templates (
  like app.base_columns including all,
  name text not null, mcategory text not null check (mcategory in ('Vehicle','Water System','Pump','Pressure Washer','Vacuum','Safety Equipment','Tool','Other')),
  tasks jsonb not null default '[]'
);
create table public.maint_profiles (
  like app.base_columns including all,
  asset_id text not null unique references public.assets (id),
  mcategory text not null check (mcategory in ('Vehicle','Water System','Pump','Pressure Washer','Vacuum','Safety Equipment','Tool','Other')),
  assigned_to text, responsible_id text, provider text, notes text,
  reading_unit text check (reading_unit in ('km','hours')), last_reading numeric(12,1) check (last_reading >= 0), reading_at date,
  registration_due date, insurance_due date
);
create table public.maint_plans (
  like app.base_columns including all,
  asset_id text not null references public.assets (id),
  task_name text not null, task_type text not null check (task_type in ('Inspect','Clean','Replace','Repair','Refill','Calibrate','Service')), description text not null default '',
  freq_kind text not null check (freq_kind in ('date','hours','usage','mileage','custom')), interval_days integer check (interval_days > 0), interval_reading numeric(12,1) check (interval_reading > 0), custom_note text,
  est_minutes integer, est_cost numeric(12,2) not null default 0 check (est_cost >= 0), priority text not null default 'Normal' check (priority in ('Low','Normal','High','Urgent')),
  parts jsonb not null default '[]', responsible_id text, active boolean not null default true, template_name text,
  last_done date, last_done_reading numeric(12,1), next_due date, next_due_reading numeric(12,1)
);
create index on public.maint_plans (asset_id) where deleted_at is null;
create table public.maint_records (
  like app.base_columns including all,
  number text not null unique, asset_id text not null references public.assets (id), plan_id text,
  title text not null, task_type text not null check (task_type in ('Inspect','Clean','Replace','Repair','Refill','Calibrate','Service')), description text not null default '',
  priority text not null default 'Normal' check (priority in ('Low','Normal','High','Urgent')),
  status text not null default 'Scheduled' check (status in ('Requested','Scheduled','In Progress','Completed','Deferred','Cancelled')),
  due_date date, due_reading numeric(12,1), responsible_id text, est_cost numeric(12,2) not null default 0 check (est_cost >= 0),
  requested_by text, request_note text, approval text not null default 'Not needed' check (approval in ('Not needed','Pending','Approved')), approved_by text, approved_at timestamptz,
  parts jsonb not null default '[]', checklist jsonb not null default '[]',
  started_at timestamptz, completed_at timestamptz, completed_by text, actual_cost numeric(12,2) check (actual_cost >= 0), provider text, before_notes text, after_notes text, reading_at_done numeric(12,1),
  next_due date, next_due_reading numeric(12,1), link text, deferred_until date, defer_reason text, cancel_reason text, expense_id text,
  history jsonb not null default '[]'
);
create index on public.maint_records (asset_id) where deleted_at is null;
create index on public.maint_records (due_date) where deleted_at is null;

do $$
declare t text;
begin
  foreach t in array array['maint_templates','maint_profiles','maint_plans','maint_records'] loop
    execute format('create trigger trg_touch before update on public.%I for each row execute function app.touch()', t);
    execute format('create trigger trg_no_delete before delete on public.%I for each row execute function app.no_hard_delete()', t);
    execute format('create trigger trg_audit after insert or update on public.%I for each row execute function app.audit()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select using (app.has_perm(%L) or app.has_perm(%L))', t || '_select', t, 'maintenance.view', 'maintenance.request');
  end loop;
end $$;
create policy mtt_write on public.maint_templates for all using (app.has_perm('maintenance.manage')) with check (app.has_perm('maintenance.manage'));
create policy mtp_write on public.maint_profiles  for all using (app.has_perm('maintenance.manage')) with check (app.has_perm('maintenance.manage'));
create policy mtq_write on public.maint_plans     for all using (app.has_perm('maintenance.manage')) with check (app.has_perm('maintenance.manage'));
-- records: Admin / Operations do everything; a Team Leader may only add a Requested one
create policy mtr_insert on public.maint_records for insert with check (app.has_perm('maintenance.manage') or (app.has_perm('maintenance.request') and status = 'Requested' and approval = 'Pending'));
create policy mtr_update on public.maint_records for update using (app.has_perm('maintenance.manage'));

-- 4. rules on a record
create function app.guard_maint_record() returns trigger language plpgsql as $$
declare a_status text;
begin
  if auth.uid() is not null and tg_op = 'UPDATE' and not app.has_perm('maintenance.manage') then raise exception 'Only Admin / Operations can change maintenance records.'; end if;
  if tg_op = 'UPDATE' then
    if old.status in ('Completed','Cancelled') and (to_jsonb(new) - array['link','history','expense_id','updated_at','updated_by']) <> (to_jsonb(old) - array['link','history','expense_id','updated_at','updated_by']) then
      raise exception 'A completed or cancelled maintenance record cannot be changed.';
    end if;
    if new.deleted_at is not null and old.deleted_at is null and old.status = 'Completed' then raise exception 'A completed maintenance record is kept for the history and cannot be deleted.'; end if;
    if new.status = 'In Progress' and old.status <> 'In Progress' then
      select status into a_status from public.assets where id = new.asset_id;
      if a_status = 'In Use' or exists (select 1 from public.checkouts c where c.asset_id = new.asset_id and c.status = 'Released' and c.deleted_at is null) then raise exception 'This asset is checked out on a job. Return it before starting maintenance.'; end if;
    end if;
    if new.status = 'Completed' and old.status <> 'Completed' then
      if new.completed_by is null or new.completed_at is null or new.actual_cost is null then raise exception 'Record who completed it, when, and the actual cost.'; end if;
      if new.completed_at > now() + interval '1 day' then raise exception 'The completion date cannot be in the future.'; end if;
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_maint_record before insert or update on public.maint_records for each row execute function app.guard_maint_record();

-- 5. document numbers: add MT
create or replace function public.next_numbers(p_kind text, p_n integer default 1) returns integer[]
language plpgsql security definer set search_path = public as $$
declare cur integer; res integer[];
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_kind not in ('QT','JOB','INV','OR','EMP','INC','DR','BJ','OV','JO','MT') then raise exception 'Unknown document number type %', p_kind; end if;
  if p_n < 1 or p_n > 50 then raise exception 'Ask for 1 to 50 numbers at a time.'; end if;
  select coalesce((data -> 'counters' ->> p_kind)::integer, 0) into cur from public.settings where id = 'main' for update;
  if not found then raise exception 'Company settings have not been loaded (settings row missing).'; end if;
  update public.settings
     set data = jsonb_set(data, '{counters}', coalesce(data -> 'counters', '{}'::jsonb) || jsonb_build_object(p_kind, cur + p_n)), updated_at = now(), updated_by = auth.uid()::text
   where id = 'main';
  select array_agg(g order by g) into res from generate_series(cur + 1, cur + p_n) g;
  return res;
end $$;

-- 6. who can do what
insert into public.role_permissions (role, permission) values
  ('owner','maintenance.view'),('owner','maintenance.request'),('owner','maintenance.manage'),
  ('ops','maintenance.view'),('ops','maintenance.request'),('ops','maintenance.manage'),
  ('leader','maintenance.view'),('leader','maintenance.request'),
  ('finance','maintenance.view')
on conflict do nothing;
