-- VIP clients: flagged on the client record and shown on the Job Order (crew and office), with an optional note for the crew ("greet at the lobby", "no work before 9 AM" …).
alter table public.clients add column vip boolean not null default false, add column vip_note text;
