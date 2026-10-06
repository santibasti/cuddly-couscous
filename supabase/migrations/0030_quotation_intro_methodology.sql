-- Quotation: introduction letter and cleaning-system methodology (editable per quotation; company defaults are kept in the settings).
alter table public.quotations add column if not exists intro text, add column if not exists methodology text;
