-- Client Lifetime Value & Maintenance Follow-Up.
--   Read-only over invoices and payments (no financial calculation changes). Follow-ups are counted from each client's newest completed service:
--   a 6-month and a 1-year follow-up by default, or the Admin's custom interval (a client rule wins over a service-type rule).
--   A newer completed service supersedes the open follow-ups of the older one (kept as history) and creates fresh dates; one row per client + interval + service.
--   Only the Admin (followups.manage) records Contacted / Follow-Up Scheduled / Quotation Sent / Booked / Not Interested / Snoozed.

create table public.followup_rules (
  like app.base_columns including all,
  client_id text references public.clients (id), service_code text,
  short_months integer not null check (short_months between 1 and 36),
  long_months integer not null check (long_months between 2 and 60),
  note text,
  check ((client_id is not null) <> (service_code is not null)),
  check (long_months > short_months)
);
create unique index followup_rules_client_uq on public.followup_rules (client_id) where deleted_at is null and client_id is not null;
create unique index followup_rules_service_uq on public.followup_rules (service_code) where deleted_at is null and service_code is not null;

create table public.followups (
  like app.base_columns including all,
  client_id text not null references public.clients (id),
  slot text not null check (slot in ('short','long')),
  months integer not null check (months between 1 and 60),
  reference_job_id text not null references public.jobs (id), reference_date date not null,
  service_codes jsonb not null default '[]',
  due_date date not null,
  status text not null default 'Open' check (status in ('Open','Contacted','Follow-Up Scheduled','Quotation Sent','Booked','Not Interested','Snoozed','Superseded')),
  snoozed_until date, note text,
  booked_job_id text references public.jobs (id), superseded_by_job_id text references public.jobs (id),
  actioned_by text, actioned_at timestamptz,
  history jsonb not null default '[]'
);
create unique index followups_one_per_interval on public.followups (client_id, slot, reference_job_id) where deleted_at is null;
create index on public.followups (client_id) where deleted_at is null;
create index on public.followups (due_date) where deleted_at is null and status in ('Open','Contacted','Follow-Up Scheduled','Quotation Sent','Snoozed');

create trigger trg_touch before update on public.followup_rules for each row execute function app.touch();
create trigger trg_no_delete before delete on public.followup_rules for each row execute function app.no_hard_delete();
create trigger trg_audit after insert or update on public.followup_rules for each row execute function app.audit();
create trigger trg_touch before update on public.followups for each row execute function app.touch();
create trigger trg_no_delete before delete on public.followups for each row execute function app.no_hard_delete();
create trigger trg_audit after insert or update on public.followups for each row execute function app.audit();

/* ---------------- rules ---------------- */
create function app.guard_followup() returns trigger language plpgsql as $$
declare sync boolean := coalesce(current_setting('app.fu_sync', true), '') = 'on';
begin
  if sync or auth.uid() is null then return new; end if;
  if not app.has_perm('followups.manage') then raise exception 'Only the Admin can update client follow-ups.'; end if;
  if tg_op = 'INSERT' then raise exception 'Follow-ups are scheduled automatically from completed services.'; end if;
  if (new.client_id, new.slot, new.reference_job_id, new.reference_date, new.due_date, new.months) is distinct from (old.client_id, old.slot, old.reference_job_id, old.reference_date, old.due_date, old.months) then
    raise exception 'Follow-up dates are calculated from the last completed service. Set a custom interval instead.'; end if;
  if new.deleted_at is not null and old.deleted_at is null then raise exception 'Follow-ups cannot be deleted; mark them Not Interested or Snoozed instead.'; end if;
  if old.status = 'Superseded' then raise exception 'This follow-up was replaced by a newer completed service.'; end if;
  if new.status = 'Superseded' then raise exception 'A follow-up is only superseded by a newer completed service.'; end if;
  if new.status = 'Not Interested' and length(trim(coalesce(new.note, ''))) = 0 then raise exception 'Add a short reason the client is not interested.'; end if;
  if new.status = 'Snoozed' and (new.snoozed_until is null or new.snoozed_until <= current_date or new.snoozed_until > current_date + 366) then raise exception 'Choose a snooze date within the next year.'; end if;
  if new.status <> 'Snoozed' then new.snoozed_until := null; end if;
  if new.status <> 'Booked' then new.booked_job_id := null; end if;
  if new.status is distinct from old.status or new.note is distinct from old.note then
    new.actioned_by := auth.uid()::text; new.actioned_at := now();
    new.history := old.history || jsonb_build_object('at', now(), 'by', 'Admin', 'status', new.status, 'note', new.note);
  end if;
  return new;
