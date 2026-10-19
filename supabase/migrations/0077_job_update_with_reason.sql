-- A status override or a restart moves a job "backwards", which the job-status rule only allows with a reason (Operations / Owner).
-- The app sends the change and the reason together, so the rule sees the reason in the same transaction.
create or replace function public.update_job_with_reason(p_id text, p_patch jsonb, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare cols text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not app.has_perm('dispatch.approve') then raise exception 'Only an Operations Manager or Admin can override a job status.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required for this change.'; end if;
  perform set_config('app.change_reason', trim(p_reason), true);
  select string_agg(format('%I = n.%I', k, k), ', ') into cols
    from jsonb_object_keys(p_patch) k
   where k not in ('id', 'created_at', 'created_by', 'updated_at', 'updated_by');
  if cols is null then return; end if;
  execute 'update public.jobs j set ' || cols || ' from (select (jsonb_populate_record(null::public.jobs, to_jsonb(j2) || $1)).* from public.jobs j2 where j2.id = $2) n where j.id = $2'
    using p_patch, p_id;
  if not found then raise exception 'Job not found.'; end if;
end $$;
revoke all on function public.update_job_with_reason(text, jsonb, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.update_job_with_reason(text, jsonb, text) to authenticated;
  end if;
end $$;
