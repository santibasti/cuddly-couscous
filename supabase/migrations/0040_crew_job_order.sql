-- Crew (assigned, not Team Leaders) see the Job Order without prices.
-- Team Leaders / Operations / Owner keep reading the whole record; crew no longer read the table at all and get a stripped copy from crew_job_order().
drop policy if exists jo_select on public.job_orders;
create policy jo_select on public.job_orders for select using (
  app.has_perm('joborders.manage') or app.has_perm('jobs.all')
  or (app.has_perm('dispatch.run') and exists (select 1 from public.jobs j where j.id = job_orders.job_id and (j.leader_id = app.my_employee() or j.crew_ids ? app.my_employee()))));

-- the latest SENT Job Order of a job the caller is assigned to, with every price, total and payment term removed
create or replace function public.crew_job_order(p_job text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me text := app.my_employee(); r public.job_orders%rowtype;
begin
  if me is null or not app.has_perm('dispatch.view') then return null; end if;
  if not exists (select 1 from public.jobs j where j.id = p_job and j.deleted_at is null and (j.leader_id = me or j.crew_ids ? me)) then return null; end if;
  select * into r from public.job_orders where job_id = p_job and deleted_at is null and status = 'Sent to Client' order by version desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object('id', r.id, 'number', r.number, 'version', r.version, 'status', r.status, 'issued_on', r.issued_on, 'job_id', r.job_id,
    'content', r.content - 'items' - 'additions' - 'discounts' - 'subtotal' - 'vat_label' - 'vat' - 'total' - 'payment_terms' - 'payment_status');
end $$;
revoke all on function public.crew_job_order(text) from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'authenticated') then grant execute on function public.crew_job_order(text) to authenticated; end if; end $$;
