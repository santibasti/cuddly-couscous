-- Receipts: the person who scans confirms the details before saving; the office decides, once the receipt is posted, whether it is used for BIR filing.
alter table public.receipts add column bir_use boolean, add column confirmed_by text, add column confirmed_at timestamptz;
alter table public.expenses add column bir_use boolean;   -- false = left out of the Summary List of Purchases
