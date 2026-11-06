-- How to address a client in text messages: "Sir" or "Mam". Empty = use the title in their name (Mr. / Ms. / Mrs.) when there is one, otherwise just their first name.
alter table public.clients add column if not exists salutation text check (salutation is null or salutation in ('Sir', 'Mam'));