end $$;
create trigger trg_guard_followup before insert or update on public.followups for each row execute function app.guard_followup();

create function app.guard_followup_rule() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and not app.has_perm('followups.manage') then raise exception 'Only the Admin can set custom follow-up intervals.'; end if;
  return new;
end $$;
create trigger trg_guard_followup_rule before insert or update on public.followup_rules for each row execute function app.guard_followup_rule();

/* ---------------- keeping follow-ups in step with completed services ---------------- */
create function app.sync_followups(p_client text default null) returns void language plpgsql security definer set search_path = public, app as $$
declare c record; l record; d date; s text; m int; due date; rule record; open_states text[] := array['Open','Contacted','Follow-Up Scheduled','Quotation Sent','Snoozed'];
begin
  perform set_config('app.fu_sync', 'on', true);
  for c in select id from public.clients where deleted_at is null and (p_client is null or id = p_client) loop
    -- 1. a booking made after the client was contacted turns the follow-up into Booked
    update public.followups f set status = 'Booked', booked_job_id = b.jid,
           history = f.history || jsonb_build_object('at', now(), 'by', 'System', 'status', 'Booked', 'note', 'Follow-up converted to booking ' || b.jnum)
      from (select distinct on (f2.id) f2.id as fid, j.id as jid, j.number as jnum
              from public.followups f2 join public.jobs j on j.client_id = f2.client_id and j.deleted_at is null and j.origin_job_id is null and j.id <> f2.reference_job_id
                   and j.status not in ('Cancelled','Rescheduled') and j.created_at >= coalesce(f2.actioned_at, f2.updated_at)
             where f2.client_id = c.id and f2.deleted_at is null and f2.status in ('Contacted','Follow-Up Scheduled','Quotation Sent') and f2.booked_job_id is null
             order by f2.id, j.created_at) b
     where f.id = b.fid;
    -- newest completed service
    select * into l from public.jobs where client_id = c.id and deleted_at is null and status in ('Completed','Work Completed','Leaving Site','Arrived at HQ','Closed')
      order by coalesce(completed_at::date, start_at::date) desc, start_at desc, id desc limit 1;
    continue when l.id is null;
    d := coalesce(l.completed_at::date, l.start_at::date);
    -- 2. open follow-ups of an older service are replaced
    update public.followups f set status = 'Superseded', superseded_by_job_id = l.id,
           history = f.history || jsonb_build_object('at', now(), 'by', 'System', 'status', 'Superseded', 'note', 'Follow-up reset: newer service ' || l.number || ' completed')
     where f.client_id = c.id and f.deleted_at is null and f.reference_job_id <> l.id and f.reference_date <= d and f.status = any (open_states);
    -- 3. one follow-up per interval for the newest service: client rule, else service-type rule, else 6 / 12 months
    select r.short_months, r.long_months into rule from public.followup_rules r where r.deleted_at is null and r.client_id = c.id;
    if rule.short_months is null then
      select r.short_months, r.long_months into rule from public.followup_rules r
       where r.deleted_at is null and r.service_code is not null and l.service_codes ? r.service_code order by r.short_months limit 1;
    end if;
    foreach s in array array['short','long'] loop
      m := case when s = 'short' then coalesce(rule.short_months, 6) else coalesce(rule.long_months, 12) end;
      due := (d + make_interval(months => m))::date;
      insert into public.followups (client_id, slot, months, reference_job_id, reference_date, service_codes, due_date, created_by)
        values (c.id, s, m, l.id, d, l.service_codes, due, 'system') on conflict (client_id, slot, reference_job_id) where deleted_at is null do nothing;
      -- 4. open follow-ups follow a changed interval or a corrected completion date
      update public.followups f set due_date = due, months = m, reference_date = d
       where f.client_id = c.id and f.slot = s and f.reference_job_id = l.id and f.deleted_at is null and f.status = 'Open' and (f.due_date <> due or f.months <> m or f.reference_date <> d);
    end loop;
  end loop;
  perform set_config('app.fu_sync', 'off', true);
end $$;

