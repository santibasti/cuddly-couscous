-- Bills from before the system started (e.g. last year's service for a repeat client): date, old reference, amount and optional line items,
-- so a repeat quotation can start from them and mention the last bill.
alter table public.clients add column past_bills jsonb not null default '[]';
