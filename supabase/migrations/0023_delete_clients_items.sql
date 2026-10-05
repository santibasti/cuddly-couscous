-- Deleting clients and inventory items (a soft delete: the row stays in the Recycle bin and can be restored).
-- Only the Owner / Admin may do it, and never for a client that has billing, payments or started / completed service, or an item with stock movements.
insert into public.role_permissions (role, permission) values ('owner', 'clients.delete'), ('owner', 'inventory.delete') on conflict do nothing;

create function app.guard_soft_delete() returns trigger language plpgsql as $$
begin
  if new.deleted_at is not null and old.deleted_at is null and auth.uid() is not null then
    if tg_table_name = 'clients' then
      if not app.has_perm('clients.delete') then raise exception 'Only the Owner / Admin can delete clients.'; end if;
      if exists (select 1 from public.invoices i where i.client_id = old.id and i.deleted_at is null and i.status <> 'Draft')
         or exists (select 1 from public.payments p where p.client_id = old.id and p.deleted_at is null)
         or exists (select 1 from public.jobs j where j.client_id = old.id and j.deleted_at is null and j.status not in ('Pending','Confirmed','Cancelled','Rescheduled')) then
        raise exception 'This client has billing, payments or started / completed service. Set the client to Inactive instead.';
      end if;
    elsif tg_table_name = 'items' then
      if not app.has_perm('inventory.delete') then raise exception 'Only the Owner / Admin can delete inventory items.'; end if;
      if exists (select 1 from public.stock s where s.item_id = old.id and s.deleted_at is null and s.type <> 'Opening') then
        raise exception 'This item has stock movements. Keep it for the record and adjust its stock to zero instead.';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger trg_guard_soft_delete_clients before update on public.clients for each row execute function app.guard_soft_delete();
create trigger trg_guard_soft_delete_items before update on public.items for each row execute function app.guard_soft_delete();
