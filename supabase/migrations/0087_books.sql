-- Bookkeeping: the bookkeeper's opening balances and adjusting entries (owner investments / drawings, depreciation, corrections).
-- Everything else in the books is worked out from the company's own invoices, payments and expenses; nothing there is stored twice.
-- reports.finance reads; books.manage (Finance staff and Owner) writes.
create table public.book_entries (
  like app.base_columns including all,
  entry_date date not null,
  ref text not null default '',
  memo text not null default '',
  kind text not null default 'manual' check (kind in ('manual','opening')),
  lines jsonb not null default '[]'                    -- [{ account, debit, credit }]; debits must equal credits
);
create index on public.book_entries (entry_date) where deleted_at is null;
alter table public.book_entries enable row level security;
create policy be_select on public.book_entries for select using ((select app.has_perm('reports.finance')) or (select app.has_perm('books.manage')));
create policy be_insert on public.book_entries for insert with check ((select app.has_perm('books.manage')));
create policy be_update on public.book_entries for update using ((select app.has_perm('books.manage')));

create or replace function app.guard_book_entry() returns trigger language plpgsql as $$
declare d numeric; c numeric;
begin
  select coalesce(sum((l->>'debit')::numeric), 0), coalesce(sum((l->>'credit')::numeric), 0) into d, c from jsonb_array_elements(new.lines) l;
  if abs(d - c) > 0.005 then raise exception 'Debits (%) and credits (%) of a journal entry must be equal.', d, c; end if;
  return new;
end $$;
create trigger trg_guard_book_entry before insert or update on public.book_entries for each row execute function app.guard_book_entry();
create trigger trg_touch before update on public.book_entries for each row execute function app.touch();
create trigger trg_no_delete before delete on public.book_entries for each row execute function app.no_hard_delete();
create trigger trg_audit after insert or update on public.book_entries for each row execute function app.audit();

insert into public.role_permissions (role, permission) values ('finance', 'books.manage') on conflict do nothing;
