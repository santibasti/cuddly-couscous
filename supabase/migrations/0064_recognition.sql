-- Crew recognition: stored badge data on each employee, boards every signed-in account can read (through functions, because a crew
-- login can read only its own rows), the client praise wall, the crew-versus-crew board and the monthly announcement record.
alter table public.employees add column recog jsonb;       -- { month, prev, delta, streak, perfect, docs } kept up to date by Admin / HR sessions

create or replace function public.recognition_board() returns jsonb
language sql stable security definer set search_path = public as $$
  with a as (select id, full_name, "position", avatar, rating, recog from public.employees where deleted_at is null and status <> 'inactive' and auth.uid() is not null)
  select jsonb_build_object(
    'top',      coalesce((select jsonb_agg(to_jsonb(x)) from (select * from a where rating is not null order by rating desc, full_name limit 3) x), '[]'::jsonb),
    'improved', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from a where (recog ->> 'delta')::numeric >= 0.1 order by (recog ->> 'delta')::numeric desc, full_name limit 3) x), '[]'::jsonb),
    'streaks',  coalesce((select jsonb_agg(to_jsonb(x)) from (select * from a where (recog ->> 'streak')::int >= 5 order by (recog ->> 'streak')::int desc, full_name limit 6) x), '[]'::jsonb),
    'perfect',  coalesce((select jsonb_agg(to_jsonb(x)) from (select * from a where (recog ->> 'perfect')::boolean order by full_name limit 12) x), '[]'::jsonb))
$$;
revoke all on function public.recognition_board() from public;

create or replace function public.praise_wall(p_n integer default 8)
returns table (id text, praise text, crew text, service text, service_date date, submitted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select f.id, left(trim(f.comment), 280),
         (select string_agg(split_part(e.full_name, ' ', 1), ', ') from public.employees e where e.id = f.leader_id or f.crew_ids ? e.id),
         (select string_agg(s.name, ', ') from public.services s where f.service_codes ? s.code),
         f.service_date, f.submitted_at
    from public.client_feedback f
   where f.deleted_at is null and f.rating = 3 and coalesce(trim(f.comment), '') <> '' and auth.uid() is not null
   order by f.submitted_at desc
   limit greatest(1, least(coalesce(p_n, 8), 30))
$$;
revoke all on function public.praise_wall(integer) from public;

-- crew-versus-crew: a crew is its Team Leader's jobs for the month. Points: 5 per finished job, 5 per Very Satisfied client, 3 per signed service report, minus 10 per back job.
create or replace function public.team_board(p_month text default null)
returns table (leader_id text, leader_name text, avatar text, jobs integer, happy integer, reports integer, backjobs integer, score integer)
language sql stable security definer set search_path = public as $$
  with m as (select coalesce(p_month, to_char(now() at time zone 'Asia/Manila', 'YYYY-MM')) as mo),
  j as (select jb.id, jb.leader_id from public.jobs jb, m
         where jb.deleted_at is null and jb.leader_id is not null and jb.status in ('Work Completed', 'Leaving Site', 'Arrived at HQ', 'Closed') and to_char(jb.completed_at, 'YYYY-MM') = m.mo),
  agg as (select j.leader_id as lid,
                 count(*)::int as n_jobs,
                 (count(*) filter (where exists (select 1 from public.client_feedback f where f.job_id = j.id and f.deleted_at is null and f.rating = 3)))::int as n_happy,
                 (count(*) filter (where exists (select 1 from public.service_reports r where r.job_id = j.id and r.deleted_at is null and r.signature is not null)))::int as n_reports,
                 (select count(*) from public.back_jobs b, m where b.deleted_at is null and b.origin_leader_id = j.leader_id and to_char(b.created_at, 'YYYY-MM') = m.mo)::int as n_back
            from j group by j.leader_id)
  select a.lid, e.full_name, e.avatar, a.n_jobs, a.n_happy, a.n_reports, a.n_back, greatest(0, a.n_jobs * 5 + a.n_happy * 5 + a.n_reports * 3 - a.n_back * 10)::int
    from agg a join public.employees e on e.id = a.lid
   where auth.uid() is not null
   order by 8 desc, e.full_name
$$;
revoke all on function public.team_board(text) from public;

create table public.recognitions (
  id text primary key default gen_random_uuid()::text,
  month text not null unique,                                   -- YYYY-MM the awards are for
  awards jsonb not null default '[]',                           -- [{ kind, employee_id, name, avatar?, reward, note }]
  announced_at timestamptz not null default now(), announced_by uuid default auth.uid()
);
alter table public.recognitions enable row level security;
create policy rec_select on public.recognitions for select using (auth.uid() is not null);
create policy rec_insert on public.recognitions for insert with check (app.has_perm('performance.edit'));
create policy rec_update on public.recognitions for update using (app.has_perm('performance.edit'));
create trigger trg_no_delete before delete on public.recognitions for each row execute function app.no_hard_delete();

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.recognition_board() to authenticated;
    grant execute on function public.praise_wall(integer) to authenticated;
    grant execute on function public.team_board(text) to authenticated;
  end if;
end $$;
