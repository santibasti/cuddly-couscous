-- The estimate card (a picture) that goes with an AI reply: the address of the PNG made at /api/estimate-card from the rate table.
alter table public.chat_messages add column if not exists card_url text;
