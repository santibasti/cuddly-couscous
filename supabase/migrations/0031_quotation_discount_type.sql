-- Quotations: the overall discount can be entered as a percentage; `discount` stays the peso amount used everywhere.
alter table public.quotations
  add column if not exists discount_type text check (discount_type in ('amount','percent')), add column if not exists discount_percent numeric check (discount_percent >= 0 and discount_percent <= 100);
