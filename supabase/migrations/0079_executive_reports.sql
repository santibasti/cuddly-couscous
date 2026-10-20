-- Executive tab: saved AI analysis reports (owner only). The figures are computed by the app from the company's own records;
-- the AI writes the analysis and, optionally, a separate outside-research section. Only totals and trends are sent to the AI.
create table public.executive_reports (
  like app.base_columns including all,
  as_of date not null,
  with_research boolean not null default false,
  model text,
  metrics jsonb not null,
  analysis jsonb,
  research jsonb
);
create index on public.executive_reports (as_of desc) where deleted_at is null;
alter table public.executive_reports enable row level security;
create policy exr_select on public.executive_reports for select using (app.has_perm('executive.view'));
create policy exr_insert on public.executive_reports for insert with check (app.has_perm('executive.view'));
create policy exr_update on public.executive_reports for update using (app.has_perm('executive.view'));
create trigger trg_touch before update on public.executive_reports for each row execute function app.touch();
create trigger trg_no_delete before delete on public.executive_reports for each row execute function app.no_hard_delete();
create trigger trg_audit after insert or update on public.executive_reports for each row execute function app.audit();

create or replace function public.can_view_executive() returns boolean language sql stable security definer set search_path = public as $$ select app.has_perm('executive.view') $$;
revoke all on function public.can_view_executive() from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'authenticated') then grant execute on function public.can_view_executive() to authenticated; end if; end $$;
