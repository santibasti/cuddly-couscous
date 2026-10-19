-- Correcting a workflow with a reason (Operations / Owner): the app sends the change and the reason in one call, so the database
-- guard (app.guard_workflow) sees the reason in the same transaction and allows steps to be cleared (e.g. restarting a job from Job Prep).
create or replace function public.update_workflow_with_reason(p_id text, p_patch jsonb, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare cols text;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if not app.has_perm('incidents.manage') then raise exception 'Only an Operations Manager or Admin can correct a workflow record.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required for this change.'; end if;
  perform set_config('app.change_reason', trim(p_reason), true);
  select string_agg(format('%I = n.%I', k, k), ', ') into cols
    from jsonb_object_keys(p_patch) k
   where k not in ('id', 'created_at', 'created_by', 'updated_at', 'updated_by');
  if cols is null then return; end if;
  execute 'update public.workflows w set ' || cols || ' from (select (jsonb_populate_record(null::public.workflows, to_jsonb(w2) || $1)).* from public.workflows w2 where w2.id = $2) n where w.id = $2'
    using p_patch, p_id;
  if not found then raise exception 'Workflow record not found.'; end if;
end $$;
revoke all on function public.update_workflow_with_reason(text, jsonb, text) from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.update_workflow_with_reason(text, jsonb, text) to authenticated;
  end if;
end $$;
