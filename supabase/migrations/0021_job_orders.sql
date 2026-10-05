-- Job Order Confirmation: the client-facing document that confirms a scheduled service (not an invoice, receipt or quotation).
--   Created as a Draft when a booking is confirmed; Admin / Operations review it and mark it Sent to Client.
--   A sent Job Order is never edited: if the schedule, approved scope, final price or team changes, a revised version (same number, next version) is created
--   and the sent one is marked Superseded. The share link shows only the client-facing content of a sent / superseded version.

create table public.job_orders (
  like app.base_columns including all,
  number text not null, version integer not null check (version >= 1),
  job_id text not null references public.jobs (id), quotation_id text, client_id text not null references public.clients (id),
  status text not null default 'Draft' check (status in ('Draft','Sent to Client','Revised','Superseded')),
  issued_on date not null default current_date,
  content jsonb not null, content_key text not null,
  sent_at timestamptz, sent_by text, sent_via text, last_sent_at timestamptz, sent_count integer not null default 0,
  supersedes_id text, superseded_by_id text, revision_reason text,
  share_token text not null unique,
  history jsonb not null default '[]',
  unique (number, version), unique (job_id, version)
);
create index on public.job_orders (job_id) where deleted_at is null;

create trigger trg_touch before update on public.job_orders for each row execute function app.touch();
create trigger trg_no_delete before delete on public.job_orders for each row execute function app.no_hard_delete();
create trigger trg_audit after insert or update on public.job_orders for each row execute function app.audit();

create function app.guard_job_order() returns trigger language plpgsql as $$
declare free text[] := array['status','superseded_by_id','history','last_sent_at','sent_count','updated_at','updated_by'];
begin
  if auth.uid() is not null and not app.has_perm('joborders.manage') then raise exception 'Only Admin / Operations can change a Job Order.'; end if;
  if tg_op = 'INSERT' then
    if new.status not in ('Draft','Revised') then raise exception 'A new Job Order starts as a Draft (or a Revised version).'; end if;
    return new;
  end if;
  if new.deleted_at is not null and old.deleted_at is null then raise exception 'A Job Order cannot be deleted; a changed booking creates a revised version.'; end if;
  if old.status in ('Sent to Client','Superseded') then
    -- a sent Job Order is a record of what the client was told
    if to_jsonb(new) - free <> to_jsonb(old) - free then raise exception 'A Job Order that was sent to the client cannot be edited. A revised version is created when the booking changes.'; end if;
    if old.status = 'Superseded' and new.status <> 'Superseded' then raise exception 'A superseded Job Order cannot be reopened.'; end if;
    if old.status = 'Sent to Client' and new.status not in ('Sent to Client','Superseded') then raise exception 'A sent Job Order can only be superseded by a newer version.'; end if;
    return new;
  end if;
  -- Draft / Revised: may follow the booking, or be sent
  if new.status not in (old.status, 'Sent to Client') then raise exception 'A Draft can only be marked as sent to the client.'; end if;
  if new.status = 'Sent to Client' then
    if (new.content ->> 'blocker') is not null then raise exception '%', new.content ->> 'blocker'; end if;
    if exists (select 1 from public.job_orders x where x.job_id = new.job_id and x.version > new.version and x.deleted_at is null) then raise exception 'Only the latest version can be sent.'; end if;
    new.sent_at := coalesce(new.sent_at, now()); new.last_sent_at := coalesce(new.last_sent_at, new.sent_at);
  end if;
  return new;
end $$;
create trigger trg_guard_job_order before insert or update on public.job_orders for each row execute function app.guard_job_order();

alter table public.job_orders enable row level security;
create policy jo_select on public.job_orders for select using (
  app.has_perm('joborders.manage') or app.has_perm('jobs.all')
  or (app.has_perm('dispatch.view') and exists (select 1 from public.jobs j where j.id = job_orders.job_id and (j.leader_id = app.my_employee() or j.crew_ids ? app.my_employee()))));
create policy jo_insert on public.job_orders for insert with check (app.has_perm('joborders.manage'));
create policy jo_update on public.job_orders for update using (app.has_perm('joborders.manage'));

-- the share link: no sign-in, one document, client-facing content only (never a Draft)
create function public.get_job_order_public(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('number', number, 'version', version, 'status', status, 'issued_on', issued_on, 'content', content)
    from public.job_orders where share_token = p_token and status in ('Sent to Client','Superseded') and deleted_at is null $$;
revoke all on function public.get_job_order_public(text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then grant execute on function public.get_job_order_public(text) to anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then grant execute on function public.get_job_order_public(text) to authenticated; end if;
end $$;

-- document numbers: add JO
create or replace function public.next_numbers(p_kind text, p_n integer default 1) returns integer[]
language plpgsql security definer set search_path = public as $$
declare cur integer; res integer[];
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_kind not in ('QT','JOB','INV','OR','EMP','INC','DR','BJ','OV','JO') then raise exception 'Unknown document number type %', p_kind; end if;
  if p_n < 1 or p_n > 50 then raise exception 'Ask for 1 to 50 numbers at a time.'; end if;
  select coalesce((data -> 'counters' ->> p_kind)::integer, 0) into cur from public.settings where id = 'main' for update;
  if not found then raise exception 'Company settings have not been loaded (settings row missing).'; end if;
  update public.settings
     set data = jsonb_set(data, '{counters}', coalesce(data -> 'counters', '{}'::jsonb) || jsonb_build_object(p_kind, cur + p_n)), updated_at = now(), updated_by = auth.uid()::text
   where id = 'main';
  select array_agg(g order by g) into res from generate_series(cur + 1, cur + p_n) g;
  return res;
end $$;

insert into public.role_permissions (role, permission) values ('owner', 'joborders.manage'), ('ops', 'joborders.manage') on conflict do nothing;
