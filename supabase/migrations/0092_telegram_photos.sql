-- Photos and videos sent by the crew to the company Telegram group (or to the bot) are saved to the Photo Library by the telegram-webhook function,
-- filed to the job and client of the person who sent them. This adds who sent it, where it came from, and the Telegram link tables.

alter table public.job_photos add column if not exists source text not null default 'app' check (source in ('app', 'telegram'));
alter table public.job_photos add column if not exists sent_by_employee_id text references public.employees (id);
alter table public.job_photos add column if not exists media text not null default 'photo' check (media in ('photo', 'video'));
alter table public.job_photos add column if not exists tg_unique_id text;     -- Telegram's id for the file: a message delivered twice is saved once
alter table public.job_photos add column if not exists size_bytes bigint;
create unique index if not exists job_photos_tg_unique on public.job_photos (tg_unique_id) where tg_unique_id is not null;
create index if not exists job_photos_unsorted on public.job_photos (created_at desc) where job_id is null and deleted_at is null;
create index if not exists job_photos_sender on public.job_photos (sent_by_employee_id) where deleted_at is null;

-- which Telegram account is which employee (made when the person sends /link CODE to the bot)
create table if not exists public.telegram_links (
  telegram_user_id bigint primary key,
  employee_id text not null references public.employees (id),
  telegram_name text, linked_at timestamptz not null default now()
);
create index if not exists telegram_links_employee on public.telegram_links (employee_id);
-- one-time codes the office makes for an employee (valid 15 minutes)
create table if not exists public.telegram_link_codes (
  code text primary key, employee_id text not null references public.employees (id),
  expires_at timestamptz not null, used_at timestamptz, created_by uuid default auth.uid(), created_at timestamptz not null default now()
);
-- a question waiting for an answer ("which job?"), the photos it covers, and the choices offered
create table if not exists public.telegram_pending (
  id bigint generated always as identity primary key,
  chat_id bigint not null, question_message_id bigint, employee_id text not null,
  photo_ids jsonb not null default '[]', jobs jsonb not null default '[]',
  created_at timestamptz not null default now(), resolved_at timestamptz
);
-- the job someone just chose, so the next photos in the next 30 minutes go to the same job without asking again
create table if not exists public.telegram_context (
  employee_id text primary key, job_id text not null, expires_at timestamptz not null
);
-- stops the "I do not know you yet" reply from repeating on every photo of an album
create table if not exists public.telegram_notice (telegram_user_id bigint primary key, at timestamptz not null default now());

alter table public.telegram_links enable row level security;
alter table public.telegram_link_codes enable row level security;
alter table public.telegram_pending enable row level security;
alter table public.telegram_context enable row level security;
alter table public.telegram_notice enable row level security;
-- the office can see who is linked; everything else is read and written only by the function (service role) and the code function below
create policy tg_links_select on public.telegram_links for select using ((select app.has_perm('admin.settings')) or (select app.has_perm('photos.manage')) or (select app.has_perm('employees.edit')));
create policy tg_links_delete on public.telegram_links for delete using ((select app.has_perm('admin.settings')) or (select app.has_perm('employees.edit')));

-- the office makes a code for an employee; the employee sends it to the bot
create or replace function public.telegram_new_code(p_employee text) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not (app.has_perm('admin.settings') or app.has_perm('employees.edit')) then raise exception 'Only the Owner / Admin can make a Telegram link code.'; end if;
  if not exists (select 1 from public.employees e where e.id = p_employee and e.deleted_at is null) then raise exception 'Employee not found.'; end if;
  loop
    c := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.telegram_link_codes x where x.code = c and x.used_at is null and x.expires_at > now());
  end loop;
  delete from public.telegram_link_codes where employee_id = p_employee and used_at is null;
  insert into public.telegram_link_codes (code, employee_id, expires_at) values (c, p_employee, now() + interval '15 minutes')
    on conflict (code) do update set employee_id = excluded.employee_id, expires_at = excluded.expires_at, used_at = null;
  return c;
end $$;
revoke all on function public.telegram_new_code(text) from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'authenticated') then grant execute on function public.telegram_new_code(text) to authenticated; end if; end $$;

-- the Photo Library may file / move photos of any job, including the ones the bot could not place
create or replace function public.assign_photos(p_ids text[], p_job text) returns int
language plpgsql security definer set search_path = public as $$
declare n int; j public.jobs;
begin
  if not app.has_perm('photos.manage') then raise exception 'Only the office can file photos to a job.'; end if;
  if p_job is not null then select * into j from public.jobs where id = p_job and deleted_at is null; if not found then raise exception 'Job not found.'; end if; end if;
  update public.job_photos set job_id = p_job, client_id = case when p_job is null then client_id else j.client_id end where id = any (p_ids) and deleted_at is null;
  get diagnostics n = row_count; return n;
end $$;
revoke all on function public.assign_photos(text[], text) from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'authenticated') then grant execute on function public.assign_photos(text[], text) to authenticated; end if; end $$;
