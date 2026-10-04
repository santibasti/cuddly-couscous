-- Ocular visits (site inspections) + the revised Client Satisfaction Check.

/* ---------------- Ocular visits ---------------- */
create table public.ocular_visits (
  like app.base_columns including all,
  number text not null unique,
  client_id text not null references public.clients (id), contact_person text not null check (length(trim(contact_person)) > 0), contact_mobile text,
  site_id text references public.sites (id), location text not null check (length(trim(location)) > 0),
  service_codes jsonb not null check (jsonb_array_length(service_codes) > 0),
  start_at timestamp not null, duration_min integer not null check (duration_min between 15 and 600),
  assignee_id text references public.employees (id), concerns text not null default '', access_notes text not null default '',
  status text not null default 'Scheduled' check (status in ('Scheduled','Confirmed','Completed','Cancelled','Converted to Quotation')),
  branch_id text references public.branches (id),
  panels jsonb not null default '[]', measurements jsonb not null default '[]', findings text not null default '',     -- no photos, no odometer
  completed_at timestamp, completed_by text, cancel_reason text, quotation_id text references public.quotations (id), converted_at timestamptz
);
create index on public.ocular_visits (start_at) where deleted_at is null;
create index on public.ocular_visits (status) where deleted_at is null;
create index on public.ocular_visits (assignee_id);
alter table public.quotations
  add column ocular_visit_id text references public.ocular_visits (id), add column ocular_assignee_id text,
  add column ocular_panels jsonb, add column ocular_measurements jsonb;

create trigger trg_touch before update on public.ocular_visits for each row execute function app.touch();
create trigger trg_no_delete before delete on public.ocular_visits for each row execute function app.no_hard_delete();
create trigger trg_audit after insert or update on public.ocular_visits for each row execute function app.audit();

create function app.guard_ocular_visit() returns trigger language plpgsql as $$
begin
  if new.status in ('Scheduled','Confirmed') and exists (
       select 1 from public.ocular_visits o where o.id <> new.id and o.deleted_at is null and o.status in ('Scheduled','Confirmed') and o.assignee_id = new.assignee_id and new.assignee_id is not null
         and o.start_at < new.start_at + make_interval(mins => new.duration_min) and new.start_at < o.start_at + make_interval(mins => o.duration_min)) then
    raise exception 'The estimator is already booked at that time.'; end if;
  if tg_op = 'UPDATE' then
    if old.status in ('Cancelled','Converted to Quotation') and new.status is distinct from old.status then raise exception 'A % visit cannot be changed.', lower(old.status); end if;
    if new.status = 'Converted to Quotation' and (old.status <> 'Completed' or new.quotation_id is null) then raise exception 'Complete the ocular visit before creating a quotation from it.'; end if;
    if new.status = 'Completed' and old.status not in ('Scheduled','Confirmed','Completed') then raise exception 'This visit cannot be completed.'; end if;
    if new.status = 'Cancelled' and coalesce(trim(new.cancel_reason), '') = '' then raise exception 'Enter the reason for cancelling.'; end if;
  end if;
  return new;
end $$;
create trigger trg_guard_ocular_visit before insert or update on public.ocular_visits for each row execute function app.guard_ocular_visit();

alter table public.ocular_visits enable row level security;
create policy ov_select on public.ocular_visits for select using (app.has_perm('ocular.schedule') or app.has_perm('reports.ops') or (app.has_perm('ocular.view') and (app.has_perm('jobs.all') or assignee_id = app.my_employee())));
create policy ov_insert on public.ocular_visits for insert with check (app.has_perm('ocular.schedule'));
create policy ov_update on public.ocular_visits for update using (app.has_perm('ocular.schedule') or (app.has_perm('ocular.complete') and assignee_id = app.my_employee()));
insert into public.role_permissions (role, permission) values
('owner', 'ocular.view'), ('owner', 'ocular.schedule'), ('owner', 'ocular.complete'),
('ops', 'ocular.view'), ('ops', 'ocular.schedule'), ('ops', 'ocular.complete'), ('leader', 'ocular.view'), ('leader', 'ocular.complete')
on conflict do nothing;

/* ---------------- Client Satisfaction Check: three 1–5 questions + overall ---------------- */
alter table public.client_feedback
  add column q_quality smallint check (q_quality between 1 and 5), add column q_professionalism smallint check (q_professionalism between 1 and 5), add column q_communication smallint check (q_communication between 1 and 5);

create or replace function app.guard_client_feedback() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if (new.rating = 1 or coalesce(new.q_quality, 5) <= 2 or coalesce(new.q_professionalism, 5) <= 2 or coalesce(new.q_communication, 5) <= 2) then
      if new.issue_category is null then raise exception 'Not Satisfied or a rating of 1–2 needs an issue category (Quality, Delay, Communication, Damage, Scope or Other).'; end if;
      new.follow_up := 'Required';
    else new.follow_up := 'None'; end if;
    return new;
  end if;
  if (new.job_id, new.client_id, new.rating, new.aspects, new.comment, new.issue_category, new.service_date, new.q_quality, new.q_professionalism, new.q_communication)
     is distinct from (old.job_id, old.client_id, old.rating, old.aspects, old.comment, old.issue_category, old.service_date, old.q_quality, old.q_professionalism, old.q_communication) then
    raise exception 'Client feedback cannot be edited.'; end if;
  if new.follow_up is distinct from old.follow_up then
    if old.follow_up <> 'Required' or new.follow_up <> 'Acknowledged' then raise exception 'Invalid follow-up change.'; end if;
    if not (app.has_perm('feedback.acknowledge') or auth.uid() is null) then raise exception 'Only the Owner / Admin can acknowledge negative client feedback.'; end if;
    if coalesce(trim(new.ack_note), '') = '' then raise exception 'Enter the follow-up note.'; end if;
  end if;
  return new;
end $$;
