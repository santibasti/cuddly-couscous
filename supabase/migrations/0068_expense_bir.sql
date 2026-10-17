-- BIR compliance: the supplier details a Summary List of Purchases needs, kept on each expense.
alter table public.expenses
  add column supplier_name text, add column supplier_tin text, add column supplier_address text,
  add column supplier_vat text check (supplier_vat in ('VAT','Non-VAT','Zero-rated','Exempt')),
  add column supplier_invoice_no text,
  add column purchase_kind text check (purchase_kind in ('Goods','Services','Capital goods'));
