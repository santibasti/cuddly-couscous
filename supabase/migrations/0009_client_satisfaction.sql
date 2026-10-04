-- Client Satisfaction Check (end of Client Handover): one tap (Not Satisfied / Satisfied / Very Satisfied), optional ticks and comment.
-- Saved against the client, job, team leader, crew, service type and service date.
-- Not Satisfied needs an issue category, creates a "Follow-Up Required" item for the Owner / Admin, and the job cannot be fully closed until it is acknowledged.
create table public.client_feedback (
  like app.base_columns including all,
  job_id text not null references public.jobs (id), workflow_id text references public.workflows (id), client_id text not null references public.clients (id),
  leader_id text, crew_ids jsonb not null default '[]', service_codes jsonb not null default '[]', service_date date not null,
  rating smallint not null check (rating in (1,2,3)),            -- 1 Not Satisfied, 2 Satisfied, 3 Very Satisfied
  aspects jsonb not null default '[]', comment text,
  issue_category text check (issue_category in ('Quality','Damage','Delay','Communication','Scope','Other')),
  follow_up text not null default 'None' check (follow_up in ('None','Required','Acknowledged')),
  ack_note text, ack_by text, ack_at timestamptz,
  submitted_by text, submitted_at timestamptz not null default now()
);
create unique index on public.client_feedback (job_id) where deleted_at is null;
create index on public.client_feedback (service_date);
create index on public.client_feedback (follow_up) where deleted_at is null and follow_up = 'Required';

create trigger trg_touch before update on public.client_feedback for each row execute function app.touch();
create trigger trg_no_delete before delete on public.client_feedback for each row execute function app.no_hard_delete();
create trigger trg_audit after insert or update on public.client_feedback for each row execute function app.audit();

create function app.guard_client_feedback() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.rating = 1 and new.issue_category is null then raise exception 'Not Satisfied needs an issue category (Quality, Damage, Delay, Communication, Scope or Other).'; end if;
    new.follow_up := case when new.rating = 1 then 'Required' else 'None' end;
    return new;
  end if;
  if (new.job_id, new.client_id, new.rating, new.aspects, new.comment, new.issue_category, new.service_date)
     is distinct from (old.job_id, old.client_id, old.rating, old.aspects, old.comment, old.issue_category, old.service_date) then
    raise exception 'Client feedback cannot be edited.'; end if;
  if new.follow_up is distinct from old.follow_up then
    if old.follow_up <> 'Required' or new.follow_up <> 'Acknowledged' then raise exception 'Invalid follow-up change.'; end if;
    if not (app.has_perm('feedback.acknowledge') or auth.uid() is null) then raise exception 'Only the Owner / Admin can acknowledge negative client feedback.'; end if;
    if coalesce(trim(new.ack_note), '') = '' then raise exception 'Enter the follow-up note.'; end if;
  end if;
  return new;
end $$;
create trigger trg_guard_client_feedback before insert or update on public.client_feedback for each row execute function app.guard_client_feedback();

create or replace function app.guard_job_status() returns trigger language plpgsql as $$
declare ok boolean;
begin
  if new.status = old.status then return new; end if;
  ok := (old.status, new.status) in (
    ('Pending','Confirmed'),('Confirmed','Pending'),
    ('Confirmed','Dispatch Checklist Pending'),('Dispatch Checklist Pending','Dispatched'),('Dispatched','On Site'),
    ('On Site','In Progress'),('In Progress','Work Completed'),('In Progress','Completed'),('Work Completed','Closed'),
    ('Work Completed','Leaving Site'),('Leaving Site','Arrived at HQ'),('Arrived at HQ','Closed'))
    or (old.status = 'On Site' and new.status = 'Work Completed' and exists (select 1 from public.workflows w where w.job_id = new.id and w.conf_mode = 'declined'))
    or (new.status in ('Cancelled','Rescheduled') and old.status in ('Pending','Confirmed','Dispatch Checklist Pending'))
    or old.status = 'Rescheduled';
  if not ok then
    if app.change_reason() is not null and (app.has_perm('dispatch.approve') or auth.uid() is null) then return new; end if;
    raise exception 'Job status cannot change from "%" to "%" except by an Operations Manager / Admin override with a reason.', old.status, new.status;
  end if;
  if new.status = 'Closed' and exists (select 1 from public.client_feedback f where f.job_id = new.id and f.follow_up = 'Required' and f.deleted_at is null) then
    raise exception 'The client was not satisfied: the Admin must acknowledge the feedback before the job can be closed.'; end if;
  if new.status = 'Closed' and not exists (select 1 from public.workflows w where w.job_id = new.id and w.closed_at is not null) then
    raise exception 'Close the job from the workflow close-out step.'; end if;
  return new;
end $$;

alter table public.client_feedback enable row level security;
create policy fb_select on public.client_feedback for select using (
  app.has_perm('reports.ops') or app.has_perm('feedback.acknowledge')
  or (app.has_perm('dispatch.view') and (app.has_perm('jobs.all') or exists (select 1 from public.jobs j where j.id = job_id and (j.leader_id = app.my_employee() or j.crew_ids ? app.my_employee())))));
create policy fb_insert on public.client_feedback for insert with check (app.has_perm('dispatch.run'));
create policy fb_update on public.client_feedback for update using (app.has_perm('feedback.acknowledge'));

insert into public.role_permissions (role, permission) values ('owner', 'feedback.acknowledge') on conflict do nothing;
