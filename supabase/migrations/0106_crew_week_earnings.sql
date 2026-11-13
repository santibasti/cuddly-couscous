-- What each crew member has earned so far this pay week (Sunday to Saturday): the rate, the bonus and the total for each day. Nothing else: no prices, no other people.
-- Payroll people (whoever has the app open with payroll access) keep it up to date; a crew member can read ONLY their own row.
create table if not exists public.crew_week_earnings (
  employee_id text not null references public.employees (id),
  week_start date not null,
  days jsonb not null default '[]',
  rate numeric(12,2) not null default 0, bonus numeric(12,2) not null default 0, total numeric(12,2) not null default 0,
  estimate boolean not null default false, notes jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  primary key (employee_id, week_start)
);
alter table public.crew_week_earnings enable row level security;
create policy cwe_select on public.crew_week_earnings for select using (employee_id = (select app.my_employee()) or (select app.has_perm('payroll.view')));
create policy cwe_insert on public.crew_week_earnings for insert with check ((select app.has_perm('payroll.edit')));
create policy cwe_update on public.crew_week_earnings for update using ((select app.has_perm('payroll.edit'))) with check ((select app.has_perm('payroll.edit')));
create policy cwe_delete on public.crew_week_earnings for delete using ((select app.has_perm('payroll.edit')));
