-- Service reports (Service Accomplishment Report) tagged to a booking, with photos taken from the photo library.
create table public.service_reports (
  like app.base_columns including all,
  number text not null unique,
  job_id text not null references public.jobs (id), client_id text not null references public.clients (id),
  title text not null default '', location text not null default '', team text not null default '',
  service_date date, report_date date not null default current_date, frequency text not null default 'One-time',
  service_codes jsonb not null default '[]', sections jsonb not null default '[]', photos jsonb not null default '[]',
  prepared_by text, status text not null default 'Draft' check (status in ('Draft', 'Final')), finalized_at timestamptz
);
create index on public.service_reports (job_id) where deleted_at is null;
alter table public.service_reports enable row level security;
create policy sr_select on public.service_reports for select using (app.photo_job_ok(job_id));
create policy sr_insert on public.service_reports for insert with check (app.photo_job_ok(job_id));
create policy sr_update on public.service_reports for update using (app.photo_job_ok(job_id));
create trigger trg_touch before update on public.service_reports for each row execute function app.touch();
create trigger trg_no_delete before delete on public.service_reports for each row execute function app.no_hard_delete();
create trigger trg_audit after insert or update on public.service_reports for each row execute function app.audit();

create or replace function public.next_numbers(p_kind text, p_n integer default 1) returns integer[]
language plpgsql security definer set search_path = public as $$
declare cur integer; res integer[];
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_kind not in ('QT','JOB','INV','OR','EMP','INC','DR','BJ','OV','JO','MT','SR') then raise exception 'Unknown document number type %', p_kind; end if;
  if p_n < 1 or p_n > 50 then raise exception 'Ask for 1 to 50 numbers at a time.'; end if;
  select coalesce((data -> 'counters' ->> p_kind)::integer, 0) into cur from public.settings where id = 'main' for update;
  if not found then raise exception 'Company settings have not been loaded (settings row missing).'; end if;
  update public.settings
     set data = jsonb_set(data, '{counters}', coalesce(data -> 'counters', '{}'::jsonb) || jsonb_build_object(p_kind, cur + p_n)), updated_at = now(), updated_by = auth.uid()::text
   where id = 'main';
  select array_agg(g order by g) into res from generate_series(cur + 1, cur + p_n) g;
  return res;
end $$;
