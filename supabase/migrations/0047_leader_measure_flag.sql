-- The assigned Team Leader may mark a quotation line "Bill by site measurement" (before work starts) — nothing else on the quotation.
create policy quotations_leader_measure on public.quotations for update
  using (app.has_perm('dispatch.run') and exists (select 1 from public.jobs j where j.quotation_id = quotations.id and j.deleted_at is null and (j.leader_id = app.my_employee() or j.crew_ids ? app.my_employee())
         and not exists (select 1 from public.workflows w where w.job_id = j.id and w.deleted_at is null and (w.start_at is not null or w.conf_at is not null))))
  with check (app.has_perm('dispatch.run'));

create or replace function app.guard_leader_quote_edit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if app.has_perm('dispatch.run') and not app.has_perm('sales.edit') and app.my_employee() is not null then
    if (to_jsonb(new) - 'items' - 'updated_at' - 'updated_by') is distinct from (to_jsonb(old) - 'items' - 'updated_at' - 'updated_by')
       or coalesce((select jsonb_agg(i - 'measure') from jsonb_array_elements(new.items) i), '[]'::jsonb) is distinct from coalesce((select jsonb_agg(i - 'measure') from jsonb_array_elements(old.items) i), '[]'::jsonb) then
      raise exception 'A Team Leader can only change how a quotation line is billed (site measurement).' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_leader_quote_edit before update on public.quotations for each row execute function app.guard_leader_quote_edit();
