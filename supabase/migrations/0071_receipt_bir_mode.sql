-- Receipts: BIR use is Yes (BIR only: not an expense), No (expense only) or Both.
alter table public.receipts add column bir_mode text check (bir_mode in ('yes','no','both'));
update public.receipts set bir_mode = case when bir_use then 'both' when bir_use = false then 'no' end where bir_use is not null;
