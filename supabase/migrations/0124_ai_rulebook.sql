-- The AI customer-service rulebook as versioned data (Admin → AI Rulebook). Versions are kept; only one is published, at most one is a draft.
-- A draft can be edited and tested; a version can be published only after its tests passed (recorded here); an old version can be restored as a new draft (rollback).
-- All changes go through the functions below (Owner / Admin only: permission admin.settings); nobody edits a published or archived version.
create table if not exists public.ai_rulebook (
  id bigint generated always as identity primary key,
  version integer not null unique,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  title text not null default 'TopMop AI Customer Service Rulebook',
  change_note text,
  sections jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array' and pg_column_size(sections) < 400000),
  tests_passed_at timestamptz, tests_summary jsonb,
  created_at timestamptz not null default now(), created_by text default auth.uid()::text,
  published_at timestamptz, published_by text
);
create unique index if not exists ai_rulebook_one_published on public.ai_rulebook (status) where status = 'published';
create unique index if not exists ai_rulebook_one_draft on public.ai_rulebook (status) where status = 'draft';
alter table public.ai_rulebook enable row level security;
drop policy if exists ai_rulebook_read on public.ai_rulebook;
create policy ai_rulebook_read on public.ai_rulebook for select using (app.has_perm('admin.settings'));
revoke all on public.ai_rulebook from anon, authenticated;
grant select on public.ai_rulebook to authenticated;

create or replace function public.rulebook_save_draft(p_sections jsonb, p_title text default null, p_note text default null) returns bigint language plpgsql security definer set search_path = public as $$
declare d public.ai_rulebook; nv int; rid bigint;
begin
  if not app.has_perm('admin.settings') then raise exception 'Only the Owner / Admin can change the rulebook.'; end if;
  if p_sections is null or jsonb_typeof(p_sections) <> 'array' or jsonb_array_length(p_sections) = 0 then raise exception 'The rulebook needs at least one section.'; end if;
  select * into d from public.ai_rulebook where status = 'draft';
  if found then
    update public.ai_rulebook set sections = p_sections, title = coalesce(nullif(p_title, ''), title), change_note = p_note, tests_passed_at = null, tests_summary = null where id = d.id returning id into rid;
  else
    select coalesce(max(version), 0) + 1 into nv from public.ai_rulebook;
    insert into public.ai_rulebook (version, status, title, change_note, sections) values (nv, 'draft', coalesce(nullif(p_title, ''), 'TopMop AI Customer Service Rulebook'), p_note, p_sections) returning id into rid;
  end if;
  return rid;
end $$;

create or replace function public.rulebook_tests_passed(p_id bigint, p_summary jsonb default null) returns void language plpgsql security definer set search_path = public as $$
begin
  if not app.has_perm('admin.settings') then raise exception 'Only the Owner / Admin can change the rulebook.'; end if;
  update public.ai_rulebook set tests_passed_at = now(), tests_summary = p_summary where id = p_id and status = 'draft';
  if not found then raise exception 'Only the draft can be tested.'; end if;
end $$;

create or replace function public.rulebook_publish(p_id bigint) returns void language plpgsql security definer set search_path = public as $$
declare d public.ai_rulebook;
begin
  if not app.has_perm('admin.settings') then raise exception 'Only the Owner / Admin can change the rulebook.'; end if;
  select * into d from public.ai_rulebook where id = p_id for update;
  if not found or d.status <> 'draft' then raise exception 'Only the draft can be published.'; end if;
  if d.tests_passed_at is null then raise exception 'Run the tests on this draft first: it can be published only after they pass.'; end if;
  update public.ai_rulebook set status = 'archived' where status = 'published';
  update public.ai_rulebook set status = 'published', published_at = now(), published_by = auth.uid()::text where id = p_id;
end $$;

-- rollback: any version (also an old one) becomes the new draft, to be tested and published again; the history is never rewritten
create or replace function public.rulebook_restore(p_id bigint) returns bigint language plpgsql security definer set search_path = public as $$
declare s public.ai_rulebook; rid bigint;
begin
  if not app.has_perm('admin.settings') then raise exception 'Only the Owner / Admin can change the rulebook.'; end if;
  select * into s from public.ai_rulebook where id = p_id; if not found then raise exception 'That version does not exist.'; end if;
  select public.rulebook_save_draft(s.sections, s.title, 'Restored from version ' || s.version) into rid;
  return rid;
end $$;
revoke all on function public.rulebook_save_draft(jsonb, text, text), public.rulebook_tests_passed(bigint, jsonb), public.rulebook_publish(bigint), public.rulebook_restore(bigint) from public, anon;
grant execute on function public.rulebook_save_draft(jsonb, text, text), public.rulebook_tests_passed(bigint, jsonb), public.rulebook_publish(bigint), public.rulebook_restore(bigint) to authenticated;
