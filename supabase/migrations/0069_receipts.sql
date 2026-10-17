-- Scanned receipts: a person photographs an official receipt / invoice, the AI reads the details BIR filing needs, and the scan is kept.
-- Whoever has receipts.capture sees and edits their own scans; receipts.manage sees all, posts them as expenses and deletes.
create table public.receipts (
  like app.base_columns including all,
  receipt_date date, doc_type text, receipt_no text,
  supplier_name text, supplier_tin text, supplier_address text,
  supplier_vat text check (supplier_vat in ('VAT','Non-VAT','Zero-rated','Exempt')),
  total_amount numeric(14,2), vatable_sales numeric(14,2), vat_amount numeric(14,2), exempt_amount numeric(14,2), zero_rated_amount numeric(14,2),
  payment_method text, category text, job_id text, description text, notes text,
  image_path text,                                        -- inside the private 'receipts' bucket
  ocr jsonb,                                              -- what the AI read, with the fields it was unsure about
  status text not null default 'Captured' check (status in ('Captured','Posted')),
  expense_id text
);
create index on public.receipts (receipt_date) where deleted_at is null;
alter table public.receipts enable row level security;
create policy rc_select on public.receipts for select using (app.has_perm('receipts.manage') or (app.has_perm('receipts.capture') and created_by = auth.uid()::text));
create policy rc_insert on public.receipts for insert with check (app.has_perm('receipts.manage') or app.has_perm('receipts.capture'));
create policy rc_update on public.receipts for update using (app.has_perm('receipts.manage') or (app.has_perm('receipts.capture') and created_by = auth.uid()::text and status = 'Captured'));
create trigger trg_touch before update on public.receipts for each row execute function app.touch();
create trigger trg_no_delete before delete on public.receipts for each row execute function app.no_hard_delete();
create trigger trg_audit after insert or update on public.receipts for each row execute function app.audit();

create or replace function public.can_capture_receipts() returns boolean language sql stable security definer set search_path = public as $$ select app.has_perm('receipts.capture') or app.has_perm('receipts.manage') $$;
revoke all on function public.can_capture_receipts() from public;
do $$ begin if exists (select 1 from pg_roles where rolname = 'authenticated') then grant execute on function public.can_capture_receipts() to authenticated; end if; end $$;

-- Scan files: the 'receipts' bucket already exists; let the people who scan add and read their scans.
do $$ begin
  insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false) on conflict (id) do nothing;
  create policy receipts_scan_read on storage.objects for select to authenticated using (bucket_id = 'receipts' and (app.has_perm('receipts.manage') or app.has_perm('receipts.capture')));
  create policy receipts_scan_add on storage.objects for insert to authenticated with check (bucket_id = 'receipts' and (app.has_perm('receipts.manage') or app.has_perm('receipts.capture')));
exception when others then
  raise notice 'Could not set up the receipts bucket policies automatically: %', sqlerrm;
end $$;
