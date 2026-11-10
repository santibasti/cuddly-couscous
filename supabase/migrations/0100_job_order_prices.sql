-- Choose what prices the client's Job Order shows, per booking: unset = automatic (hidden after an ocular visit, approved rates otherwise),
-- 'show' = the approved quotation's amounts and totals, 'hide' = no prices. The crew copy never shows prices.
alter table public.jobs add column if not exists jo_prices text check (jo_prices is null or jo_prices in ('show', 'hide'));