create function app.trg_sync_followups_job() returns trigger language plpgsql as $$
begin perform app.sync_followups(new.client_id); return null; end $$;
create trigger trg_followups_job after insert or update of status, completed_at, deleted_at on public.jobs for each row execute function app.trg_sync_followups_job();
create function app.trg_sync_followups_rule() returns trigger language plpgsql as $$
begin perform app.sync_followups(case when coalesce(new.client_id, old.client_id) is null then null else coalesce(new.client_id, old.client_id) end); return null; end $$;
create trigger trg_followups_rule after insert or update on public.followup_rules for each row execute function app.trg_sync_followups_rule();

/* ---------------- lifetime value (read-only over invoices and payments; verified, cleared money only) ---------------- */
create view public.v_client_lifetime with (security_invoker = true) as
select c.id as client_id, c.name,
       coalesce(b.billed, 0) as lifetime_billed, coalesce(b.collected, 0) as lifetime_collected, coalesce(b.wht, 0) as wht_credited, coalesce(b.outstanding, 0) as outstanding,
       coalesce(j.completed, 0) as completed_services, j.last_service_date, lj.service_codes as last_service_codes,
       nf.due_date as next_follow_up_date, nf.status as next_follow_up_state
from public.clients c
left join lateral (select sum(case when v.status = 'Approved' then v.total end) billed, sum(v.cash_collected) collected, sum(v.wht_credited) wht, sum(v.balance) outstanding
                     from public.v_invoice_balances v where v.client_id = c.id) b on true
left join lateral (select count(*) completed, max(coalesce(x.completed_at::date, x.start_at::date)) last_service_date
                     from public.jobs x where x.client_id = c.id and x.deleted_at is null and x.status in ('Completed','Work Completed','Leaving Site','Arrived at HQ','Closed')) j on true
left join lateral (select y.service_codes from public.jobs y where y.client_id = c.id and y.deleted_at is null and y.status in ('Completed','Work Completed','Leaving Site','Arrived at HQ','Closed')
                    order by coalesce(y.completed_at::date, y.start_at::date) desc, y.start_at desc limit 1) lj on true
left join lateral (select f.due_date, f.status from public.followups f where f.client_id = c.id and f.deleted_at is null and f.status in ('Open','Contacted','Follow-Up Scheduled','Quotation Sent','Snoozed')
                    order by f.due_date limit 1) nf on true
where c.deleted_at is null;

-- Dashboard figures: due this week / month, overdue, converted bookings and the revenue of the linked jobs (billed net, else the agreed contract amount)
create view public.v_followup_dashboard with (security_invoker = true) as
with f as (
  select x.*, coalesce(greatest(x.due_date, x.snoozed_until), x.due_date) as eff,
         -- still waiting on an outcome, and the client has not already booked / declined in this cycle
         (x.status in ('Open','Contacted','Follow-Up Scheduled','Quotation Sent','Snoozed')
          and not exists (select 1 from public.followups g where g.client_id = x.client_id and g.reference_job_id = x.reference_job_id and g.deleted_at is null and g.status in ('Booked','Not Interested'))) as is_open
    from public.followups x where x.deleted_at is null)
select count(*) filter (where is_open and eff between current_date and (date_trunc('week', current_date) + interval '6 days')::date) as due_this_week,
       count(*) filter (where is_open and eff between current_date and (date_trunc('month', current_date) + interval '1 month - 1 day')::date) as due_this_month,
       count(*) filter (where is_open and eff < current_date) as overdue,
       count(*) filter (where status = 'Booked') as converted_to_bookings,
       coalesce(sum(coalesce((select sum(app.invoice_net(i)) from public.invoices i where i.job_id = f.booked_job_id and i.status = 'Approved' and i.deleted_at is null),
                             (select jb.contract_amount from public.jobs jb where jb.id = f.booked_job_id and jb.status <> 'Cancelled'), 0)) filter (where status = 'Booked'), 0) as follow_up_revenue
from f;

alter table public.followups enable row level security;
alter table public.followup_rules enable row level security;
create policy fu_select on public.followups for select using (app.has_perm('clients.view') or app.has_perm('followups.manage'));
create policy fu_update on public.followups for update using (app.has_perm('followups.manage'));
create policy fur_select on public.followup_rules for select using (app.has_perm('clients.view') or app.has_perm('followups.manage'));
create policy fur_insert on public.followup_rules for insert with check (app.has_perm('followups.manage'));
create policy fur_update on public.followup_rules for update using (app.has_perm('followups.manage'));

insert into public.role_permissions (role, permission) values ('owner', 'followups.manage') on conflict do nothing;
