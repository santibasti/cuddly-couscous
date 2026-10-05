-- The 7-step job workflow writes to several tables as the person running it (HQ prep releases equipment and stock, check-in records
-- attendance, close-out returns equipment …). The row-level-security policies written earlier only covered each table's "owner" role,
-- which blocked those steps ("new row violates row-level security policy"). People who may run the workflow (dispatch.run) or
-- approve equipment / inventory now get the access those steps need; every business rule is still enforced by the guard triggers.

drop policy if exists co_select on public.checkouts;
drop policy if exists co_insert on public.checkouts;
drop policy if exists co_update on public.checkouts;
create policy co_select on public.checkouts for select using (app.has_perm('assets.view') or app.has_perm('dispatch.view') or requested_by = app.my_employee() or responsible_id = app.my_employee());
create policy co_insert on public.checkouts for insert with check (app.has_perm('assets.approve') or app.has_perm('dispatch.run') or (app.has_perm('assets.request') and status = 'Requested'));
create policy co_update on public.checkouts for update using (app.has_perm('assets.approve') or app.has_perm('dispatch.run') or (app.has_perm('assets.request') and (responsible_id = app.my_employee() or requested_by = app.my_employee())));

-- equipment status ("In Use" / "Available" / "Damaged") and repair tickets change as the crew picks up and returns equipment
drop policy if exists assets_update on public.assets; drop policy if exists assets_insert on public.assets;
create policy assets_insert on public.assets for insert with check (app.has_perm('assets.edit'));
create policy assets_update on public.assets for update using (app.has_perm('assets.edit') or app.has_perm('dispatch.run'));
drop policy if exists tickets_update on public.tickets; drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets for insert with check (app.has_perm('assets.edit') or app.has_perm('dispatch.run'));
create policy tickets_update on public.tickets for update using (app.has_perm('assets.edit') or app.has_perm('dispatch.run'));
-- materials issued to the job at HQ prep, returned at close-out
drop policy if exists stock_insert on public.stock;
create policy stock_insert on public.stock for insert with check (app.has_perm('inventory.edit') or app.has_perm('inventory.approve') or app.has_perm('dispatch.run'));

-- a Team Leader / crew member sees the quotation behind a job they are assigned to (and the one from their ocular visit), even without general sales access
create policy quotations_assigned_select on public.quotations for select using (
  ocular_assignee_id = app.my_employee()
  or exists (select 1 from public.jobs j where j.quotation_id = quotations.id and (j.leader_id = app.my_employee() or j.crew_ids ? app.my_employee())));

-- the Team Leader running the job prep (dispatch.run) releases the equipment to the crew; return and damage rules are unchanged
create or replace function app.guard_checkout() returns trigger language plpgsql as $$
begin
  if old.status = 'Returned' or old.status = 'Rejected' then raise exception 'Completed out/in records are locked.'; end if;
  if new.status = 'Released' and old.status <> 'Released' then
    if not (app.has_perm('assets.approve') or app.has_perm('dispatch.run') or auth.uid() is null) then raise exception 'Not permitted to release equipment.'; end if;
    if exists (select 1 from public.assets a where a.id = new.asset_id and a.status in ('Retired','Damaged','Under Maintenance')) then raise exception 'This asset is not serviceable.'; end if;
    new.out_at := coalesce(new.out_at, now() at time zone 'Asia/Manila'); new.approved_by := coalesce(auth.uid()::text, new.approved_by);
  end if;
  if new.status = 'Returned' then
    if new.in_meter is not null and new.out_meter is not null and new.in_meter < new.out_meter then raise exception 'Return meter reading cannot be lower than at release.'; end if;
    new.in_at := coalesce(new.in_at, now() at time zone 'Asia/Manila');
  end if;
  return new;
end $$;

-- a Back Job and its follow-up job point at each other; the app saves them one after the other, so the link from the job back to the case is not enforced as a foreign key
alter table public.jobs drop constraint if exists jobs_back_job_fk;
